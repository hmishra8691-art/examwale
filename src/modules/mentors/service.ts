/**
 * Mentors.
 *
 * The gate here is `listableCondition()`. A mentor is public only when their
 * application has been accepted AND at least one credential has been verified
 * by a person.
 *
 * The reason is specific rather than procedural. The people booking these
 * sessions are often anxious, often young, and are being asked to take advice
 * about the next several years of their life — and, in many cases, to pay for
 * it. "I cleared UPSC in 2021" is a claim that costs nothing to make and is
 * worth a great deal to the person making it. So it is checked before the
 * profile exists publicly, not reported afterwards.
 *
 * Two smaller decisions in the same spirit:
 *
 *  - Ratings are suppressed below three reviews. A 5.0 from a single session
 *    is not information, and displaying it as one is how new listings get
 *    gamed.
 *  - A review can only be written by the seeker who attended a session that
 *    was marked COMPLETED. Reviews are tied to sessions, not to profiles.
 */
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mentorAvailability,
  mentorCredentials,
  mentorReviews,
  mentorshipSessions,
  mentors,
  users,
} from "@/db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";
import { getEntitlements } from "@/modules/billing/entitlements";

/** Minimum reviews before an average is shown at all. */
export const MIN_REVIEWS_FOR_AVERAGE = 3;

/** Furthest ahead a session may be booked. */
const MAX_BOOKING_HORIZON_DAYS = 90;

/**
 * THE GATE, as a SQL condition so it can be composed into any listing query
 * rather than applied by the caller and occasionally forgotten.
 */
export function listableCondition(): SQL {
  return and(eq(mentors.status, "ACTIVE"), isNotNull(mentors.credentialVerifiedAt))!;
}

export function isListable(mentor: { status: string; credentialVerifiedAt: Date | null }): boolean {
  return mentor.status === "ACTIVE" && mentor.credentialVerifiedAt != null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export type MentorFilters = {
  search?: string;
  careerSlug?: string;
  examId?: string;
  language?: string;
  maxRate?: number;
  freeOnly?: boolean;
  countryId?: string;
  page?: number;
  perPage?: number;
};

const reviewCount = sql<number>`(
  SELECT count(*)::int FROM ${mentorReviews} WHERE ${mentorReviews.mentorId} = ${mentors.id}
)`;

const reviewAverage = sql<number | null>`(
  SELECT round(avg(${mentorReviews.rating})::numeric, 1)::float
  FROM ${mentorReviews} WHERE ${mentorReviews.mentorId} = ${mentors.id}
)`;

/**
 * Suppresses an average computed from too few reviews.
 *
 * Returns the count either way — "2 reviews" is honest and useful; "5.0" from
 * those same two is not.
 */
export function presentRating(average: number | null, total: number) {
  if (total < MIN_REVIEWS_FOR_AVERAGE) {
    return { average: null as number | null, total, tooFew: true };
  }
  return { average, total, tooFew: false };
}

export async function listMentors(filters: MentorFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(48, Math.max(6, filters.perPage ?? 18));

  const conditions: SQL[] = [listableCondition()];

  if (filters.countryId) conditions.push(eq(mentors.countryId, filters.countryId));
  if (filters.freeOnly) conditions.push(eq(mentors.sessionRate, 0));
  if (filters.maxRate != null) conditions.push(lte(mentors.sessionRate, filters.maxRate));

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${mentors.headline}) LIKE ${term}`,
        sql`lower(${mentors.bio}) LIKE ${term}`,
        sql`lower(coalesce(${mentors.currentRole}, '')) LIKE ${term}`,
        sql`lower(coalesce(${mentors.currentOrganisation}, '')) LIKE ${term}`,
      )!,
    );
  }

  if (filters.language) {
    conditions.push(sql`${mentors.languages} @> ${JSON.stringify([filters.language])}::jsonb`);
  }
  if (filters.careerSlug) {
    conditions.push(
      sql`${mentors.expertiseCareerSlugs} @> ${JSON.stringify([filters.careerSlug])}::jsonb`,
    );
  }
  if (filters.examId) {
    conditions.push(sql`${mentors.expertiseExamIds} @> ${JSON.stringify([filters.examId])}::jsonb`);
  }

  const where = and(...conditions);

  const rows = await db
    .select({
      mentor: mentors,
      name: users.name,
      reviewCount,
      reviewAverage,
    })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .where(where)
    .orderBy(desc(reviewCount), asc(mentors.sessionRate))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .where(where);

  return {
    mentors: rows.map((row) => ({
      ...row,
      rating: presentRating(row.reviewAverage, row.reviewCount),
    })),
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * One mentor.
 *
 * A non-listable mentor 404s for the public, but resolves for the mentor
 * themselves and for admins — otherwise an applicant could not see their own
 * pending profile and a reviewer could not check it.
 */
export async function getMentorById(
  id: string,
  viewer?: { userId?: string | null; isAdmin?: boolean },
) {
  const [row] = await db
    .select({ mentor: mentors, name: users.name, reviewCount, reviewAverage })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .where(eq(mentors.id, id))
    .limit(1);

  if (!row) throw new NotFoundError("We couldn't find that mentor.");

  const isOwner = viewer?.userId && viewer.userId === row.mentor.userId;
  if (!isListable(row.mentor) && !isOwner && !viewer?.isAdmin) {
    throw new NotFoundError("We couldn't find that mentor.");
  }

  const [credentials, availability, reviews] = await Promise.all([
    db
      .select()
      .from(mentorCredentials)
      .where(
        // The public only ever sees credentials that were actually verified.
        isOwner || viewer?.isAdmin
          ? eq(mentorCredentials.mentorId, id)
          : and(eq(mentorCredentials.mentorId, id), eq(mentorCredentials.status, "VERIFIED"))!,
      )
      .orderBy(desc(mentorCredentials.verifiedAt)),

    db
      .select()
      .from(mentorAvailability)
      .where(eq(mentorAvailability.mentorId, id))
      .orderBy(asc(mentorAvailability.weekday), asc(mentorAvailability.startMinute)),

    db
      .select({
        review: mentorReviews,
        reviewerName: users.name,
      })
      .from(mentorReviews)
      .innerJoin(users, eq(users.id, mentorReviews.seekerId))
      .where(eq(mentorReviews.mentorId, id))
      .orderBy(desc(mentorReviews.createdAt))
      .limit(20),
  ]);

  return {
    ...row,
    rating: presentRating(row.reviewAverage, row.reviewCount),
    credentials,
    availability,
    reviews,
    isOwner: Boolean(isOwner),
  };
}

export async function getMentorForUser(userId: string) {
  const [row] = await db.select().from(mentors).where(eq(mentors.userId, userId)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Applying and credentials
// ---------------------------------------------------------------------------

export async function applyAsMentor(input: {
  userId: string;
  headline: string;
  bio: string;
  countryId: string;
  city?: string | null;
  languages: string[];
  expertiseCareerSlugs?: string[];
  expertiseExamIds?: string[];
  yearsExperience: number;
  currentRole?: string | null;
  currentOrganisation?: string | null;
  sessionRate: number;
  sessionMinutes?: number;
}) {
  const existing = await getMentorForUser(input.userId);
  if (existing) throw new ConflictError("You've already applied to be a mentor.");

  const [mentor] = await db
    .insert(mentors)
    .values({
      userId: input.userId,
      headline: input.headline,
      bio: input.bio,
      countryId: input.countryId,
      city: input.city ?? null,
      languages: input.languages,
      expertiseCareerSlugs: input.expertiseCareerSlugs ?? null,
      expertiseExamIds: input.expertiseExamIds ?? null,
      yearsExperience: input.yearsExperience,
      currentRole: input.currentRole ?? null,
      currentOrganisation: input.currentOrganisation ?? null,
      sessionRate: input.sessionRate,
      sessionMinutes: input.sessionMinutes ?? 30,
      status: "PENDING",
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "mentor.applied",
    entityType: "mentor",
    entityId: mentor.id,
  });

  return mentor;
}

export async function addCredential(input: {
  userId: string;
  kind: string;
  title: string;
  issuer?: string | null;
  evidenceUrl?: string | null;
}) {
  const mentor = await getMentorForUser(input.userId);
  if (!mentor) throw new NotFoundError("You haven't applied to be a mentor yet.");

  const [credential] = await db
    .insert(mentorCredentials)
    .values({
      mentorId: mentor.id,
      kind: input.kind,
      title: input.title,
      issuer: input.issuer ?? null,
      evidenceUrl: input.evidenceUrl ?? null,
      // DISPUTED is the schema's "not yet checked" state for this enum. A
      // credential is never born verified.
      status: "DISPUTED",
    })
    .returning();

  return credential;
}

export async function setAvailability(input: {
  userId: string;
  slots: { weekday: number; startMinute: number; endMinute: number; timezone?: string }[];
}) {
  const mentor = await getMentorForUser(input.userId);
  if (!mentor) throw new NotFoundError("You haven't applied to be a mentor yet.");

  for (const slot of input.slots) {
    if (!Number.isInteger(slot.weekday) || slot.weekday < 0 || slot.weekday > 6) {
      throw new ValidationError("Weekday must be between 0 (Sunday) and 6 (Saturday).");
    }
    if (slot.startMinute < 0 || slot.endMinute > 1440 || slot.startMinute >= slot.endMinute) {
      throw new ValidationError("Each slot needs a start earlier than its end, within one day.");
    }
  }

  // Overlaps would make "is this time available?" ambiguous, and the booking
  // check below assumes it isn't.
  const byDay = new Map<number, { startMinute: number; endMinute: number }[]>();
  for (const slot of input.slots) {
    const day = byDay.get(slot.weekday) ?? [];
    for (const other of day) {
      if (slot.startMinute < other.endMinute && other.startMinute < slot.endMinute) {
        throw new ValidationError("Two slots on the same day overlap.");
      }
    }
    day.push(slot);
    byDay.set(slot.weekday, day);
  }

  await db.delete(mentorAvailability).where(eq(mentorAvailability.mentorId, mentor.id));
  if (input.slots.length) {
    await db.insert(mentorAvailability).values(
      input.slots.map((slot) => ({
        mentorId: mentor.id,
        weekday: slot.weekday,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        timezone: slot.timezone ?? "Asia/Kolkata",
      })),
    );
  }

  return db
    .select()
    .from(mentorAvailability)
    .where(eq(mentorAvailability.mentorId, mentor.id))
    .orderBy(asc(mentorAvailability.weekday), asc(mentorAvailability.startMinute));
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

function startOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export async function requestSession(input: {
  mentorId: string;
  seekerId: string;
  topic: string;
  question?: string | null;
  scheduledAt: Date;
}) {
  const [mentor] = await db.select().from(mentors).where(eq(mentors.id, input.mentorId)).limit(1);
  if (!mentor || !isListable(mentor)) throw new NotFoundError("We couldn't find that mentor.");
  if (mentor.userId === input.seekerId) {
    throw new ValidationError("You can't book a session with yourself.");
  }

  const now = Date.now();
  const when = input.scheduledAt.getTime();
  if (!Number.isFinite(when)) throw new ValidationError("That date isn't valid.");
  if (when <= now) throw new ValidationError("Pick a time in the future.");
  if (when - now > MAX_BOOKING_HORIZON_DAYS * 86_400_000) {
    throw new ValidationError(
      `Sessions can be booked up to ${MAX_BOOKING_HORIZON_DAYS} days ahead.`,
    );
  }

  // Must fall inside a declared availability window for that weekday.
  const weekday = input.scheduledAt.getDay();
  const minuteOfDay = input.scheduledAt.getHours() * 60 + input.scheduledAt.getMinutes();
  const slots = await db
    .select()
    .from(mentorAvailability)
    .where(
      and(eq(mentorAvailability.mentorId, mentor.id), eq(mentorAvailability.weekday, weekday)),
    );

  const fits = slots.some(
    (slot) =>
      minuteOfDay >= slot.startMinute &&
      minuteOfDay + mentor.sessionMinutes <= slot.endMinute,
  );
  if (!fits) {
    throw new ValidationError(
      "That time isn't in the mentor's available hours. Pick one of the offered slots.",
    );
  }

  // Entitlement: how many sessions this seeker may hold per calendar month.
  const { entitlements } = await getEntitlements(input.seekerId);
  const [{ used }] = await db
    .select({ used: count() })
    .from(mentorshipSessions)
    .where(
      and(
        eq(mentorshipSessions.seekerId, input.seekerId),
        gte(mentorshipSessions.createdAt, startOfMonth()),
        inArray(mentorshipSessions.status, ["REQUESTED", "ACCEPTED", "COMPLETED"]),
      ),
    );

  if (used >= entitlements.mentorSessionsPerMonth) {
    throw new ValidationError(
      `Your plan includes ${entitlements.mentorSessionsPerMonth} mentor ${
        entitlements.mentorSessionsPerMonth === 1 ? "session" : "sessions"
      } a month, and you've used them. The allowance resets next month.`,
    );
  }

  let session;
  try {
    [session] = await db
      .insert(mentorshipSessions)
      .values({
        mentorId: mentor.id,
        seekerId: input.seekerId,
        topic: input.topic,
        question: input.question ?? null,
        scheduledAt: input.scheduledAt,
        durationMinutes: mentor.sessionMinutes,
        status: "REQUESTED",
      })
      .returning();
  } catch (error) {
    // The unique index on (mentorId, scheduledAt) is the real defence against
    // a double booking; two requests can pass the checks above concurrently.
    if (String((error as { code?: string }).code) === "23505") {
      throw new ConflictError("That slot has just been taken. Pick another time.");
    }
    throw error;
  }

  await recordAudit({
    actorType: "user",
    actorId: input.seekerId,
    action: "mentorship.requested",
    entityType: "mentorship_session",
    entityId: session.id,
  });

  await notify({
    userId: mentor.userId,
    type: "mentor.session_requested",
    title: "New mentorship request",
    body: `Someone asked for a session about "${input.topic}".`,
    href: "/dashboard/mentor",
    dedupeKey: `mentorship.requested:${session.id}`,
  });

  return session;
}

/** Loads a session and authorises the caller as its mentor. */
async function requireOwnedSessionAsMentor(sessionId: string, userId: string) {
  const [row] = await db
    .select({ session: mentorshipSessions, mentorUserId: mentors.userId })
    .from(mentorshipSessions)
    .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
    .where(eq(mentorshipSessions.id, sessionId))
    .limit(1);

  if (!row) throw new NotFoundError("That session doesn't exist.");
  if (row.mentorUserId !== userId) throw new ForbiddenError("That isn't your session.");
  return row.session;
}

export async function respondToSession(input: {
  sessionId: string;
  mentorUserId: string;
  decision: "ACCEPTED" | "DECLINED";
  note?: string | null;
  meetingUrl?: string | null;
}) {
  const session = await requireOwnedSessionAsMentor(input.sessionId, input.mentorUserId);
  if (session.status !== "REQUESTED") {
    throw new ConflictError("That request has already been answered.");
  }

  const [updated] = await db
    .update(mentorshipSessions)
    .set({
      status: input.decision,
      mentorNote: input.note ?? null,
      meetingUrl: input.decision === "ACCEPTED" ? (input.meetingUrl ?? null) : null,
      updatedAt: new Date(),
    })
    .where(eq(mentorshipSessions.id, session.id))
    .returning();

  await notify({
    userId: session.seekerId,
    type: input.decision === "ACCEPTED" ? "mentor.session_accepted" : "mentor.session_declined",
    title: input.decision === "ACCEPTED" ? "Your session is confirmed" : "Request declined",
    body:
      input.decision === "ACCEPTED"
        ? `Your session about "${session.topic}" is confirmed.`
        : `The mentor couldn't take your session about "${session.topic}".${input.note ? ` ${input.note}` : ""}`,
    href: "/dashboard/mentorship",
    dedupeKey: `mentorship.${input.decision}:${session.id}`,
  });

  return updated;
}

export async function completeSession(sessionId: string, mentorUserId: string) {
  const session = await requireOwnedSessionAsMentor(sessionId, mentorUserId);
  if (session.status !== "ACCEPTED") {
    throw new ConflictError("Only an accepted session can be marked complete.");
  }

  const [updated] = await db
    .update(mentorshipSessions)
    .set({ status: "COMPLETED", updatedAt: new Date() })
    .where(eq(mentorshipSessions.id, session.id))
    .returning();

  return updated;
}

/** Either party may cancel; who did is recorded in the audit log. */
export async function cancelSession(sessionId: string, userId: string, reason?: string) {
  const [row] = await db
    .select({ session: mentorshipSessions, mentorUserId: mentors.userId })
    .from(mentorshipSessions)
    .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
    .where(eq(mentorshipSessions.id, sessionId))
    .limit(1);

  if (!row) throw new NotFoundError("That session doesn't exist.");

  const isMentor = row.mentorUserId === userId;
  const isSeeker = row.session.seekerId === userId;
  if (!isMentor && !isSeeker) throw new ForbiddenError("That isn't your session.");

  if (row.session.status === "COMPLETED") {
    throw new ConflictError("That session already happened.");
  }

  const [updated] = await db
    .update(mentorshipSessions)
    .set({
      status: "CANCELLED",
      cancelledReason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(mentorshipSessions.id, sessionId))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "mentorship.cancelled",
    entityType: "mentorship_session",
    entityId: sessionId,
    after: { by: isMentor ? "mentor" : "seeker", reason },
  });

  await notify({
    userId: isMentor ? row.session.seekerId : row.mentorUserId,
    type: "mentor.session_declined",
    title: "Session cancelled",
    body: `The session about "${row.session.topic}" was cancelled.${reason ? ` ${reason}` : ""}`,
    href: isMentor ? "/dashboard/mentorship" : "/dashboard/mentor",
    dedupeKey: `mentorship.cancelled:${sessionId}`,
  });

  return updated;
}

export async function listSessionsForSeeker(userId: string) {
  return db
    .select({
      session: mentorshipSessions,
      mentorHeadline: mentors.headline,
      mentorId: mentors.id,
      mentorName: users.name,
      hasReview: sql<boolean>`EXISTS (
        SELECT 1 FROM ${mentorReviews} WHERE ${mentorReviews.sessionId} = ${mentorshipSessions.id}
      )`,
    })
    .from(mentorshipSessions)
    .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
    .innerJoin(users, eq(users.id, mentors.userId))
    .where(eq(mentorshipSessions.seekerId, userId))
    .orderBy(desc(mentorshipSessions.scheduledAt));
}

export async function listSessionsForMentor(userId: string) {
  const mentor = await getMentorForUser(userId);
  if (!mentor) return [];

  return db
    .select({
      session: mentorshipSessions,
      seekerName: users.name,
    })
    .from(mentorshipSessions)
    .innerJoin(users, eq(users.id, mentorshipSessions.seekerId))
    .where(eq(mentorshipSessions.mentorId, mentor.id))
    .orderBy(desc(mentorshipSessions.scheduledAt));
}

export async function submitReview(input: {
  sessionId: string;
  seekerId: string;
  rating: number;
  comment?: string | null;
}) {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new ValidationError("Rating must be between 1 and 5.");
  }

  const [session] = await db
    .select()
    .from(mentorshipSessions)
    .where(eq(mentorshipSessions.id, input.sessionId))
    .limit(1);

  if (!session) throw new NotFoundError("That session doesn't exist.");
  if (session.seekerId !== input.seekerId) throw new ForbiddenError("That isn't your session.");
  if (session.status !== "COMPLETED") {
    throw new ValidationError("You can review a session once it's been marked complete.");
  }

  try {
    const [review] = await db
      .insert(mentorReviews)
      .values({
        sessionId: session.id,
        mentorId: session.mentorId,
        seekerId: input.seekerId,
        rating: input.rating,
        comment: input.comment ?? null,
      })
      .returning();
    return review;
  } catch (error) {
    if (String((error as { code?: string }).code) === "23505") {
      throw new ConflictError("You've already reviewed that session.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function listPendingMentors() {
  return db
    .select({
      mentor: mentors,
      name: users.name,
      email: users.email,
      credentialCount: sql<number>`(
        SELECT count(*)::int FROM ${mentorCredentials}
        WHERE ${mentorCredentials.mentorId} = ${mentors.id}
      )`,
      verifiedCredentials: sql<number>`(
        SELECT count(*)::int FROM ${mentorCredentials}
        WHERE ${mentorCredentials.mentorId} = ${mentors.id}
          AND ${mentorCredentials.status} = 'VERIFIED'
      )`,
    })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .where(eq(mentors.status, "PENDING"))
    .orderBy(asc(mentors.createdAt));
}

export async function listCredentials(mentorId: string) {
  return db
    .select()
    .from(mentorCredentials)
    .where(eq(mentorCredentials.mentorId, mentorId))
    .orderBy(asc(mentorCredentials.createdAt));
}

export async function verifyCredential(input: {
  credentialId: string;
  adminId: string;
  note?: string;
}) {
  const [credential] = await db
    .update(mentorCredentials)
    .set({
      status: "VERIFIED",
      verifiedById: input.adminId,
      verifiedAt: new Date(),
      note: input.note ?? null,
    })
    .where(eq(mentorCredentials.id, input.credentialId))
    .returning();

  if (!credential) throw new NotFoundError("That credential doesn't exist.");

  // Stamping the mentor row is what actually opens the gate.
  await db
    .update(mentors)
    .set({ credentialVerifiedAt: new Date() })
    .where(eq(mentors.id, credential.mentorId));

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "mentor.credential_verified",
    entityType: "mentor",
    entityId: credential.mentorId,
    after: { credentialId: credential.id },
  });

  return credential;
}

export async function reviewMentorApplication(input: {
  mentorId: string;
  adminId: string;
  decision: "ACTIVE" | "REJECTED";
  note?: string;
}) {
  const [mentor] = await db.select().from(mentors).where(eq(mentors.id, input.mentorId)).limit(1);
  if (!mentor) throw new NotFoundError("That application doesn't exist.");

  if (input.decision === "ACTIVE") {
    // Approving without a verified credential would set status ACTIVE while
    // credentialVerifiedAt stayed null — the gate would hold, but the admin
    // screen would claim the mentor was live. Refuse instead of half-doing it.
    const [{ verified }] = await db
      .select({ verified: count() })
      .from(mentorCredentials)
      .where(
        and(
          eq(mentorCredentials.mentorId, input.mentorId),
          eq(mentorCredentials.status, "VERIFIED"),
        ),
      );

    if (verified === 0) {
      throw new ValidationError(
        "Verify at least one credential before approving this mentor — that check is what the listing depends on.",
      );
    }
  }

  const [updated] = await db
    .update(mentors)
    .set({ status: input.decision, reviewNote: input.note ?? null })
    .where(eq(mentors.id, input.mentorId))
    .returning();

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "mentor.application_reviewed",
    entityType: "mentor",
    entityId: input.mentorId,
    after: { decision: input.decision, note: input.note },
  });

  await notify({
    userId: mentor.userId,
    type: "mentor.application_reviewed",
    title: input.decision === "ACTIVE" ? "You're listed as a mentor" : "Mentor application declined",
    body:
      input.decision === "ACTIVE"
        ? "Your profile is live. Set your availability so people can book time with you."
        : (input.note ?? "We couldn't approve your application at this time."),
    href: input.decision === "ACTIVE" ? "/dashboard/mentor" : "/mentors/apply",
    dedupeKey: `mentor.reviewed:${input.mentorId}:${input.decision}`,
  });

  return updated;
}
