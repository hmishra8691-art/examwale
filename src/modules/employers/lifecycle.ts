/**
 * The job posting lifecycle.
 *
 * One module that owns which transitions are legal and what each one does to the
 * publication history. Before this the lifecycle was spread across two columns
 * and six functions, each setting whatever pair of values it happened to need —
 * which is how a posting could end up ACTIVE and REJECTED at the same time, two
 * updates apart, with nothing to stop it.
 *
 * Two rules hold everywhere below:
 *
 *  - **Nothing is destroyed.** Expiring, closing, suspending and archiving all
 *    end a publication *period*; the posting and every application against it
 *    stay exactly where they were. Reviving opens a new period rather than
 *    reopening the old one, so "posted four times in eight months" remains a
 *    fact anybody can read.
 *  - **Read-time checks stay.** `liveJobCondition()` still filters on
 *    `expires_at` as well as status, so a posting past its deadline stops being
 *    public the moment the deadline passes — not whenever the scheduler next
 *    runs. The scheduler moves the status so dashboards and queues tell the
 *    truth; it is not what keeps expired work off the board.
 */
import { and, asc, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  jobModerationReviews,
  jobPostings,
  jobPublicationPeriods,
  organisations,
} from "@/db/schema";
import { ConflictError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";

export type JobStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "ACTIVE"
  | "REJECTED"
  | "EXPIRED"
  | "CLOSED"
  | "SUSPENDED"
  | "ARCHIVED";

/** How long a published posting runs before it expires, per the brief. */
export const PUBLICATION_DAYS = 30;

/**
 * What each status means to the person looking at it, and how it reads.
 *
 * Held here rather than in each component so the employer dashboard, the
 * moderation queue and the admin console cannot describe the same state three
 * different ways.
 */
export const STATUS_META: Record<
  JobStatus,
  { label: string; tone: "good" | "warn" | "bad" | "neutral" | "brand"; blurb: string }
> = {
  DRAFT: {
    label: "Draft",
    tone: "neutral",
    blurb: "Only your organisation can see this. Submit it when it is ready.",
  },
  SUBMITTED: {
    label: "Submitted",
    tone: "brand",
    blurb: "Waiting for a moderator to pick it up.",
  },
  UNDER_REVIEW: {
    label: "Under review",
    tone: "brand",
    blurb: "A moderator has it open now.",
  },
  APPROVED: {
    label: "Approved, not yet live",
    tone: "warn",
    blurb:
      "Moderation passed. It goes live automatically as soon as your organisation is verified.",
  },
  ACTIVE: { label: "Live", tone: "good", blurb: "Visible to job-seekers and accepting applications." },
  REJECTED: {
    label: "Not approved",
    tone: "bad",
    blurb: "See the reason below. Editing it moves it back to draft so you can resubmit.",
  },
  EXPIRED: {
    label: "Expired",
    tone: "warn",
    blurb: "Past its deadline. Applications already received are kept — revive it to run again.",
  },
  CLOSED: {
    label: "Closed",
    tone: "neutral",
    blurb: "You closed this. Applications are kept; revive it if the role reopens.",
  },
  SUSPENDED: {
    label: "Suspended",
    tone: "bad",
    blurb: "Taken down by a moderator. See the reason below.",
  },
  ARCHIVED: {
    label: "Archived",
    tone: "neutral",
    blurb: "Put away. Nothing is lost — restore it whenever you want.",
  },
};

/**
 * Which moves are legal from each state.
 *
 * Written out rather than inferred, because the interesting cases are the ones a
 * general rule gets wrong. A REJECTED posting can be edited back to DRAFT but
 * not published. A SUSPENDED one cannot be revived by its owner at all — that
 * is a moderator's decision to reverse. An ARCHIVED one can be restored to
 * whatever it was, which is why RESTORE is separate from REVIVE.
 */
const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  DRAFT: ["SUBMITTED", "ARCHIVED"],
  SUBMITTED: ["UNDER_REVIEW", "APPROVED", "ACTIVE", "REJECTED", "DRAFT", "ARCHIVED"],
  UNDER_REVIEW: ["APPROVED", "ACTIVE", "REJECTED", "DRAFT", "ARCHIVED"],
  APPROVED: ["ACTIVE", "REJECTED", "DRAFT", "ARCHIVED"],
  ACTIVE: ["EXPIRED", "CLOSED", "SUSPENDED", "ARCHIVED"],
  REJECTED: ["DRAFT", "ARCHIVED"],
  EXPIRED: ["ACTIVE", "CLOSED", "ARCHIVED", "DRAFT"],
  CLOSED: ["ACTIVE", "ARCHIVED", "DRAFT"],
  // Only a moderator lifts a suspension, and the posting goes back to review
  // rather than straight to live.
  SUSPENDED: ["UNDER_REVIEW", "REJECTED", "ARCHIVED"],
  ARCHIVED: ["DRAFT", "ACTIVE", "EXPIRED", "CLOSED"],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function assertTransition(from: JobStatus, to: JobStatus) {
  if (from === to) throw new ConflictError(`That posting is already ${STATUS_META[to].label.toLowerCase()}.`);
  if (!canTransition(from, to)) {
    throw new ConflictError(
      `A ${STATUS_META[from].label.toLowerCase()} posting cannot become ${STATUS_META[to].label.toLowerCase()}.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Publication periods
// ---------------------------------------------------------------------------

export async function currentPeriod(jobPostingId: string) {
  const [row] = await db
    .select()
    .from(jobPublicationPeriods)
    .where(and(eq(jobPublicationPeriods.jobPostingId, jobPostingId), isNull(jobPublicationPeriods.endedAt)))
    .limit(1);
  return row ?? null;
}

export async function publicationHistory(jobPostingId: string) {
  return db
    .select()
    .from(jobPublicationPeriods)
    .where(eq(jobPublicationPeriods.jobPostingId, jobPostingId))
    .orderBy(asc(jobPublicationPeriods.sequence));
}

/**
 * Open a publication period, closing any that was somehow still open.
 *
 * The unique partial index makes two open periods impossible, so the close-first
 * step is not belt-and-braces — it is what stops a revival failing on a
 * constraint because an earlier transition did not tidy up.
 */
async function openPeriod(input: {
  jobPostingId: string;
  expiresAt: Date;
  revivedById?: string | null;
}) {
  return db.transaction(async (tx) => {
    await tx
      .update(jobPublicationPeriods)
      .set({ endedAt: new Date(), endedReason: "SUPERSEDED" })
      .where(
        and(
          eq(jobPublicationPeriods.jobPostingId, input.jobPostingId),
          isNull(jobPublicationPeriods.endedAt),
        ),
      );

    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${jobPublicationPeriods.sequence}), 0) + 1` })
      .from(jobPublicationPeriods)
      .where(eq(jobPublicationPeriods.jobPostingId, input.jobPostingId));

    const [period] = await tx
      .insert(jobPublicationPeriods)
      .values({
        jobPostingId: input.jobPostingId,
        sequence: Number(next),
        expiresAt: input.expiresAt,
        revivedById: input.revivedById ?? null,
      })
      .returning();
    return period;
  });
}

async function closePeriod(jobPostingId: string, reason: "EXPIRED" | "CLOSED" | "SUSPENDED" | "ARCHIVED") {
  await db
    .update(jobPublicationPeriods)
    .set({ endedAt: new Date(), endedReason: reason })
    .where(
      and(eq(jobPublicationPeriods.jobPostingId, jobPostingId), isNull(jobPublicationPeriods.endedAt)),
    );
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

async function loadPosting(jobId: string) {
  const [posting] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1);
  if (!posting) throw new NotFoundError("That posting doesn't exist.");
  return posting;
}

/** Whether the organisation behind a posting is verified. The publish gate. */
async function organisationVerified(organisationId: string | null): Promise<boolean> {
  if (!organisationId) return false;
  const [org] = await db
    .select({ status: organisations.verificationStatus })
    .from(organisations)
    .where(eq(organisations.id, organisationId))
    .limit(1);
  return org?.status === "VERIFIED";
}

/**
 * Publish a posting: ACTIVE, with a fresh 30-day period.
 *
 * Refuses unless the organisation is verified — the same gate as before, but the
 * caller now has somewhere to put a posting that has passed moderation and is
 * only waiting on that (see `approve`).
 */
export async function publish(input: {
  jobId: string;
  actorId: string;
  actorType: "admin" | "user";
  revival?: boolean;
}) {
  const posting = await loadPosting(input.jobId);
  assertTransition(posting.status as JobStatus, "ACTIVE");

  if (!(await organisationVerified(posting.organisationId))) {
    throw new ValidationError(
      "The organisation behind this posting is not verified, so it cannot go live yet.",
    );
  }

  /*
   * THE GATE. Both conditions, on every path that can make a posting public.
   *
   * The organisation being verified was the only check here, which is a check on
   * *who is posting* and says nothing about *what they are posting*. A separate
   * `assertPublishable` existed in the employers module carrying exactly this
   * docstring and was called from nowhere — the intent had been written down and
   * then lost. Combined with an edit path that left a CLOSED posting's approval
   * intact, that let arbitrary unreviewed text reach the public board through
   * close → edit → revive.
   *
   * A seeded or admin-entered posting has no organisation and never went through
   * employer moderation, so the requirement applies only to employer postings.
   */
  if (posting.organisationId) {
    const [approval] = await db
      .select({ id: jobModerationReviews.id })
      .from(jobModerationReviews)
      .where(
        and(
          eq(jobModerationReviews.jobPostingId, posting.id),
          eq(jobModerationReviews.decision, "approve"),
        ),
      )
      .orderBy(desc(jobModerationReviews.createdAt))
      .limit(1);

    if (!approval) {
      throw new ValidationError(
        "This posting has not been approved by a moderator, so it cannot go live.",
      );
    }
  }

  const expiresAt = new Date(Date.now() + PUBLICATION_DAYS * 86_400_000);
  const period = await openPeriod({
    jobPostingId: posting.id,
    expiresAt,
    revivedById: input.revival ? input.actorId : null,
  });

  await db
    .update(jobPostings)
    .set({ status: "ACTIVE", postedAt: new Date(), expiresAt })
    .where(eq(jobPostings.id, posting.id));

  await recordAudit({
    actorType: input.actorType,
    actorId: input.actorId,
    action: input.revival ? "job.revived" : "job.published",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: posting.status },
    after: { status: "ACTIVE", period: period.sequence, expiresAt },
  });

  if (posting.createdById) {
    await notify({
      userId: posting.createdById,
      type: "job.posting_approved",
      title: input.revival ? "Your posting is live again" : "Your posting is live",
      body: `"${posting.title}" is visible to job-seekers and runs until ${expiresAt.toDateString()}.`,
      href: `/jobs/${posting.slug}`,
      dedupeKey: `job.published:${posting.id}:${period.sequence}`,
    });
  }

  return { period, expiresAt };
}

/**
 * Moderation passed.
 *
 * Publishes if it can, and lands on APPROVED if the organisation is not verified
 * yet. That second outcome is the point: before this state existed, approving
 * such a posting threw an error and left it sitting in DRAFT with no record that
 * it had passed review — so the work was repeated the next time somebody looked
 * at the queue.
 */
export async function approve(input: { jobId: string; adminId: string; note?: string | null }) {
  const posting = await loadPosting(input.jobId);

  await db.insert(jobModerationReviews).values({
    jobPostingId: posting.id,
    reviewerId: input.adminId,
    decision: "approve",
    reason: input.note ?? null,
  });

  if (await organisationVerified(posting.organisationId)) {
    await publish({ jobId: posting.id, actorId: input.adminId, actorType: "admin" });
    return { status: "ACTIVE" as JobStatus };
  }

  assertTransition(posting.status as JobStatus, "APPROVED");
  await db.update(jobPostings).set({ status: "APPROVED" }).where(eq(jobPostings.id, posting.id));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "job.approved_pending_verification",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: posting.status },
    after: { status: "APPROVED" },
  });

  if (posting.createdById) {
    await notify({
      userId: posting.createdById,
      type: "job.posting_approved",
      title: "Approved — waiting on your organisation",
      body: `"${posting.title}" passed moderation. It goes live automatically once your organisation is verified.`,
      href: `/employers/dashboard/jobs/${posting.id}`,
      dedupeKey: `job.approved_pending:${posting.id}`,
    });
  }

  return { status: "APPROVED" as JobStatus };
}

/** A moderator picks a submission up. Distinct so a queue shows real progress. */
export async function startReview(input: { jobId: string; adminId: string }) {
  const posting = await loadPosting(input.jobId);
  assertTransition(posting.status as JobStatus, "UNDER_REVIEW");

  await db.update(jobPostings).set({ status: "UNDER_REVIEW" }).where(eq(jobPostings.id, posting.id));
  await db.insert(jobModerationReviews).values({
    jobPostingId: posting.id,
    reviewerId: input.adminId,
    decision: "under_review",
  });
  return { status: "UNDER_REVIEW" as JobStatus };
}

/**
 * Refuse, or ask for changes.
 *
 * Two outcomes from one place because the difference matters to the employer and
 * nothing else: `requestChanges` returns it to DRAFT so they can edit and
 * resubmit, `reject` closes it. Both require a reason — an unexplained refusal
 * is not something anybody can act on.
 */
export async function refuse(input: {
  jobId: string;
  adminId: string;
  reason: string;
  outcome: "REJECTED" | "DRAFT";
}) {
  if (!input.reason?.trim()) {
    throw new ValidationError("Say why. A refusal without a reason is not actionable.");
  }
  const posting = await loadPosting(input.jobId);
  assertTransition(posting.status as JobStatus, input.outcome);

  await db.insert(jobModerationReviews).values({
    jobPostingId: posting.id,
    reviewerId: input.adminId,
    decision: input.outcome === "REJECTED" ? "reject" : "request_changes",
    reason: input.reason.trim(),
  });

  await db.update(jobPostings).set({ status: input.outcome }).where(eq(jobPostings.id, posting.id));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: input.outcome === "REJECTED" ? "job.rejected" : "job.changes_requested",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: posting.status },
    after: { status: input.outcome, reason: input.reason },
  });

  if (posting.createdById) {
    await notify({
      userId: posting.createdById,
      type: "job.posting_approved",
      title: input.outcome === "REJECTED" ? "Posting not approved" : "Changes needed on your posting",
      body: input.reason.trim(),
      href: `/employers/dashboard/jobs/${posting.id}`,
      dedupeKey: `job.refused:${posting.id}:${Date.now()}`,
    });
  }

  return { status: input.outcome };
}

/** Take a live posting down. A moderator decision, reversible only by one. */
export async function suspend(input: { jobId: string; adminId: string; reason: string }) {
  if (!input.reason?.trim()) {
    throw new ValidationError("Say why. A suspension without a reason is not reviewable.");
  }
  const posting = await loadPosting(input.jobId);
  assertTransition(posting.status as JobStatus, "SUSPENDED");

  await closePeriod(posting.id, "SUSPENDED");
  await db.update(jobPostings).set({ status: "SUSPENDED" }).where(eq(jobPostings.id, posting.id));
  await db.insert(jobModerationReviews).values({
    jobPostingId: posting.id,
    reviewerId: input.adminId,
    decision: "suspend",
    reason: input.reason.trim(),
  });

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "job.suspended",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: posting.status },
    after: { status: "SUSPENDED", reason: input.reason },
  });

  if (posting.createdById) {
    await notify({
      userId: posting.createdById,
      type: "job.posting_approved",
      title: "Your posting has been suspended",
      body: `"${posting.title}" has been taken down. ${input.reason.trim()}`,
      href: `/employers/dashboard/jobs/${posting.id}`,
      dedupeKey: `job.suspended:${posting.id}`,
    });
  }
  return { status: "SUSPENDED" as JobStatus };
}

/** The employer closes it — role filled, or withdrawn. */
export async function close(input: { jobId: string; actorId: string }) {
  const posting = await loadPosting(input.jobId);
  assertTransition(posting.status as JobStatus, "CLOSED");

  await closePeriod(posting.id, "CLOSED");
  await db.update(jobPostings).set({ status: "CLOSED" }).where(eq(jobPostings.id, posting.id));

  await recordAudit({
    actorType: "user",
    actorId: input.actorId,
    action: "job.closed",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: posting.status },
    after: { status: "CLOSED" },
  });
  return { status: "CLOSED" as JobStatus };
}

/** Put it away. Recoverable, and the history stays. */
export async function archive(input: {
  jobId: string;
  actorId: string;
  actorType: "admin" | "user";
}) {
  const posting = await loadPosting(input.jobId);
  assertTransition(posting.status as JobStatus, "ARCHIVED");

  await closePeriod(posting.id, "ARCHIVED");
  await db.update(jobPostings).set({ status: "ARCHIVED" }).where(eq(jobPostings.id, posting.id));

  await recordAudit({
    actorType: input.actorType,
    actorId: input.actorId,
    action: "job.archived",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: posting.status },
    after: { status: "ARCHIVED" },
  });
  return { status: "ARCHIVED" as JobStatus };
}

/**
 * Bring an archived posting back to editable state.
 *
 * Deliberately not straight to live: an archived posting has usually been away
 * long enough that its salary, deadline and contact are worth a second look
 * before anybody applies to it.
 */
export async function restore(input: { jobId: string; actorId: string }) {
  const posting = await loadPosting(input.jobId);
  if (posting.status !== "ARCHIVED") {
    throw new ConflictError("Only an archived posting can be restored.");
  }
  await db.update(jobPostings).set({ status: "DRAFT" }).where(eq(jobPostings.id, posting.id));

  await recordAudit({
    actorType: "user",
    actorId: input.actorId,
    action: "job.restored",
    entityType: "job_posting",
    entityId: posting.id,
    before: { status: "ARCHIVED" },
    after: { status: "DRAFT" },
  });
  return { status: "DRAFT" as JobStatus };
}

/**
 * Run an expired or closed posting again.
 *
 * A new publication period, a fresh deadline, and every application from the
 * previous runs still attached. It does not go back through moderation: the
 * posting already passed, and making an employer requeue an unchanged role
 * every thirty days is the kind of friction that teaches people to keep
 * postings open by editing the deadline instead — which loses the history this
 * table exists to keep. Editing a posting *does* return it to DRAFT, so a
 * changed role is reviewed again.
 */
export async function revive(input: { jobId: string; actorId: string }) {
  const posting = await loadPosting(input.jobId);
  if (posting.status !== "EXPIRED" && posting.status !== "CLOSED") {
    throw new ConflictError(
      posting.status === "SUSPENDED"
        ? "A suspended posting cannot be revived here — a moderator has to lift the suspension."
        : "Only an expired or closed posting can be revived.",
    );
  }
  return publish({ jobId: posting.id, actorId: input.actorId, actorType: "user", revival: true });
}

// ---------------------------------------------------------------------------
// Scheduled expiry
// ---------------------------------------------------------------------------

/**
 * Move live postings past their deadline to EXPIRED.
 *
 * Called by the scheduler. Note what this does *not* do: it does not make
 * expired postings stop being public — `liveJobCondition()` already handles that
 * at read time, the moment the deadline passes. This exists so the employer's
 * dashboard, the moderation queue and the publication history agree with
 * reality, and so the owner gets told.
 *
 * Bounded, and orders by deadline so the longest-overdue are dealt with first
 * when there is a backlog.
 */
export async function expireDuePostings(limit: number): Promise<{
  expired: number;
  notified: number;
  titles: string[];
}> {
  const due = await db
    .select({
      id: jobPostings.id,
      title: jobPostings.title,
      slug: jobPostings.slug,
      createdById: jobPostings.createdById,
      expiresAt: jobPostings.expiresAt,
    })
    .from(jobPostings)
    .where(
      and(
        eq(jobPostings.status, "ACTIVE"),
        lte(jobPostings.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(jobPostings.expiresAt))
    .limit(limit);

  let notified = 0;
  for (const posting of due) {
    await closePeriod(posting.id, "EXPIRED");
    await db.update(jobPostings).set({ status: "EXPIRED" }).where(eq(jobPostings.id, posting.id));

    await recordAudit({
      actorType: "system",
      action: "job.expired",
      entityType: "job_posting",
      entityId: posting.id,
      before: { status: "ACTIVE" },
      after: { status: "EXPIRED", deadline: posting.expiresAt },
    });

    if (posting.createdById) {
      const result = await notify({
        userId: posting.createdById,
        type: "job.expiring_soon",
        title: `"${posting.title}" has stopped accepting applications`,
        body: `It reached its deadline. Everything applicants sent is still in your dashboard, and you can run the posting again from there without going back through review.`,
        href: `/employers/dashboard/jobs/${posting.id}`,
        dedupeKey: `job.expired:${posting.id}:${posting.expiresAt?.toISOString()}`,
      });
      if (result && !result.deduped) notified += 1;
    }
  }

  return { expired: due.length, notified, titles: due.map((p) => p.title) };
}

/**
 * Publish anything that was only waiting on organisation verification.
 *
 * Called when an organisation becomes verified, and by the scheduler as a
 * backstop. Without this an APPROVED posting would sit there indefinitely after
 * the thing blocking it was resolved, which is the failure mode the state was
 * introduced to avoid in the first place.
 */
export async function publishApprovedForOrganisation(input: {
  organisationId: string;
  actorId: string;
}): Promise<number> {
  const waiting = await db
    .select({ id: jobPostings.id })
    .from(jobPostings)
    .where(
      and(eq(jobPostings.status, "APPROVED"), eq(jobPostings.organisationId, input.organisationId)),
    );

  let published = 0;
  for (const posting of waiting) {
    try {
      await publish({ jobId: posting.id, actorId: input.actorId, actorType: "admin" });
      published += 1;
    } catch {
      // One posting failing its own check must not stop the rest.
    }
  }
  return published;
}

/** Every APPROVED posting whose organisation has since been verified. */
export async function publishAllApproved(limit: number): Promise<number> {
  const rows = await db
    .select({ id: jobPostings.id })
    .from(jobPostings)
    .innerJoin(organisations, eq(organisations.id, jobPostings.organisationId))
    .where(and(eq(jobPostings.status, "APPROVED"), eq(organisations.verificationStatus, "VERIFIED")))
    .limit(limit);

  let published = 0;
  for (const row of rows) {
    try {
      await publish({ jobId: row.id, actorId: "system", actorType: "admin" });
      published += 1;
    } catch {
      // Logged by the caller's run record; one bad row is not a failed sweep.
    }
  }
  return published;
}

/** Most recent moderation note, for the employer's own screen. */
export async function latestModerationNote(jobPostingId: string) {
  const [row] = await db
    .select()
    .from(jobModerationReviews)
    .where(eq(jobModerationReviews.jobPostingId, jobPostingId))
    .orderBy(desc(jobModerationReviews.createdAt))
    .limit(1);
  return row ?? null;
}
