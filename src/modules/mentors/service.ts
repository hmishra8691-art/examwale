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
  mentorAvailabilityExceptions,
  mentorCredentials,
  mentorReviews,
  mentorshipSessions,
  mentors,
  providerProfiles,
  users,
} from "@/db/schema";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  isUniqueViolation,
} from "@/modules/shared/errors";
import { likePattern } from "@/modules/shared/params";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";
import { getEntitlements } from "@/modules/billing/entitlements";
import {
  generateSlots,
  isOfferedSlot,
  type BookableSlot,
  type SlotOccupancy,
} from "@/modules/mentors/slots";
import { requestCapability, saveProviderProfile } from "@/modules/providers/service";
import {
  formatInZone,
  isValidTimeZone,
  resolveViewerZone,
  zonedParts,
  zoneForUserId,
} from "@/modules/shared/timezone";

/**
 * The professional-identity columns every mentor read needs.
 *
 * These live in `provider_profiles` now — one professional identity per person,
 * shared with whatever else they offer. Selected as a fragment rather than
 * spread through each query so there is one place to change when a field moves.
 */
/**
 * The mentor-offer columns the public may see.
 *
 * Enumerated rather than selecting the whole row, which is how the moderator's
 * private `reviewNote` — "approved but watch the fee claims" — ended up in an
 * unauthenticated JSON response. `status` and `credentialVerifiedAt` stay,
 * because the pages use them to decide what to show; `reviewNote` and the
 * superseded legacy columns do not.
 */
const PUBLIC_MENTOR_COLUMNS = {
  id: mentors.id,
  userId: mentors.userId,
  countryId: mentors.countryId,
  expertiseCareerSlugs: mentors.expertiseCareerSlugs,
  expertiseExamIds: mentors.expertiseExamIds,
  sessionRate: mentors.sessionRate,
  currencyCode: mentors.currencyCode,
  sessionMinutes: mentors.sessionMinutes,
  bufferMinutes: mentors.bufferMinutes,
  maxPerDay: mentors.maxPerDay,
  maxPerWeek: mentors.maxPerWeek,
  status: mentors.status,
  credentialVerifiedAt: mentors.credentialVerifiedAt,
  createdAt: mentors.createdAt,
} as const;

/**
 * A verified credential, as the public may see it.
 *
 * `verifiedById` is the reviewing admin's user id, `note` is their internal
 * comment, and `evidenceUrl`/`documentId` point at somebody's uploaded
 * employment letter. None of that is public information; the fact of
 * verification is.
 */
const PUBLIC_CREDENTIAL_COLUMNS = {
  id: mentorCredentials.id,
  mentorId: mentorCredentials.mentorId,
  kind: mentorCredentials.kind,
  title: mentorCredentials.title,
  issuer: mentorCredentials.issuer,
  status: mentorCredentials.status,
  verifiedAt: mentorCredentials.verifiedAt,
  createdAt: mentorCredentials.createdAt,
} as const;

const PROFILE_COLUMNS = {
  headline: providerProfiles.headline,
  bio: providerProfiles.bio,
  city: providerProfiles.city,
  languages: providerProfiles.languages,
  yearsExperience: providerProfiles.yearsExperience,
  currentRole: providerProfiles.currentRole,
  currentOrganisation: providerProfiles.currentOrganisation,
  timezone: providerProfiles.timezone,
  visibility: providerProfiles.visibility,
  providerProfileId: providerProfiles.id,
} as const;

/**
 * Flattens the offer and the person back into the shape callers already use.
 *
 * `mentor.headline` reads the same as it always did; it simply comes from a
 * different table. Keeping the composition here rather than in the pages is what
 * made moving the columns a contained change instead of a rewrite of every
 * mentor screen.
 */
function composeMentor<Offer extends object, Profile extends object>(
  offer: Offer,
  profile: Profile,
): Offer & Profile {
  return { ...offer, ...profile };
}

/** Minimum reviews before an average is shown at all. */
export const MIN_REVIEWS_FOR_AVERAGE = 3;

/** Furthest ahead a session may be booked. */
const MAX_BOOKING_HORIZON_DAYS = 90;

/**
 * How long a slot stays reserved while somebody finishes booking it.
 *
 * Long enough to type a topic and a question; short enough that an abandoned tab
 * does not keep a Tuesday morning off the market for an hour.
 */
export const HOLD_MINUTES = 10;

/**
 * Which instants are spoken for, and how.
 *
 * One query feeding both the picker and the validator, so what a seeker is shown
 * and what the server accepts cannot disagree. Expired holds are excluded here
 * rather than relying on the scheduler having swept them: a hold whose ten
 * minutes are up must free its slot at once, and a background task cannot
 * promise that.
 */
async function slotOccupancy(mentorId: string): Promise<SlotOccupancy> {
  const rows = await db
    .select({
      scheduledAt: mentorshipSessions.scheduledAt,
      status: mentorshipSessions.status,
      holdExpiresAt: mentorshipSessions.holdExpiresAt,
    })
    .from(mentorshipSessions)
    .where(
      and(
        eq(mentorshipSessions.mentorId, mentorId),
        inArray(mentorshipSessions.status, ["HELD", "REQUESTED", "ACCEPTED"]),
      ),
    );

  const now = Date.now();
  const occupancy: SlotOccupancy = new Map();
  for (const row of rows) {
    if (row.status === "HELD") {
      // A lapsed hold reserves nothing.
      if (!row.holdExpiresAt || row.holdExpiresAt.getTime() <= now) continue;
      occupancy.set(row.scheduledAt.toISOString(), "PENDING");
      continue;
    }
    // REQUESTED is pending — the mentor has not accepted — but it is not
    // available either, so a second seeker cannot take it.
    occupancy.set(
      row.scheduledAt.toISOString(),
      row.status === "REQUESTED" ? "PENDING" : "BOOKED",
    );
  }
  return occupancy;
}

/** A mentor's rules, in the shape the slot generator wants. */
async function bookingRules(mentorId: string) {
  const [offer] = await db
    .select({
      sessionMinutes: mentors.sessionMinutes,
      bufferMinutes: mentors.bufferMinutes,
      maxPerDay: mentors.maxPerDay,
      maxPerWeek: mentors.maxPerWeek,
    })
    .from(mentors)
    .where(eq(mentors.id, mentorId))
    .limit(1);

  const [windows, exceptionRows] = await Promise.all([
    db.select().from(mentorAvailability).where(eq(mentorAvailability.mentorId, mentorId)),
    db
      .select()
      .from(mentorAvailabilityExceptions)
      .where(eq(mentorAvailabilityExceptions.mentorId, mentorId)),
  ]);

  return {
    offer,
    availability: windows,
    exceptions: exceptionRows.map((row) => ({
      kind: row.kind as "UNAVAILABLE" | "EXTRA",
      onDate: row.onDate,
      startMinute: row.startMinute,
      endMinute: row.endMinute,
    })),
  };
}

/**
 * THE GATE, as a SQL condition so it can be composed into any listing query
 * rather than applied by the caller and occasionally forgotten.
 *
 * Three conditions, and the third was missing until an adversarial pass found
 * it. `provider_profiles.visibility` was added in Stage 3 with three documented
 * meanings — publicly listed, link only, hidden — and then never used as a
 * filter anywhere. A mentor who set themselves to HIDDEN stayed in the
 * directory with their full bio, and nothing on their screen suggested
 * otherwise. A privacy control that silently does nothing is worse than not
 * offering one, because the person acted on the belief that it worked.
 *
 * Requires a join to `provider_profiles`, which every listing query already has.
 */
export function listableCondition(): SQL {
  return and(
    eq(mentors.status, "ACTIVE"),
    isNotNull(mentors.credentialVerifiedAt),
    eq(providerProfiles.visibility, "PUBLIC"),
  )!;
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
    const term = likePattern(filters.search);
    conditions.push(
      or(
        sql`lower(${providerProfiles.headline}) LIKE ${term}`,
        sql`lower(${providerProfiles.bio}) LIKE ${term}`,
        sql`lower(coalesce(${providerProfiles.currentRole}, '')) LIKE ${term}`,
        sql`lower(coalesce(${providerProfiles.currentOrganisation}, '')) LIKE ${term}`,
        sql`lower(${providerProfiles.displayName}) LIKE ${term}`,
      )!,
    );
  }

  if (filters.language) {
    conditions.push(
      sql`${providerProfiles.languages} @> ${JSON.stringify([filters.language])}::jsonb`,
    );
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
      mentor: PUBLIC_MENTOR_COLUMNS,
      profile: PROFILE_COLUMNS,
      name: users.name,
      userId: users.id,
      avatarHash: users.avatarHash,
      reviewCount,
      reviewAverage,
    })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .innerJoin(providerProfiles, eq(providerProfiles.userId, mentors.userId))
    .where(where)
    .orderBy(desc(reviewCount), asc(mentors.sessionRate))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .innerJoin(providerProfiles, eq(providerProfiles.userId, mentors.userId))
    .where(where);

  return {
    mentors: rows.map((row) => ({
      ...row,
      mentor: composeMentor(row.mentor, row.profile),
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
  const [raw] = await db
    .select({
      mentor: PUBLIC_MENTOR_COLUMNS,
      profile: PROFILE_COLUMNS,
      name: users.name,
      userId: users.id,
      avatarHash: users.avatarHash,
      reviewCount,
      reviewAverage,
    })
    .from(mentors)
    .innerJoin(users, eq(users.id, mentors.userId))
    .innerJoin(providerProfiles, eq(providerProfiles.userId, mentors.userId))
    .where(eq(mentors.id, id))
    .limit(1);

  if (!raw) throw new NotFoundError("We couldn't find that mentor.");
  const row = { ...raw, mentor: composeMentor(raw.mentor, raw.profile) };

  const isOwner = viewer?.userId && viewer.userId === row.mentor.userId;
  if (!isListable(row.mentor) && !isOwner && !viewer?.isAdmin) {
    throw new NotFoundError("We couldn't find that mentor.");
  }
  /*
   * Visibility, which the listing condition cannot express here.
   *
   * LIMITED means "works if you have the link" — that is the whole point of the
   * setting, so a direct visit resolves. HIDDEN means nobody, and 404 rather
   * than 403 so the profile's existence is not confirmed to somebody probing.
   */
  if (row.profile.visibility === "HIDDEN" && !isOwner && !viewer?.isAdmin) {
    throw new NotFoundError("We couldn't find that mentor.");
  }

  const [credentials, availability, reviews] = await Promise.all([
    /*
     * The public sees only verified credentials, and only the public columns of
     * them. Filtering the rows was already right; returning the whole row was
     * not — it carried the reviewing admin's id and note, and a link to the
     * employment letter the mentor uploaded.
     */
    isOwner || viewer?.isAdmin
      ? db
          .select()
          .from(mentorCredentials)
          .where(eq(mentorCredentials.mentorId, id))
          .orderBy(desc(mentorCredentials.verifiedAt))
      : db
          .select(PUBLIC_CREDENTIAL_COLUMNS)
          .from(mentorCredentials)
          .where(
            and(eq(mentorCredentials.mentorId, id), eq(mentorCredentials.status, "VERIFIED"))!,
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

  /*
   * Two writes, because a mentor application is now two facts: who this person
   * is professionally, and what they are offering. The profile is upserted, so
   * somebody who already posts jobs keeps one identity and simply gains a
   * mentoring offer against it.
   */
  const [{ name: accountName }] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);

  await saveProviderProfile(input.userId, {
    displayName: accountName ?? input.headline.slice(0, 60),
    headline: input.headline,
    bio: input.bio,
    currentRole: input.currentRole ?? null,
    currentOrganisation: input.currentOrganisation ?? null,
    yearsExperience: input.yearsExperience ?? 0,
    languages: input.languages,
    city: input.city ?? null,
    countryId: input.countryId,
  });
  await requestCapability({ userId: input.userId, kind: "MENTOR" });

  const [mentor] = await db
    .insert(mentors)
    .values({
      userId: input.userId,
      countryId: input.countryId,
      expertiseCareerSlugs: input.expertiseCareerSlugs ?? null,
      expertiseExamIds: input.expertiseExamIds ?? null,
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
    // Rejected here rather than on read: an unknown zone makes Intl throw, and
    // the place it would throw is slot generation on the mentor's public page —
    // so a typo saved now becomes a broken profile later, for everyone.
    if (slot.timezone !== undefined && !isValidTimeZone(slot.timezone)) {
      throw new ValidationError(
        `'${slot.timezone}' isn't a timezone we recognise. Use an IANA name like Asia/Kolkata.`,
      );
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

/**
 * The slots to show a seeker for one mentor.
 *
 * Computed on the server so the list a person clicks is the list the booking
 * endpoint will accept — and so the times are rendered in both parties' zones
 * with the zone named, rather than in whatever zone the seeker's browser
 * happens to be set to.
 *
 * Sessions already requested or accepted are excluded, so a slot that is gone
 * stops being offered rather than being offered and then refused. The unique
 * index on (mentor_id, scheduled_at) is still what settles a genuine race —
 * this only avoids the avoidable half of the problem.
 */
export async function offeredSlots(input: {
  mentorId: string;
  viewerUserId?: string | null;
  viewerZone?: string | null;
  viewerCountryIso?: string | null;
}): Promise<{ slots: BookableSlot[]; viewerZone: string }> {
  // A signed-in viewer's own stored zone wins over an inference from their
  // country; a signed-out one still gets the country default.
  const viewerZone = input.viewerZone
    ? resolveViewerZone(input.viewerZone, input.viewerCountryIso)
    : await zoneForUserId(input.viewerUserId, input.viewerCountryIso);

  const rules = await bookingRules(input.mentorId);
  if (!rules.offer) return { slots: [], viewerZone };

  return {
    viewerZone,
    slots: generateSlots({
      availability: rules.availability,
      exceptions: rules.exceptions,
      sessionMinutes: rules.offer.sessionMinutes,
      bufferMinutes: rules.offer.bufferMinutes,
      maxPerDay: rules.offer.maxPerDay,
      maxPerWeek: rules.offer.maxPerWeek,
      occupancy: await slotOccupancy(input.mentorId),
      viewerZone,
    }),
  };
}

/**
 * Reserve a slot for a few minutes while somebody finishes booking it.
 *
 * The reservation is a `mentorship_sessions` row with status HELD, not a row in a
 * separate holds table, and that is the important decision here. The unique
 * index on (mentor_id, scheduled_at) is what actually settles two people wanting
 * the same Tuesday: whoever inserts second gets a constraint violation, from
 * Postgres, with no application code involved. A separate table would mean two
 * places competing for one instant and code deciding who won — which is the race
 * this arrangement exists to remove.
 *
 * Re-taking a hold you already own extends it, so refreshing the page does not
 * cost you the slot.
 */
export async function holdSlot(input: {
  mentorId: string;
  seekerId: string;
  scheduledAt: Date;
}): Promise<{ holdId: string; expiresAt: Date }> {
  const [mentor] = await db.select().from(mentors).where(eq(mentors.id, input.mentorId)).limit(1);
  if (!mentor || !isListable(mentor)) throw new NotFoundError("We couldn't find that mentor.");
  if (mentor.userId === input.seekerId) {
    throw new ValidationError("You can't book a session with yourself.");
  }

  const rules = await bookingRules(mentor.id);
  const occupancy = await slotOccupancy(mentor.id);
  const iso = input.scheduledAt.toISOString();

  // An existing hold of this seeker's own is extended rather than refused.
  const [existing] = await db
    .select()
    .from(mentorshipSessions)
    .where(
      and(
        eq(mentorshipSessions.mentorId, mentor.id),
        eq(mentorshipSessions.scheduledAt, input.scheduledAt),
        eq(mentorshipSessions.status, "HELD"),
      ),
    )
    .limit(1);

  if (existing) {
    const live = existing.holdExpiresAt && existing.holdExpiresAt.getTime() > Date.now();
    if (live && existing.seekerId !== input.seekerId) {
      throw new ConflictError(
        "Somebody is booking that slot right now. Try another, or come back in a few minutes.",
      );
    }
    const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
    await db
      .update(mentorshipSessions)
      .set({ seekerId: input.seekerId, holdExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(mentorshipSessions.id, existing.id));
    return { holdId: existing.id, expiresAt };
  }

  if (occupancy.get(iso)) {
    throw new ConflictError("That slot has just been taken. Pick another time.");
  }
  if (
    !isOfferedSlot({
      availability: rules.availability,
      exceptions: rules.exceptions,
      sessionMinutes: rules.offer?.sessionMinutes ?? mentor.sessionMinutes,
      bufferMinutes: rules.offer?.bufferMinutes ?? 0,
      maxPerDay: rules.offer?.maxPerDay ?? 0,
      maxPerWeek: rules.offer?.maxPerWeek ?? 0,
      occupancy,
      requested: input.scheduledAt,
      horizonDays: MAX_BOOKING_HORIZON_DAYS,
    })
  ) {
    throw new ValidationError("That time isn't one of the mentor's offered slots.");
  }

  const expiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000);
  try {
    const [held] = await db
      .insert(mentorshipSessions)
      .values({
        mentorId: mentor.id,
        seekerId: input.seekerId,
        topic: "(holding)",
        scheduledAt: input.scheduledAt,
        durationMinutes: rules.offer?.sessionMinutes ?? mentor.sessionMinutes,
        status: "HELD",
        holdExpiresAt: expiresAt,
      })
      .returning({ id: mentorshipSessions.id });
    return { holdId: held.id, expiresAt };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("That slot has just been taken. Pick another time.");
    }
    throw error;
  }
}

/**
 * Give a hold back.
 *
 * Called when somebody navigates away from a booking form. The scheduler would
 * release it anyway, so this is a courtesy to the next seeker rather than a
 * correctness requirement — which is why it fails quietly if the hold has
 * already gone.
 */
export async function releaseHold(input: { holdId: string; seekerId: string }): Promise<void> {
  await db
    .delete(mentorshipSessions)
    .where(
      and(
        eq(mentorshipSessions.id, input.holdId),
        eq(mentorshipSessions.seekerId, input.seekerId),
        eq(mentorshipSessions.status, "HELD"),
      ),
    );
}

/**
 * Release holds whose time is up. Called by the scheduler.
 *
 * Deleted rather than marked, because an abandoned hold is not history anybody
 * wants: it records that somebody opened a form and closed it. Real sessions,
 * including cancelled ones, are always kept.
 */
export async function releaseExpiredHolds(limit: number): Promise<number> {
  const released = await db
    .delete(mentorshipSessions)
    .where(
      and(
        eq(mentorshipSessions.status, "HELD"),
        lte(mentorshipSessions.holdExpiresAt, new Date()),
      ),
    )
    .returning({ id: mentorshipSessions.id });
  return Math.min(released.length, limit);
}

export async function requestSession(input: {
  mentorId: string;
  seekerId: string;
  topic: string;
  question?: string | null;
  scheduledAt: Date;
  /** Set when confirming a hold this seeker already took on the slot. */
  fromHoldId?: string | null;
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

  /*
   * Must be one of the slots this mentor is actually offering.
   *
   * Checked against the same generator that produced the picker, rather than by
   * re-deriving the arithmetic here. The previous version of this code read
   * `scheduledAt.getDay()` and `.getHours()` — the *server's* clock — and
   * compared them to availability minutes that are wall-clock in the mentor's
   * own zone. Under Vercel's UTC that put a Kolkata mentor's published hours
   * five and a half hours out: 10:00 IST was refused, and 15:30 IST accepted.
   */
  const rules = await bookingRules(mentor.id);
  const occupancy = await slotOccupancy(mentor.id);
  const iso = input.scheduledAt.toISOString();

  /*
   * A held slot belonging to this same seeker is theirs to complete.
   *
   * Without this exception, taking a hold and then confirming it would fail its
   * own check — the hold makes the slot PENDING, and PENDING is not offerable.
   */
  if (input.fromHoldId) occupancy.delete(iso);

  /*
   * "Taken" and "not a slot" are different answers and get different ones.
   *
   * Folding both into the offered-slot check reported a slot somebody had just
   * booked as though it were never on the mentor's calendar — a 422 saying "pick
   * one from the list" for a time that *was* on the list. Occupancy is checked
   * first so a race gets a conflict, which is both the right status and the only
   * message that tells the seeker to try a different time rather than doubt what
   * they clicked.
   */
  if (occupancy.get(iso)) {
    throw new ConflictError("That slot has just been taken. Pick another time.");
  }

  if (
    !isOfferedSlot({
      availability: rules.availability,
      exceptions: rules.exceptions,
      sessionMinutes: rules.offer?.sessionMinutes ?? mentor.sessionMinutes,
      bufferMinutes: rules.offer?.bufferMinutes ?? 0,
      maxPerDay: rules.offer?.maxPerDay ?? 0,
      maxPerWeek: rules.offer?.maxPerWeek ?? 0,
      occupancy,
      requested: input.scheduledAt,
      horizonDays: MAX_BOOKING_HORIZON_DAYS,
    })
  ) {
    throw new ValidationError(
      "That time isn't one of the mentor's offered slots. Pick one from the list.",
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
  /*
   * Confirming a hold *converts* the held row; it does not insert beside it.
   *
   * Inserting would violate the unique index against the seeker's own
   * reservation — the hold would block the booking it exists to protect.
   */
  if (input.fromHoldId) {
    const [converted] = await db
      .update(mentorshipSessions)
      .set({
        topic: input.topic,
        question: input.question ?? null,
        status: "REQUESTED",
        holdExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(mentorshipSessions.id, input.fromHoldId),
          eq(mentorshipSessions.seekerId, input.seekerId),
          eq(mentorshipSessions.status, "HELD"),
        ),
      )
      .returning();

    if (!converted) {
      // The hold lapsed while the form was open. Says so plainly rather than
      // failing on a constraint, because the seeker did nothing wrong.
      throw new ConflictError(
        `Your ${HOLD_MINUTES}-minute hold on that slot ran out. Pick a time again — it may still be free.`,
      );
    }
    session = converted;
  } else {
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
      if (isUniqueViolation(error)) {
        throw new ConflictError("That slot has just been taken. Pick another time.");
      }
      throw error;
    }
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
      mentorHeadline: providerProfiles.headline,
      mentorId: mentors.id,
      mentorUserId: users.id,
      mentorName: users.name,
      mentorAvatarHash: users.avatarHash,
      hasReview: sql<boolean>`EXISTS (
        SELECT 1 FROM ${mentorReviews} WHERE ${mentorReviews.sessionId} = ${mentorshipSessions.id}
      )`,
    })
    .from(mentorshipSessions)
    .innerJoin(mentors, eq(mentors.id, mentorshipSessions.mentorId))
    .innerJoin(users, eq(users.id, mentors.userId))
    .innerJoin(providerProfiles, eq(providerProfiles.userId, mentors.userId))
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
      seekerAvatarHash: users.avatarHash,
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
    if (isUniqueViolation(error)) {
      throw new ConflictError("You've already reviewed that session.");
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Move a session to a different time.
 *
 * The old row is kept as RESCHEDULED and a new one is created pointing back at
 * it. Two reasons for that rather than editing `scheduled_at` in place: the
 * unique index is on (mentor, instant), so an in-place move would need the old
 * instant freed and the new one claimed atomically anyway; and both parties
 * benefit from being able to see that a session moved, and from what, when they
 * are working out who is confused about which time.
 *
 * Either side may propose a move. The result goes back to REQUESTED, because a
 * time the mentor accepted is not the same as a time they have agreed to — and
 * silently keeping ACCEPTED across a change of day would be a way to put a
 * session in somebody's calendar that they never agreed to.
 */
export async function rescheduleSession(input: {
  sessionId: string;
  actorId: string;
  scheduledAt: Date;
}) {
  const [existing] = await db
    .select()
    .from(mentorshipSessions)
    .where(eq(mentorshipSessions.id, input.sessionId))
    .limit(1);
  if (!existing) throw new NotFoundError("We couldn't find that session.");

  const [mentor] = await db
    .select()
    .from(mentors)
    .where(eq(mentors.id, existing.mentorId))
    .limit(1);
  if (!mentor) throw new NotFoundError("We couldn't find that mentor.");

  const isSeeker = existing.seekerId === input.actorId;
  const isMentor = mentor.userId === input.actorId;
  if (!isSeeker && !isMentor) throw new ForbiddenError("That isn't your session.");

  if (existing.status !== "REQUESTED" && existing.status !== "ACCEPTED") {
    throw new ConflictError(
      `A ${existing.status.toLowerCase()} session cannot be rescheduled. Book a new one.`,
    );
  }
  if (input.scheduledAt.getTime() === existing.scheduledAt.getTime()) {
    throw new ValidationError("That is the time it is already at.");
  }

  const rules = await bookingRules(mentor.id);
  const occupancy = await slotOccupancy(mentor.id);
  // The session's own current slot is not an obstacle to moving out of it.
  occupancy.delete(existing.scheduledAt.toISOString());

  if (occupancy.get(input.scheduledAt.toISOString())) {
    throw new ConflictError("Something is already booked at that time. Pick another.");
  }

  if (
    !isOfferedSlot({
      availability: rules.availability,
      exceptions: rules.exceptions,
      sessionMinutes: rules.offer?.sessionMinutes ?? mentor.sessionMinutes,
      bufferMinutes: rules.offer?.bufferMinutes ?? 0,
      maxPerDay: rules.offer?.maxPerDay ?? 0,
      maxPerWeek: rules.offer?.maxPerWeek ?? 0,
      occupancy,
      requested: input.scheduledAt,
      horizonDays: MAX_BOOKING_HORIZON_DAYS,
    })
  ) {
    throw new ValidationError("That time isn't one of the mentor's offered slots.");
  }

  let moved;
  try {
    moved = await db.transaction(async (tx) => {
      await tx
        .update(mentorshipSessions)
        .set({ status: "RESCHEDULED", updatedAt: new Date() })
        .where(eq(mentorshipSessions.id, existing.id));

      const [created] = await tx
        .insert(mentorshipSessions)
        .values({
          mentorId: existing.mentorId,
          seekerId: existing.seekerId,
          topic: existing.topic,
          question: existing.question,
          scheduledAt: input.scheduledAt,
          durationMinutes: existing.durationMinutes,
          status: "REQUESTED",
          rescheduledFromId: existing.id,
        })
        .returning();
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("Somebody took that slot first. Pick another time.");
    }
    throw error;
  }

  await recordAudit({
    actorType: "user",
    actorId: input.actorId,
    action: "mentorship.rescheduled",
    entityType: "mentorship_session",
    entityId: moved.id,
    before: { from: existing.scheduledAt, sessionId: existing.id },
    after: { to: input.scheduledAt },
  });

  // The other party is told, in their own zone.
  const recipientId = isSeeker ? mentor.userId : existing.seekerId;
  const zone = await zoneForUserId(recipientId);
  await notify({
    userId: recipientId,
    type: "mentor.session_requested",
    title: "A session has been moved",
    body: `"${existing.topic}" is now proposed for ${formatInZone(input.scheduledAt, zone, {
      withDate: true,
    })}, moved from ${formatInZone(existing.scheduledAt, zone, { withDate: true })}. It needs accepting again.`,
    href: isSeeker ? "/dashboard/mentor" : "/dashboard/mentorship",
    dedupeKey: `mentorship.rescheduled:${moved.id}`,
  });

  return moved;
}

/** A mentor's dated exceptions, soonest first. */
export async function listAvailabilityExceptions(mentorId: string) {
  return db
    .select()
    .from(mentorAvailabilityExceptions)
    .where(eq(mentorAvailabilityExceptions.mentorId, mentorId))
    .orderBy(asc(mentorAvailabilityExceptions.onDate));
}

/**
 * Add a dated exception.
 *
 * Past dates are refused: an exception is a statement about future availability,
 * and one in the past can only be a typo — which would otherwise sit in the list
 * looking like it did something.
 */
export async function addAvailabilityException(input: {
  userId: string;
  kind: "UNAVAILABLE" | "EXTRA";
  onDate: string;
  startMinute?: number | null;
  endMinute?: number | null;
  note?: string | null;
}) {
  const mentor = await getMentorForUser(input.userId);
  if (!mentor) throw new NotFoundError("You haven't applied to be a mentor yet.");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.onDate)) {
    throw new ValidationError("Use a date in YYYY-MM-DD form.");
  }
  const zone =
    (await db
      .select({ timezone: mentorAvailability.timezone })
      .from(mentorAvailability)
      .where(eq(mentorAvailability.mentorId, mentor.id))
      .limit(1)
      .then((rows) => rows[0]?.timezone)) ?? "Asia/Kolkata";

  const todayInZone = zonedParts(new Date(), zone);
  const today = `${todayInZone.year}-${String(todayInZone.month).padStart(2, "0")}-${String(todayInZone.day).padStart(2, "0")}`;
  if (input.onDate < today) {
    throw new ValidationError("That date has passed. Exceptions only affect future bookings.");
  }

  const hasStart = input.startMinute != null;
  const hasEnd = input.endMinute != null;
  if (hasStart !== hasEnd) {
    throw new ValidationError("Give both a start and an end time, or neither for a whole day.");
  }
  if (hasStart && input.startMinute! >= input.endMinute!) {
    throw new ValidationError("The start has to come before the end.");
  }
  if (input.kind === "EXTRA" && !hasStart) {
    // A whole-day EXTRA has no hours to offer, so it would silently do nothing.
    throw new ValidationError("An extra window needs a start and an end time.");
  }

  const [created] = await db
    .insert(mentorAvailabilityExceptions)
    .values({
      mentorId: mentor.id,
      kind: input.kind,
      onDate: input.onDate,
      startMinute: input.startMinute ?? null,
      endMinute: input.endMinute ?? null,
      note: input.note?.trim() || null,
    })
    .returning();
  return created;
}

export async function removeAvailabilityException(input: { userId: string; id: string }) {
  const mentor = await getMentorForUser(input.userId);
  if (!mentor) throw new NotFoundError("You haven't applied to be a mentor yet.");
  await db
    .delete(mentorAvailabilityExceptions)
    .where(
      and(
        eq(mentorAvailabilityExceptions.id, input.id),
        eq(mentorAvailabilityExceptions.mentorId, mentor.id),
      ),
    );
}

/** Session length, buffer and caps — the offer's booking rules. */
export async function setBookingRules(input: {
  userId: string;
  sessionMinutes?: number;
  bufferMinutes?: number;
  maxPerDay?: number;
  maxPerWeek?: number;
}) {
  const mentor = await getMentorForUser(input.userId);
  if (!mentor) throw new NotFoundError("You haven't applied to be a mentor yet.");

  if (input.sessionMinutes != null && (input.sessionMinutes < 15 || input.sessionMinutes > 180)) {
    throw new ValidationError("Sessions run between 15 and 180 minutes.");
  }
  if (input.bufferMinutes != null && (input.bufferMinutes < 0 || input.bufferMinutes > 120)) {
    throw new ValidationError("A buffer of more than two hours is probably a mistake.");
  }
  for (const [name, value] of [
    ["per day", input.maxPerDay],
    ["per week", input.maxPerWeek],
  ] as const) {
    if (value != null && (value < 0 || value > 100)) {
      throw new ValidationError(`The maximum ${name} should be between 0 (no limit) and 100.`);
    }
  }
  if (input.maxPerDay && input.maxPerWeek && input.maxPerDay > input.maxPerWeek) {
    throw new ValidationError(
      "The daily maximum is higher than the weekly one, so the weekly one would never apply.",
    );
  }

  const [updated] = await db
    .update(mentors)
    .set({
      ...(input.sessionMinutes != null ? { sessionMinutes: input.sessionMinutes } : {}),
      ...(input.bufferMinutes != null ? { bufferMinutes: input.bufferMinutes } : {}),
      ...(input.maxPerDay != null ? { maxPerDay: input.maxPerDay } : {}),
      ...(input.maxPerWeek != null ? { maxPerWeek: input.maxPerWeek } : {}),
    })
    .where(eq(mentors.id, mentor.id))
    .returning();
  return updated;
}

export async function listPendingMentors() {
  const rows = await db
    .select({
      mentor: mentors,
      profile: PROFILE_COLUMNS,
      name: users.name,
      userId: users.id,
      avatarHash: users.avatarHash,
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
    .innerJoin(providerProfiles, eq(providerProfiles.userId, mentors.userId))
    .where(eq(mentors.status, "PENDING"))
    .orderBy(asc(mentors.createdAt));

  return rows.map((row) => ({ ...row, mentor: composeMentor(row.mentor, row.profile) }));
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
