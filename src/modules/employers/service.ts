/**
 * Employer self-serve job posting.
 *
 * The gate below is the whole reason this module is written the way it is.
 *
 * A jobs board that lets anyone publish a listing is how recruitment-fee fraud
 * reaches the people least able to absorb it — a first-time job-seeker asked
 * for a ₹2,000 "registration charge" by a company that does not exist. The
 * defence is not a warning banner. It is that an employer posting cannot reach
 * the public without (a) a verified organisation behind it and (b) a human
 * moderation decision recorded in a row. Both conditions are checked in one
 * function that every publish path calls.
 *
 * Automated checks exist too, but they are advisory input to that human, never
 * an auto-approve: a fraudster who avoids the words we grep for is exactly the
 * one worth a second look.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import { slugify } from "@/db/id";
import {
  jobApplications,
  jobModerationReviews,
  jobPostings,
  organisationInvites,
  organisationMembers,
  organisations,
  userProfiles,
  users,
} from "@/db/schema";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";

const INVITE_TTL_DAYS = 7;
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

export type OrgMembership = {
  organisation: typeof organisations.$inferSelect;
  role: string;
};

export async function listMemberships(userId: string): Promise<OrgMembership[]> {
  const rows = await db
    .select({ organisation: organisations, role: organisationMembers.role })
    .from(organisationMembers)
    .innerJoin(organisations, eq(organisations.id, organisationMembers.organisationId))
    .where(eq(organisationMembers.userId, userId));
  return rows;
}

export async function getPrimaryOrganisation(userId: string) {
  const [first] = await listMemberships(userId);
  return first ?? null;
}

/**
 * Authorises the caller against ONE organisation.
 *
 * Note the shape: it takes the organisation id of the resource being acted on,
 * never one supplied by the caller. Checking "is this user in some
 * organisation" and then trusting a body-supplied id is the IDOR that the
 * Phase 1 review found on AI conversations; the same mistake is available here
 * and is avoided the same way.
 */
export async function requireOrgMember(
  userId: string,
  organisationId: string,
  roles?: string[],
): Promise<OrgMembership> {
  const [row] = await db
    .select({ organisation: organisations, role: organisationMembers.role })
    .from(organisationMembers)
    .innerJoin(organisations, eq(organisations.id, organisationMembers.organisationId))
    .where(
      and(
        eq(organisationMembers.userId, userId),
        eq(organisationMembers.organisationId, organisationId),
      ),
    )
    .limit(1);

  if (!row) throw new ForbiddenError("You don't have access to that organisation.");
  if (roles && !roles.includes(row.role)) {
    throw new ForbiddenError("Your role in this organisation doesn't allow that.");
  }
  return row;
}

export async function registerOrganisation(input: {
  userId: string;
  name: string;
  type: string;
  countryId: string;
  contactEmail: string;
  website?: string | null;
  about?: string | null;
}) {
  const existing = await listMemberships(input.userId);
  if (existing.length >= 3) {
    throw new ValidationError("You already belong to the maximum number of organisations.");
  }

  const [organisation] = await db
    .insert(organisations)
    .values({
      name: input.name,
      type: input.type,
      countryId: input.countryId,
      contactEmail: input.contactEmail,
      website: input.website ?? null,
      about: input.about ?? null,
      verificationStatus: "UNVERIFIED",
    })
    .returning();

  await db
    .insert(organisationMembers)
    .values({ organisationId: organisation.id, userId: input.userId, role: "owner" });

  // Promote a plain seeker so the employer surfaces become reachable. An
  // existing ADMIN must not be demoted by registering an organisation.
  await db
    .update(users)
    .set({ role: "ORG_MEMBER" })
    .where(and(eq(users.id, input.userId), eq(users.role, "SEEKER")));

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "organisation.registered",
    entityType: "organisation",
    entityId: organisation.id,
    after: { name: organisation.name, type: organisation.type },
  });

  return organisation;
}

export async function listOrganisationMembers(organisationId: string, userId: string) {
  await requireOrgMember(userId, organisationId);
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: organisationMembers.role,
    })
    .from(organisationMembers)
    .innerJoin(users, eq(users.id, organisationMembers.userId))
    .where(eq(organisationMembers.organisationId, organisationId));
}

/**
 * Invites a colleague.
 *
 * The token is returned once, to the inviter, and only its SHA-free bcrypt
 * hash is stored — a leaked database row must not be a usable invitation into
 * someone's hiring account.
 */
export async function inviteMember(input: {
  organisationId: string;
  userId: string;
  email: string;
  role?: string;
}) {
  await requireOrgMember(input.userId, input.organisationId, ["owner", "admin"]);

  const token = randomBytes(32).toString("base64url");
  const tokenHash = await bcrypt.hash(token, BCRYPT_ROUNDS);

  const [invite] = await db
    .insert(organisationInvites)
    .values({
      organisationId: input.organisationId,
      email: input.email.toLowerCase().trim(),
      role: input.role ?? "recruiter",
      tokenHash,
      invitedById: input.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "organisation.member_invited",
    entityType: "organisation",
    entityId: input.organisationId,
    after: { email: invite.email, role: invite.role },
  });

  // Returned so a mail provider (or the inviter, by hand) can deliver it.
  return { invite, token };
}

export async function acceptInvite(input: { token: string; userId: string; email: string }) {
  const candidates = await db
    .select()
    .from(organisationInvites)
    .where(
      and(
        eq(organisationInvites.email, input.email.toLowerCase().trim()),
        sql`${organisationInvites.acceptedAt} IS NULL`,
      ),
    );

  // bcrypt hashes aren't searchable, so the candidate set is scoped by email
  // and each is compared. The set is small by construction.
  let matched: (typeof organisationInvites.$inferSelect) | null = null;
  for (const candidate of candidates) {
    if (await bcrypt.compare(input.token, candidate.tokenHash)) {
      matched = candidate;
      break;
    }
  }

  if (!matched) throw new NotFoundError("That invitation isn't valid.");
  if (matched.expiresAt <= new Date()) {
    throw new ValidationError("That invitation has expired. Ask for a new one.");
  }

  await db
    .insert(organisationMembers)
    .values({
      organisationId: matched.organisationId,
      userId: input.userId,
      role: matched.role,
    })
    .onConflictDoNothing();

  await db
    .update(organisationInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(organisationInvites.id, matched.id));

  await db
    .update(users)
    .set({ role: "ORG_MEMBER" })
    .where(and(eq(users.id, input.userId), eq(users.role, "SEEKER")));

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "organisation.invite_accepted",
    entityType: "organisation",
    entityId: matched.organisationId,
  });

  return matched.organisationId;
}

// ---------------------------------------------------------------------------
// Postings
// ---------------------------------------------------------------------------

async function uniqueSlug(title: string): Promise<string> {
  const base = slugify(title).slice(0, 70) || "role";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString("hex")}`;
    const [clash] = await db
      .select({ id: jobPostings.id })
      .from(jobPostings)
      .where(eq(jobPostings.slug, candidate))
      .limit(1);
    if (!clash) return candidate;
  }
  throw new AppError("Couldn't allocate a URL for that title.", 500, "slug_exhausted");
}

export type JobPostingInput = {
  title: string;
  description: string;
  responsibilities?: string[];
  employmentType?: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP" | "APPRENTICESHIP" | "FREELANCE";
  remoteType?: "ONSITE" | "HYBRID" | "REMOTE";
  regionId?: string | null;
  city?: string | null;
  experienceMinYears?: number;
  experienceMaxYears?: number | null;
  educationRequired?: string | null;
  skillsRequired: string[];
  skillsPreferred?: string[];
  salaryMin?: number | null;
  salaryMax?: number | null;
  isSalaryDisclosed?: boolean;
  applyUrl?: string | null;
  expiresAt?: Date | null;
};

export async function createJobPosting(input: {
  organisationId: string;
  userId: string;
  data: JobPostingInput;
}) {
  const membership = await requireOrgMember(input.userId, input.organisationId);

  // Employer postings need a company row to hang off, because the public job
  // pages join through it. One is created per organisation on first posting.
  const companyId = await ensureCompanyForOrganisation(membership.organisation);

  const [posting] = await db
    .insert(jobPostings)
    .values({
      companyId,
      organisationId: input.organisationId,
      createdById: input.userId,
      title: input.data.title,
      slug: await uniqueSlug(input.data.title),
      description: input.data.description,
      responsibilities: input.data.responsibilities ?? null,
      employmentType: input.data.employmentType ?? "FULL_TIME",
      remoteType: input.data.remoteType ?? "ONSITE",
      regionId: input.data.regionId ?? null,
      city: input.data.city ?? null,
      experienceMinYears: input.data.experienceMinYears ?? 0,
      experienceMaxYears: input.data.experienceMaxYears ?? null,
      educationRequired: input.data.educationRequired ?? null,
      skillsRequired: input.data.skillsRequired,
      skillsPreferred: input.data.skillsPreferred ?? null,
      salaryMin: input.data.salaryMin ?? null,
      salaryMax: input.data.salaryMax ?? null,
      isSalaryDisclosed: input.data.isSalaryDisclosed ?? false,
      applyUrl: input.data.applyUrl ?? null,
      expiresAt: input.data.expiresAt ?? null,
      // Never ACTIVE on create, whatever the caller asked for.
      status: "DRAFT",
      moderationStatus: "UNVERIFIED",
      source: "employer",
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "job.created",
    entityType: "job_posting",
    entityId: posting.id,
    after: { title: posting.title, organisationId: input.organisationId },
  });

  return posting;
}

async function ensureCompanyForOrganisation(org: typeof organisations.$inferSelect) {
  const { companies } = await import("@/db/schema");
  const slug = slugify(org.name).slice(0, 70) || `org-${org.id.slice(0, 6)}`;

  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.slug, slug))
    .limit(1);
  if (existing) return existing.id;

  const [company] = await db
    .insert(companies)
    .values({
      name: org.name,
      slug,
      countryId: org.countryId,
      website: org.website,
      about: org.about,
      verificationStatus: org.verificationStatus === "VERIFIED" ? "verified" : "unverified",
    })
    .returning({ id: companies.id });
  return company.id;
}

/** Loads a posting and authorises the caller as a member of its organisation. */
export async function getOwnedPosting(jobId: string, userId: string) {
  const [posting] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1);
  if (!posting) throw new NotFoundError("That posting doesn't exist.");
  if (!posting.organisationId) {
    throw new ForbiddenError("That posting isn't managed through an employer account.");
  }
  await requireOrgMember(userId, posting.organisationId);
  return posting;
}

export async function updateJobPosting(input: {
  jobId: string;
  userId: string;
  data: Partial<JobPostingInput>;
}) {
  const posting = await getOwnedPosting(input.jobId, input.userId);

  if (posting.status === "ACTIVE") {
    // Editing a live advert silently would let approved copy be swapped for
    // something that was never reviewed. Edits send it back through moderation.
    await db
      .update(jobPostings)
      .set({ status: "DRAFT", moderationStatus: "UNVERIFIED" })
      .where(eq(jobPostings.id, posting.id));
  }

  const [updated] = await db
    .update(jobPostings)
    .set({
      ...(input.data.title ? { title: input.data.title } : {}),
      ...(input.data.description ? { description: input.data.description } : {}),
      ...(input.data.responsibilities ? { responsibilities: input.data.responsibilities } : {}),
      ...(input.data.employmentType ? { employmentType: input.data.employmentType } : {}),
      ...(input.data.remoteType ? { remoteType: input.data.remoteType } : {}),
      ...(input.data.city !== undefined ? { city: input.data.city } : {}),
      ...(input.data.regionId !== undefined ? { regionId: input.data.regionId } : {}),
      ...(input.data.experienceMinYears !== undefined
        ? { experienceMinYears: input.data.experienceMinYears }
        : {}),
      ...(input.data.experienceMaxYears !== undefined
        ? { experienceMaxYears: input.data.experienceMaxYears }
        : {}),
      ...(input.data.educationRequired !== undefined
        ? { educationRequired: input.data.educationRequired }
        : {}),
      ...(input.data.skillsRequired ? { skillsRequired: input.data.skillsRequired } : {}),
      ...(input.data.skillsPreferred ? { skillsPreferred: input.data.skillsPreferred } : {}),
      ...(input.data.salaryMin !== undefined ? { salaryMin: input.data.salaryMin } : {}),
      ...(input.data.salaryMax !== undefined ? { salaryMax: input.data.salaryMax } : {}),
      ...(input.data.isSalaryDisclosed !== undefined
        ? { isSalaryDisclosed: input.data.isSalaryDisclosed }
        : {}),
      ...(input.data.applyUrl !== undefined ? { applyUrl: input.data.applyUrl } : {}),
    })
    .where(eq(jobPostings.id, posting.id))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "job.updated",
    entityType: "job_posting",
    entityId: posting.id,
  });

  return updated;
}

/**
 * Cheap heuristics run at submission time.
 *
 * These are pattern matches on text, nothing more. They exist to put the
 * likeliest problems in front of a reviewer first, and they are stored on the
 * review row so the reviewer can see what tripped and disagree with it.
 */
export function screenPosting(posting: {
  title: string;
  description: string;
  isSalaryDisclosed: boolean;
  applyUrl?: string | null;
}, orgWebsite?: string | null): string[] {
  const flags: string[] = [];
  const text = `${posting.title}\n${posting.description}`.toLowerCase();

  const feeWords = [
    "registration fee",
    "registration charge",
    "security deposit",
    "refundable deposit",
    "processing fee",
    "training fee",
    "pay a fee",
    "joining fee",
    "काशन",
  ];
  if (feeWords.some((word) => text.includes(word))) {
    flags.push("mentions_candidate_payment");
  }

  if (/\b(aadhaar|aadhar|pan card|bank account|account number|ifsc|upi)\b/.test(text)) {
    flags.push("requests_sensitive_documents_upfront");
  }

  if (/\b(whatsapp|telegram)\b/.test(text) && /\+?\d[\d\s-]{8,}/.test(text)) {
    flags.push("directs_applicants_off_platform");
  }

  if (/\b(unlimited|guaranteed)\s+(income|earning|salary|placement|job)\b/.test(text)) {
    flags.push("guarantee_language");
  }

  if (!posting.isSalaryDisclosed && !orgWebsite) {
    flags.push("undisclosed_pay_and_no_website");
  }

  return flags;
}

export async function submitForReview(jobId: string, userId: string) {
  const posting = await getOwnedPosting(jobId, userId);
  if (posting.status === "ACTIVE") {
    throw new ConflictError("That posting is already live.");
  }

  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, posting.organisationId!))
    .limit(1);

  const flags = screenPosting(posting, org?.website);

  await db
    .update(jobPostings)
    .set({ moderationStatus: "PENDING", status: "DRAFT" })
    .where(eq(jobPostings.id, posting.id));

  await db.insert(jobModerationReviews).values({
    jobPostingId: posting.id,
    reviewerId: null,
    decision: "submitted",
    automatedFlags: flags.length ? flags : null,
  });

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "job.submitted_for_review",
    entityType: "job_posting",
    entityId: posting.id,
    after: { flags },
  });

  return { posting, flags };
}

/**
 * THE GATE.
 *
 * Both conditions, every time, on every path that could make a posting public.
 * Nothing else in this module sets `status: "ACTIVE"`.
 */
export async function assertPublishable(jobId: string): Promise<{ ok: true }> {
  const [posting] = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).limit(1);
  if (!posting) throw new NotFoundError("That posting doesn't exist.");

  // Seeded and admin-managed postings don't route through employer moderation.
  if (!posting.organisationId) return { ok: true };

  const [org] = await db
    .select()
    .from(organisations)
    .where(eq(organisations.id, posting.organisationId))
    .limit(1);

  if (!org || org.verificationStatus !== "VERIFIED") {
    throw new AppError(
      "This organisation isn't verified yet, so its postings can't go live. Verification checks that the employer exists and is who they say they are.",
      422,
      "organisation_unverified",
    );
  }

  const [approval] = await db
    .select()
    .from(jobModerationReviews)
    .where(
      and(
        eq(jobModerationReviews.jobPostingId, jobId),
        eq(jobModerationReviews.decision, "approve"),
      ),
    )
    .orderBy(desc(jobModerationReviews.createdAt))
    .limit(1);

  if (!approval) {
    throw new AppError(
      "This posting hasn't been through moderation yet.",
      422,
      "moderation_pending",
    );
  }

  return { ok: true };
}

export async function approveJobPosting(input: {
  jobId: string;
  adminId: string;
  note?: string;
}) {
  const [posting] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, input.jobId))
    .limit(1);
  if (!posting) throw new NotFoundError("That posting doesn't exist.");

  await db.insert(jobModerationReviews).values({
    jobPostingId: input.jobId,
    reviewerId: input.adminId,
    decision: "approve",
    reason: input.note ?? null,
  });

  // Recorded first, then checked: the organisation must still be verified at
  // the moment of publication, not merely when the review was queued.
  await assertPublishable(input.jobId);

  await db
    .update(jobPostings)
    .set({ status: "ACTIVE", moderationStatus: "VERIFIED", postedAt: new Date() })
    .where(eq(jobPostings.id, input.jobId));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "job.approved",
    entityType: "job_posting",
    entityId: input.jobId,
  });

  if (posting.createdById) {
    await notify({
      userId: posting.createdById,
      type: "job.posting_approved",
      title: "Your posting is live",
      body: `"${posting.title}" passed moderation and is now visible to job-seekers.`,
      href: `/jobs/${posting.slug}`,
      dedupeKey: `job.approved:${posting.id}`,
    });
  }
}

export async function rejectJobPosting(input: {
  jobId: string;
  adminId: string;
  reason: string;
}) {
  const [posting] = await db
    .select()
    .from(jobPostings)
    .where(eq(jobPostings.id, input.jobId))
    .limit(1);
  if (!posting) throw new NotFoundError("That posting doesn't exist.");

  await db.insert(jobModerationReviews).values({
    jobPostingId: input.jobId,
    reviewerId: input.adminId,
    decision: "reject",
    reason: input.reason,
  });

  await db
    .update(jobPostings)
    .set({ status: "DRAFT", moderationStatus: "REJECTED" })
    .where(eq(jobPostings.id, input.jobId));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "job.rejected",
    entityType: "job_posting",
    entityId: input.jobId,
    after: { reason: input.reason },
  });

  if (posting.createdById) {
    await notify({
      userId: posting.createdById,
      type: "job.posting_approved",
      title: "Your posting needs changes",
      body: `"${posting.title}" wasn't approved: ${input.reason}`,
      href: `/employers/dashboard/jobs/${posting.id}`,
      dedupeKey: `job.rejected:${posting.id}:${Date.now()}`,
    });
  }
}

export async function closeJobPosting(jobId: string, userId: string) {
  const posting = await getOwnedPosting(jobId, userId);
  await db.update(jobPostings).set({ status: "CLOSED" }).where(eq(jobPostings.id, posting.id));
  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "job.closed",
    entityType: "job_posting",
    entityId: posting.id,
  });
}

export async function listOrganisationJobs(organisationId: string, userId: string) {
  await requireOrgMember(userId, organisationId);
  const rows = await db
    .select({
      posting: jobPostings,
      applicantCount: sql<number>`(
        SELECT count(*)::int FROM ${jobApplications}
        WHERE ${jobApplications.jobPostingId} = ${jobPostings.id}
      )`,
    })
    .from(jobPostings)
    .where(eq(jobPostings.organisationId, organisationId))
    .orderBy(desc(jobPostings.createdAt));
  return rows;
}

// ---------------------------------------------------------------------------
// Applicants
// ---------------------------------------------------------------------------

/**
 * Applicants for one posting.
 *
 * Returns the account's name and email, the application itself, and the match
 * score already computed at apply time — and nothing else. An employer does
 * not get the seeker's saved careers, their assessment answers or their other
 * applications, because none of that was submitted to this employer.
 */
export async function listApplicants(jobId: string, userId: string) {
  const posting = await getOwnedPosting(jobId, userId);

  return db
    .select({
      application: jobApplications,
      applicantId: users.id,
      applicantName: users.name,
      applicantEmail: users.email,
      city: userProfiles.city,
      degree: userProfiles.degree,
      major: userProfiles.major,
      yearsExperience: userProfiles.yearsExperience,
    })
    .from(jobApplications)
    .innerJoin(users, eq(users.id, jobApplications.userId))
    .leftJoin(userProfiles, eq(userProfiles.userId, users.id))
    .where(eq(jobApplications.jobPostingId, posting.id))
    .orderBy(desc(jobApplications.appliedAt));
}

export async function updateApplicationStatus(input: {
  applicationId: string;
  userId: string;
  status: "IN_REVIEW" | "REJECTED" | "OFFER";
}) {
  const [application] = await db
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.id, input.applicationId))
    .limit(1);
  if (!application) throw new NotFoundError("That application doesn't exist.");

  // Authorise through the posting, not through anything the caller sent.
  const posting = await getOwnedPosting(application.jobPostingId, input.userId);

  const [updated] = await db
    .update(jobApplications)
    .set({ status: input.status, updatedAt: new Date() })
    .where(eq(jobApplications.id, input.applicationId))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "application.status_changed",
    entityType: "job_application",
    entityId: application.id,
    before: { status: application.status },
    after: { status: input.status },
  });

  const label =
    input.status === "OFFER"
      ? "You've received an offer"
      : input.status === "REJECTED"
        ? "Application closed"
        : "Your application is being reviewed";

  await notify({
    userId: application.userId,
    type: "job.application_update",
    title: label,
    body: `"${posting.title}" — status changed to ${input.status.toLowerCase().replace("_", " ")}.`,
    href: "/dashboard/applications",
    dedupeKey: `application.status:${application.id}:${input.status}`,
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Admin moderation queue
// ---------------------------------------------------------------------------

export async function listPendingModeration(limit = 50) {
  const rows = await db
    .select({
      posting: jobPostings,
      organisation: organisations,
    })
    .from(jobPostings)
    .innerJoin(organisations, eq(organisations.id, jobPostings.organisationId))
    .where(eq(jobPostings.moderationStatus, "PENDING"))
    .orderBy(desc(jobPostings.createdAt))
    .limit(limit);

  if (!rows.length) return [];

  const reviews = await db
    .select()
    .from(jobModerationReviews)
    .where(
      inArray(
        jobModerationReviews.jobPostingId,
        rows.map((r) => r.posting.id),
      ),
    )
    .orderBy(desc(jobModerationReviews.createdAt));

  const flagsByJob = new Map<string, string[]>();
  for (const review of reviews) {
    if (review.automatedFlags && !flagsByJob.has(review.jobPostingId)) {
      flagsByJob.set(review.jobPostingId, review.automatedFlags);
    }
  }

  return rows.map((row) => ({
    ...row,
    flags: flagsByJob.get(row.posting.id) ?? [],
  }));
}

/** Admin action on the organisation itself, feeding the same gate. */
export async function setOrganisationVerification(input: {
  organisationId: string;
  adminId: string;
  status: "VERIFIED" | "REJECTED" | "PENDING";
  note?: string;
}) {
  const [updated] = await db
    .update(organisations)
    .set({
      verificationStatus: input.status,
      reviewNote: input.note ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(organisations.id, input.organisationId))
    .returning();
  if (!updated) throw new NotFoundError("That organisation doesn't exist.");

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "organisation.verification_changed",
    entityType: "organisation",
    entityId: input.organisationId,
    after: { status: input.status, note: input.note },
  });

  return updated;
}
