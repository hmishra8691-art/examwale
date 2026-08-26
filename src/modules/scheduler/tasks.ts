/**
 * The task registry.
 *
 * Six of the notification types this platform declares were, before this file
 * existed, unreachable: `mentor.session_reminder`, `exam.deadline_soon`,
 * `roadmap.step_due`, `billing.expiring`, `admin.verification_due` and the job
 * expiry warning. Every one of them is *time-based* — nothing a user does can
 * trigger them, and there was no scheduler to notice the time passing. They were
 * declared, listed on every user's notification preferences screen with a toggle
 * beside them, and could never fire. Switching one off changed nothing because
 * it was already off.
 *
 * That is the shape of the gap this stage closes. The notification machinery,
 * the preference resolution, the delivery channels and the dedupe index were all
 * built; what was missing was anything to notice that Tuesday had arrived.
 *
 * Every task obeys the same three rules, for reasons set out in `runner.ts`:
 * idempotent through `dedupeKey`, bounded by `limit`, and reporting a count and
 * a line of prose rather than succeeding in silence.
 */
import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  examEditions,
  exams,
  jobPostings,
  mentorshipSessions,
  mentors,
  organisationMembers,
  roadmapSteps,
  roadmaps,
  subscriptions,
  users,
  verificationRecords,
} from "@/db/schema";
import { notify } from "@/modules/notifications/service";
import { purgeExpiredBuckets } from "@/modules/shared/rate-limit";
import { expireDuePostings, publishAllApproved } from "@/modules/employers/lifecycle";
import { releaseExpiredHolds } from "@/modules/mentors/service";
import { formatInZone, zoneForUserId } from "@/modules/shared/timezone";
import type { TaskResult } from "@/modules/scheduler/runner";

type TaskContext = { limit: number };

type TaskDefinition = {
  label: string;
  description: string;
  everyMinutes: number;
  /** Row cap for one run, so a backlog cannot blow the function timeout. */
  limit: number;
  run: (context: TaskContext) => Promise<TaskResult>;
};

const HOUR = 60;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// Mentorship session reminders
// ---------------------------------------------------------------------------

/** How far ahead of a session the reminder goes out. */
const SESSION_REMINDER_LEAD_HOURS = 24;

async function remindUpcomingSessions({ limit }: TaskContext): Promise<TaskResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + SESSION_REMINDER_LEAD_HOURS * 3_600_000);

  const upcoming = await db
    .select({
      session: mentorshipSessions,
      mentorUserId: mentors.userId,
      mentorName: users.name,
    })
    .from(mentorshipSessions)
    .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
    .innerJoin(users, eq(users.id, mentors.userId))
    .where(
      and(
        eq(mentorshipSessions.status, "ACCEPTED"),
        gt(mentorshipSessions.scheduledAt, now),
        lte(mentorshipSessions.scheduledAt, horizon),
      ),
    )
    .limit(limit);

  let sent = 0;
  for (const row of upcoming) {
    const when = row.session.scheduledAt;
    /*
     * Both sides get a reminder, and each sees the time in their own zone with
     * the zone named. A reminder that says "10:00" to two people in different
     * countries is worse than no reminder: it manufactures confidence in a time
     * one of them has wrong.
     */
    for (const [userId, counterpartLabel] of [
      [row.session.seekerId, row.mentorName ?? "your mentor"],
      [row.mentorUserId, "your mentee"],
    ] as const) {
      const zone = await zoneForUserId(userId);
      const result = await notify({
        userId,
        type: "mentor.session_reminder",
        title: "Session tomorrow",
        body: `Your session with ${counterpartLabel} is at ${formatInZone(when, zone, {
          withDate: true,
        })}. Topic: ${row.session.topic}.`,
        href: "/dashboard/mentorship",
        // Keyed to the session and the lead time, so a tick every few minutes
        // sends this once rather than once per tick.
        dedupeKey: `mentor.session_reminder:${row.session.id}:${SESSION_REMINDER_LEAD_HOURS}h`,
      });
      if (result && !result.deduped) sent += 1;
    }
  }

  return {
    processed: sent,
    detail:
      upcoming.length === 0
        ? `No accepted sessions in the next ${SESSION_REMINDER_LEAD_HOURS} hours.`
        : `${upcoming.length} session${upcoming.length === 1 ? "" : "s"} upcoming, ${sent} reminder${sent === 1 ? "" : "s"} sent (the rest were already sent).`,
  };
}

// ---------------------------------------------------------------------------
// Exam application deadlines
// ---------------------------------------------------------------------------

const EXAM_DEADLINE_LEAD_DAYS = 7;

async function remindExamDeadlines({ limit }: TaskContext): Promise<TaskResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + EXAM_DEADLINE_LEAD_DAYS * 86_400_000);

  /*
   * Only people who have actually built a study plan for the exam. A deadline
   * reminder for something you glanced at once is spam, and the fastest way to
   * teach someone to ignore this product's notifications.
   */
  const rows = await db
    .selectDistinct({
      userId: sql<string>`sp.user_id`,
      examName: exams.name,
      examSlug: exams.slug,
      editionId: examEditions.id,
      applicationEnd: examEditions.applicationEnd,
    })
    .from(examEditions)
    .innerJoin(exams, eq(exams.id, examEditions.examId))
    // Distinct, because a user with two study plans for one exam is one person
    // to tell, not two — and a count that says otherwise misleads whoever reads
    // the run history.
    .innerJoin(sql`study_plans sp`, sql`sp.exam_id = ${exams.id}`)
    .where(
      and(
        isNotNull(examEditions.applicationEnd),
        gt(examEditions.applicationEnd, now),
        lte(examEditions.applicationEnd, horizon),
      ),
    )
    .limit(limit);

  let sent = 0;
  for (const row of rows) {
    if (!row.applicationEnd) continue;
    const daysLeft = Math.ceil((row.applicationEnd.getTime() - now.getTime()) / 86_400_000);
    const result = await notify({
      userId: row.userId,
      type: "exam.deadline_soon",
      title: `${row.examName} applications close in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
      body: `The application window for ${row.examName} closes on ${row.applicationEnd.toDateString()}. Check the official notification before relying on this date.`,
      href: `/exams/${row.examSlug}`,
      dedupeKey: `exam.deadline_soon:${row.editionId}:${row.userId}`,
    });
    if (result && !result.deduped) sent += 1;
  }

  return {
    processed: sent,
    detail:
      rows.length === 0
        ? `No tracked exams closing within ${EXAM_DEADLINE_LEAD_DAYS} days.`
        : `${rows.length} person-deadline pair${rows.length === 1 ? "" : "s"} approaching, ${sent} new reminder${sent === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Roadmap steps coming due
// ---------------------------------------------------------------------------

const ROADMAP_STEP_LEAD_DAYS = 3;

async function remindRoadmapSteps({ limit }: TaskContext): Promise<TaskResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + ROADMAP_STEP_LEAD_DAYS * 86_400_000);

  const rows = await db
    .select({
      stepId: roadmapSteps.id,
      stepTitle: roadmapSteps.title,
      targetDate: roadmapSteps.targetDate,
      roadmapId: roadmaps.id,
      roadmapTitle: roadmaps.title,
      userId: roadmaps.userId,
    })
    .from(roadmapSteps)
    .innerJoin(roadmaps, eq(roadmaps.id, roadmapSteps.roadmapId))
    .where(
      and(
        // Done steps and abandoned ones are not reminders waiting to happen.
        inArray(roadmapSteps.status, ["NOT_STARTED", "IN_PROGRESS"]),
        isNotNull(roadmapSteps.targetDate),
        gt(roadmapSteps.targetDate, now),
        lte(roadmapSteps.targetDate, horizon),
      ),
    )
    .limit(limit);

  let sent = 0;
  for (const row of rows) {
    const result = await notify({
      userId: row.userId,
      type: "roadmap.step_due",
      title: "A roadmap step is due soon",
      body: `"${row.stepTitle}" in ${row.roadmapTitle} is due ${row.targetDate?.toDateString()}. If the date has slipped, move it — a roadmap you have stopped believing is worse than none.`,
      href: `/dashboard/roadmaps/${row.roadmapId}`,
      dedupeKey: `roadmap.step_due:${row.stepId}`,
    });
    if (result && !result.deduped) sent += 1;
  }

  return {
    processed: sent,
    detail:
      rows.length === 0
        ? `No open steps due within ${ROADMAP_STEP_LEAD_DAYS} days.`
        : `${rows.length} step${rows.length === 1 ? "" : "s"} due soon, ${sent} new reminder${sent === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Subscriptions ending
// ---------------------------------------------------------------------------

const BILLING_LEAD_DAYS = 7;

async function remindExpiringSubscriptions({ limit }: TaskContext): Promise<TaskResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + BILLING_LEAD_DAYS * 86_400_000);

  const rows = await db
    .select({
      id: subscriptions.id,
      userId: subscriptions.userId,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
    })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.status, "ACTIVE"),
        gt(subscriptions.currentPeriodEnd, now),
        lte(subscriptions.currentPeriodEnd, horizon),
      ),
    )
    .limit(limit);

  let sent = 0;
  for (const row of rows) {
    const result = await notify({
      userId: row.userId,
      type: "billing.expiring",
      title: "Your plan ends soon",
      body: `Your subscription runs until ${row.currentPeriodEnd.toDateString()}. Nothing you have saved is deleted when it ends — the paid allowances simply return to the free limits.`,
      href: "/dashboard/billing",
      dedupeKey: `billing.expiring:${row.id}:${row.currentPeriodEnd.toISOString()}`,
    });
    if (result && !result.deduped) sent += 1;
  }

  return {
    processed: sent,
    detail:
      rows.length === 0
        ? `No active subscriptions ending within ${BILLING_LEAD_DAYS} days.`
        : `${rows.length} ending soon, ${sent} new reminder${sent === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Job postings approaching their deadline
// ---------------------------------------------------------------------------

const JOB_EXPIRY_LEAD_DAYS = 5;

async function warnJobExpiry({ limit }: TaskContext): Promise<TaskResult> {
  const now = new Date();
  const horizon = new Date(now.getTime() + JOB_EXPIRY_LEAD_DAYS * 86_400_000);

  /*
   * Only employer-posted listings. A seeded or admin-entered posting has no
   * owner to warn, and telling an admin that one of two hundred seeded rows is
   * about to lapse is noise rather than information.
   */
  const rows = await db
    .select({
      id: jobPostings.id,
      title: jobPostings.title,
      slug: jobPostings.slug,
      expiresAt: jobPostings.expiresAt,
      organisationId: jobPostings.organisationId,
      createdById: jobPostings.createdById,
    })
    .from(jobPostings)
    .where(
      and(
        eq(jobPostings.status, "ACTIVE"),
        isNotNull(jobPostings.organisationId),
        isNotNull(jobPostings.expiresAt),
        gt(jobPostings.expiresAt, now),
        lte(jobPostings.expiresAt, horizon),
      ),
    )
    .limit(limit);

  let sent = 0;
  let orphaned = 0;
  for (const row of rows) {
    // Everyone who can act on it, not only whoever happened to create it — the
    // person who posted a role may well have left by the time it lapses.
    const recipients = row.organisationId
      ? await db
          .select({ userId: organisationMembers.userId })
          .from(organisationMembers)
          .where(eq(organisationMembers.organisationId, row.organisationId))
      : [];
    if (row.createdById) recipients.push({ userId: row.createdById });

    const unique = new Map(recipients.filter((r) => r.userId).map((r) => [r.userId, r]));
    if (unique.size === 0) {
      // An organisation with no members left and no recorded author. Counted and
      // named, because "0 warnings sent" and "nobody to send warnings to" are
      // different problems and only one of them is a data-integrity issue.
      orphaned += 1;
      continue;
    }

    const days = Math.ceil(((row.expiresAt?.getTime() ?? 0) - now.getTime()) / 86_400_000);
    for (const recipient of unique.values()) {
      const result = await notify({
        userId: recipient.userId,
        type: "job.expiring_soon",
        title: `"${row.title}" stops accepting applications in ${days} day${days === 1 ? "" : "s"}`,
        body: `The posting closes on ${row.expiresAt?.toDateString()}. Applications already received stay in your dashboard — extend the deadline if the role is still open.`,
        href: `/employers/dashboard/jobs/${row.id}`,
        dedupeKey: `job.expiring_soon:${row.id}:${row.expiresAt?.toISOString()}`,
      });
      if (result && !result.deduped) sent += 1;
    }
  }

  const orphanNote = orphaned
    ? ` ${orphaned} posting${orphaned === 1 ? " has" : "s have"} no reachable owner — check the organisation's members.`
    : "";

  return {
    processed: sent,
    detail:
      rows.length === 0
        ? `No employer postings closing within ${JOB_EXPIRY_LEAD_DAYS} days.`
        : `${rows.length} posting${rows.length === 1 ? "" : "s"} closing soon, ${sent} new warning${sent === 1 ? "" : "s"}.${orphanNote}`,
  };
}

// ---------------------------------------------------------------------------
// Job postings past their deadline
// ---------------------------------------------------------------------------

/**
 * Move live postings past their deadline to EXPIRED, and close their period.
 *
 * Worth being clear about what this is *not* for: expired postings already stop
 * being public the moment their deadline passes, because `liveJobCondition()`
 * checks `expires_at` at read time. Correctness does not depend on this task
 * having run. What it does is make the employer's dashboard, the moderation
 * queue and the publication history agree with reality, and tell the owner —
 * none of which a read-time filter can do.
 */
async function expireJobPostings({ limit }: TaskContext): Promise<TaskResult> {
  const result = await expireDuePostings(limit);
  return {
    processed: result.expired,
    detail:
      result.expired === 0
        ? "No live postings past their deadline."
        : `Expired ${result.expired} posting${result.expired === 1 ? "" : "s"} (${result.notified} owner${result.notified === 1 ? "" : "s"} told): ${result.titles.slice(0, 3).join(", ")}${result.titles.length > 3 ? `, and ${result.titles.length - 3} more` : ""}.`,
  };
}

/**
 * Publish anything that passed moderation and was only waiting on the
 * organisation being verified.
 *
 * Normally handled the moment verification is granted; this is the backstop for
 * a posting approved *after* verification, or one that failed its publish
 * attempt for a transient reason. Without it, APPROVED would be a state
 * postings could enter and never leave.
 */
async function publishWaitingPostings({ limit }: TaskContext): Promise<TaskResult> {
  const published = await publishAllApproved(limit);
  return {
    processed: published,
    detail:
      published === 0
        ? "Nothing approved is waiting on verification."
        : `Published ${published} posting${published === 1 ? "" : "s"} whose organisation is now verified.`,
  };
}

// ---------------------------------------------------------------------------
// Verification records that have gone stale
// ---------------------------------------------------------------------------

async function flagStaleVerifications({ limit }: TaskContext): Promise<TaskResult> {
  const now = new Date();

  const stale = await db
    .select({ id: verificationRecords.id, entity: verificationRecords.entityType })
    .from(verificationRecords)
    .where(
      and(
        eq(verificationRecords.status, "VERIFIED"),
        isNotNull(verificationRecords.expiresAt),
        lt(verificationRecords.expiresAt, now),
      ),
    )
    .limit(limit);

  if (stale.length === 0) {
    return { processed: 0, detail: "No verifications have lapsed." };
  }

  // One notification to the admins rather than one per record: a queue of forty
  // stale records is a single piece of news, and forty rows in the bell is how
  // people learn to stop looking at it.
  const admins = await db
    .select({ id: users.id })
    .from(users)
    .where(inArray(users.role, ["ADMIN", "SUPER_ADMIN"]));

  const dayKey = now.toISOString().slice(0, 10);
  let sent = 0;
  for (const admin of admins) {
    const result = await notify({
      userId: admin.id,
      type: "admin.verification_due",
      title: `${stale.length} record${stale.length === 1 ? "" : "s"} need re-verification`,
      body: `Verification has lapsed on ${stale.length} record${stale.length === 1 ? "" : "s"}. Published facts with expired sources should be re-checked or unpublished.`,
      href: "/admin/verification",
      dedupeKey: `admin.verification_due:${dayKey}`,
    });
    if (result && !result.deduped) sent += 1;
  }

  return {
    processed: stale.length,
    detail: `${stale.length} lapsed record${stale.length === 1 ? "" : "s"}, ${sent} admin${sent === 1 ? "" : "s"} told.`,
  };
}

/**
 * Give back slots whose hold ran out.
 *
 * As with job expiry, this is bookkeeping rather than correctness: an expired
 * hold already stops reserving its slot, because `slotOccupancy` checks the
 * expiry when it reads. This clears the rows so the table does not accumulate a
 * record of every abandoned booking form, and so a mentor's session list is not
 * full of ten-minute ghosts.
 */
async function releaseStaleHolds({ limit }: TaskContext): Promise<TaskResult> {
  const released = await releaseExpiredHolds(limit);
  return {
    processed: released,
    detail:
      released === 0
        ? "No lapsed slot holds."
        : `Released ${released} lapsed slot hold${released === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

async function purgeRateLimitBuckets(): Promise<TaskResult> {
  const removed = await purgeExpiredBuckets();
  return {
    processed: removed,
    detail:
      removed === 0
        ? "No expired rate-limit buckets."
        : `Dropped ${removed} expired rate-limit bucket${removed === 1 ? "" : "s"}.`,
  };
}

/**
 * Trim the run history.
 *
 * Kept generous — a scheduler's own history is the first thing anyone reads when
 * something has been quietly broken, and ninety days is about the window in
 * which "when did this stop working?" is still a live question.
 */
const RUN_HISTORY_DAYS = 90;

async function purgeOldRuns(): Promise<TaskResult> {
  const result = await db.execute(
    sql`DELETE FROM scheduled_task_runs
        WHERE started_at < now() - make_interval(days => ${RUN_HISTORY_DAYS})`,
  );
  const removed = result.rowCount ?? 0;
  return {
    processed: removed,
    detail:
      removed === 0
        ? `Nothing older than ${RUN_HISTORY_DAYS} days.`
        : `Trimmed ${removed} run record${removed === 1 ? "" : "s"}.`,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Declaration order is run order within a tick, so the cheap housekeeping sits
 * last and a slow sweep never delays a reminder someone is waiting on.
 */
export const TASKS = {
  "mentor-session-reminders": {
    label: "Session reminders",
    description: `Reminds both sides of an accepted mentorship session ${SESSION_REMINDER_LEAD_HOURS} hours ahead, each in their own timezone.`,
    everyMinutes: HOUR,
    limit: 200,
    run: remindUpcomingSessions,
  },
  "expire-job-postings": {
    label: "Job expiry",
    description:
      "Moves live postings past their deadline to expired and closes their publication period. Applications are kept.",
    everyMinutes: HOUR,
    limit: 200,
    run: expireJobPostings,
  },
  "publish-approved-postings": {
    label: "Publish approved postings",
    description:
      "Publishes postings that passed moderation and were only waiting on their organisation being verified.",
    everyMinutes: 6 * HOUR,
    limit: 100,
    run: publishWaitingPostings,
  },
  "job-expiry-warnings": {
    label: "Job expiry warnings",
    description: `Warns an employer's team ${JOB_EXPIRY_LEAD_DAYS} days before a posting stops accepting applications.`,
    everyMinutes: 12 * HOUR,
    limit: 200,
    run: warnJobExpiry,
  },
  "exam-deadline-reminders": {
    label: "Exam deadline reminders",
    description: `Tells anyone with a study plan for an exam that its application window closes within ${EXAM_DEADLINE_LEAD_DAYS} days.`,
    everyMinutes: 12 * HOUR,
    limit: 500,
    run: remindExamDeadlines,
  },
  "roadmap-step-reminders": {
    label: "Roadmap step reminders",
    description: `Nudges an open roadmap step ${ROADMAP_STEP_LEAD_DAYS} days before its target date.`,
    everyMinutes: DAY,
    limit: 500,
    run: remindRoadmapSteps,
  },
  "billing-expiry-reminders": {
    label: "Plan expiry reminders",
    description: `Tells a subscriber ${BILLING_LEAD_DAYS} days before their period ends what actually changes.`,
    everyMinutes: DAY,
    limit: 500,
    run: remindExpiringSubscriptions,
  },
  "verification-sweep": {
    label: "Stale verification sweep",
    description: "Tells admins, once a day at most, how many published facts have lapsed verification.",
    everyMinutes: DAY,
    limit: 1000,
    run: flagStaleVerifications,
  },
  "release-slot-holds": {
    label: "Release lapsed slot holds",
    description:
      "Clears reservations nobody completed. The slot is already free at read time; this tidies the rows.",
    everyMinutes: 15,
    limit: 500,
    run: releaseStaleHolds,
  },
  "purge-rate-limits": {
    label: "Rate-limit housekeeping",
    description: "Drops rate-limit buckets whose window closed over an hour ago.",
    everyMinutes: 6 * HOUR,
    limit: 0,
    run: purgeRateLimitBuckets,
  },
  "purge-old-runs": {
    label: "Run-history housekeeping",
    description: `Trims this table to the last ${RUN_HISTORY_DAYS} days.`,
    everyMinutes: DAY,
    limit: 0,
    run: purgeOldRuns,
  },
} satisfies Record<string, TaskDefinition>;

export type TaskName = keyof typeof TASKS;

export function isTaskName(value: string): value is TaskName {
  return Object.prototype.hasOwnProperty.call(TASKS, value);
}
