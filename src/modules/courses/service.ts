/**
 * Courses and coaching marketplace.
 *
 * The design problem this module solves is not search. It is that the coaching
 * industry's marketing is built almost entirely on unverifiable outcome claims
 * — "98% selection rate", "highest number of selections in India" — and a
 * listing site that renders those claims in the same typography as a verified
 * fee or an official exam date is laundering them.
 *
 * So two structural decisions, both enforced here rather than in the UI:
 *
 *  1. An outcome claim is never a column on the course. It is a row in
 *     `courseOutcomeClaims` with a `confidence` label and an optional source.
 *     Reading a course does not give you its claims as plain values; you get
 *     them as labelled claims, and the component that renders them prints the
 *     label.
 *  2. A fee is never a column on the course either. Fees live on batches,
 *     because a fee belongs to a specific run of a course with specific dates,
 *     and a fee shown without the batch it belongs to is stale the moment the
 *     next batch opens.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  courseBatches,
  courseEnquiries,
  courseOutcomeClaims,
  courseTargets,
  courses,
  exams,
  careerProfiles,
  occupations,
  organisationMembers,
  providers,
  sources,
} from "@/db/schema";
import { ForbiddenError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { notify } from "@/modules/notifications/service";

export type CourseFilters = {
  search?: string;
  mode?: string[];
  examId?: string;
  careerSlug?: string;
  city?: string;
  maxFee?: number;
  freeOnly?: boolean;
  providerId?: string;
  page?: number;
  perPage?: number;
  sort?: "relevance" | "fee" | "starting-soon";
};

/**
 * The cheapest currently-active batch per course, plus the next start date.
 *
 * Computed as a lateral-ish subquery rather than by loading every batch,
 * because a list page showing 20 courses should not fetch 200 batch rows to
 * display 20 numbers.
 */
const cheapestBatchFee = sql<number | null>`(
  SELECT MIN(${courseBatches.feeAmount})
  FROM ${courseBatches}
  WHERE ${courseBatches.courseId} = ${courses.id}
    AND ${courseBatches.isActive} = true
    AND ${courseBatches.feeAmount} IS NOT NULL
)`;

const nextStart = sql<Date | null>`(
  SELECT MIN(${courseBatches.startsOn})
  FROM ${courseBatches}
  WHERE ${courseBatches.courseId} = ${courses.id}
    AND ${courseBatches.isActive} = true
    AND ${courseBatches.startsOn} > now()
)`;

const activeBatchCount = sql<number>`(
  SELECT count(*)::int FROM ${courseBatches}
  WHERE ${courseBatches.courseId} = ${courses.id} AND ${courseBatches.isActive} = true
)`;

export async function listCourses(filters: CourseFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(48, Math.max(6, filters.perPage ?? 18));

  const conditions: SQL[] = [eq(courses.status, "PUBLISHED")];

  if (filters.providerId) conditions.push(eq(courses.providerId, filters.providerId));
  if (filters.freeOnly) conditions.push(eq(courses.isFree, true));

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${courses.title}) LIKE ${term}`,
        sql`lower(coalesce(${courses.summary}, '')) LIKE ${term}`,
        sql`lower(coalesce(${providers.name}, '')) LIKE ${term}`,
      )!,
    );
  }

  if (filters.mode?.length) {
    /**
     * An IN list of individually bound values, not `= ANY($1::course_mode[])`.
     *
     * Passing a JS array as one parameter makes the driver send it as a plain
     * string, which Postgres then refuses to read as an array literal. Binding
     * each value separately also lets Postgres resolve them to `course_mode`
     * on its own, so an unrecognised mode is a clean error rather than a cast
     * that succeeds against the wrong type.
     */
    const values = sql.join(
      filters.mode.map((mode) => sql`${mode}`),
      sql`, `,
    );
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${courseBatches}
        WHERE ${courseBatches.courseId} = ${courses.id}
          AND ${courseBatches.isActive} = true
          AND ${courseBatches.mode} IN (${values})
      )`,
    );
  }

  if (filters.city) {
    const city = `%${filters.city.toLowerCase()}%`;
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${courseBatches}
        WHERE ${courseBatches.courseId} = ${courses.id}
          AND lower(coalesce(${courseBatches.city}, '')) LIKE ${city}
      )`,
    );
  }

  if (filters.examId) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${courseTargets}
        WHERE ${courseTargets.courseId} = ${courses.id}
          AND ${courseTargets.examId} = ${filters.examId}
      )`,
    );
  }

  if (filters.careerSlug) {
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${courseTargets}
        WHERE ${courseTargets.courseId} = ${courses.id}
          AND ${courseTargets.careerSlug} = ${filters.careerSlug}
      )`,
    );
  }

  if (filters.maxFee != null) {
    // A course with no published fee is not excluded by a maximum-fee filter:
    // "we don't know" is not "too expensive", and hiding it would quietly
    // narrow the results in a way the filter doesn't claim to.
    conditions.push(
      or(sql`${cheapestBatchFee} IS NULL`, lte(cheapestBatchFee, filters.maxFee), eq(courses.isFree, true))!,
    );
  }

  const where = and(...conditions);

  const orderBy =
    filters.sort === "fee"
      ? [sql`${cheapestBatchFee} ASC NULLS LAST`]
      : filters.sort === "starting-soon"
        ? [sql`${nextStart} ASC NULLS LAST`]
        : [desc(courses.lastVerifiedAt), asc(courses.title)];

  const rows = await db
    .select({
      course: courses,
      providerName: providers.name,
      providerId: providers.id,
      providerVerification: providers.verificationStatus,
      cheapestFee: cheapestBatchFee,
      nextStart,
      batchCount: activeBatchCount,
    })
    .from(courses)
    .leftJoin(providers, eq(providers.id, courses.providerId))
    .where(where)
    .orderBy(...orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(courses)
    .leftJoin(providers, eq(providers.id, courses.providerId))
    .where(where);

  return {
    courses: rows,
    page,
    perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * One course with everything needed to decide about it.
 *
 * Claims come back with their confidence label attached and their source
 * joined, so a caller cannot accidentally render a claim as a bare fact — the
 * only value available IS the labelled one.
 */
export async function getCourseById(id: string) {
  const [row] = await db
    .select({
      course: courses,
      provider: providers,
    })
    .from(courses)
    .leftJoin(providers, eq(providers.id, courses.providerId))
    .where(eq(courses.id, id))
    .limit(1);

  if (!row) throw new NotFoundError("We couldn't find that course.");

  const [batches, claims, targets] = await Promise.all([
    db
      .select()
      .from(courseBatches)
      .where(eq(courseBatches.courseId, id))
      .orderBy(asc(courseBatches.startsOn)),

    db
      .select({
        claim: courseOutcomeClaims,
        sourceName: sources.name,
        sourceUrl: sources.url,
      })
      .from(courseOutcomeClaims)
      .leftJoin(sources, eq(sources.id, courseOutcomeClaims.sourceId))
      .where(eq(courseOutcomeClaims.courseId, id))
      .orderBy(desc(courseOutcomeClaims.confidence)),

    db
      .select({
        target: courseTargets,
        examName: exams.name,
        examSlug: exams.slug,
        careerName: occupations.name,
      })
      .from(courseTargets)
      .leftJoin(exams, eq(exams.id, courseTargets.examId))
      .leftJoin(careerProfiles, eq(careerProfiles.slug, courseTargets.careerSlug))
      .leftJoin(occupations, eq(occupations.id, careerProfiles.occupationId))
      .where(eq(courseTargets.courseId, id)),
  ]);

  return {
    ...row,
    batches,
    activeBatches: batches.filter((batch) => batch.isActive),
    claims,
    targets,
  };
}

export async function listProviders(options: { search?: string; limit?: number } = {}) {
  const conditions: SQL[] = [];
  if (options.search?.trim()) {
    const term = `%${options.search.trim().toLowerCase()}%`;
    conditions.push(sql`lower(${providers.name}) LIKE ${term}`);
  }

  return db
    .select({
      provider: providers,
      courseCount: sql<number>`(
        SELECT count(*)::int FROM ${courses}
        WHERE ${courses.providerId} = ${providers.id} AND ${courses.status} = 'PUBLISHED'
      )`,
    })
    .from(providers)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(providers.name))
    .limit(Math.min(200, options.limit ?? 60));
}

export async function getProviderById(id: string) {
  const [provider] = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  if (!provider) throw new NotFoundError("We couldn't find that provider.");

  const providerCourses = await db
    .select({
      course: courses,
      cheapestFee: cheapestBatchFee,
      nextStart,
      batchCount: activeBatchCount,
    })
    .from(courses)
    .where(and(eq(courses.providerId, id), eq(courses.status, "PUBLISHED")))
    .orderBy(asc(courses.title));

  return { provider, courses: providerCourses };
}

// ---------------------------------------------------------------------------
// Enquiries
// ---------------------------------------------------------------------------

/**
 * Fields a learner may choose to release to a provider.
 *
 * An allow-list, so a future form field cannot start leaking something by
 * being added to the page. `sharedFields` on the row records what was actually
 * released, which is what makes the disclosure auditable after the fact rather
 * than inferred from whatever the form looked like that week.
 */
export const SHAREABLE_FIELDS = ["name", "email", "phone", "message"] as const;
export type ShareableField = (typeof SHAREABLE_FIELDS)[number];

export async function createEnquiry(input: {
  courseId: string;
  batchId?: string | null;
  userId?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  sharedFields: string[];
}) {
  const [course] = await db
    .select({ id: courses.id, title: courses.title, status: courses.status, providerId: courses.providerId })
    .from(courses)
    .where(eq(courses.id, input.courseId))
    .limit(1);

  if (!course) throw new NotFoundError("We couldn't find that course.");
  if (course.status !== "PUBLISHED") {
    throw new ValidationError("That course isn't taking enquiries.");
  }

  if (input.batchId) {
    const [batch] = await db
      .select({ id: courseBatches.id })
      .from(courseBatches)
      .where(and(eq(courseBatches.id, input.batchId), eq(courseBatches.courseId, input.courseId)))
      .limit(1);
    if (!batch) throw new ValidationError("That batch doesn't belong to this course.");
  }

  const shared = input.sharedFields.filter((field) =>
    (SHAREABLE_FIELDS as readonly string[]).includes(field),
  );
  // Name and email are what makes an enquiry answerable at all; the optional
  // ones are phone and message.
  const effective = [...new Set(["name", "email", ...shared])];

  const [enquiry] = await db
    .insert(courseEnquiries)
    .values({
      courseId: input.courseId,
      batchId: input.batchId ?? null,
      userId: input.userId ?? null,
      name: input.name,
      email: input.email,
      phone: effective.includes("phone") ? (input.phone ?? null) : null,
      message: effective.includes("message") ? (input.message ?? null) : null,
      sharedFields: effective,
    })
    .returning();

  await recordAudit({
    actorType: input.userId ? "user" : "system",
    actorId: input.userId ?? null,
    action: "course.enquiry_created",
    entityType: "course",
    entityId: input.courseId,
    after: { enquiryId: enquiry.id, sharedFields: effective },
  });

  /**
   * Tell whoever runs this provider.
   *
   * Only possible when the provider is linked to an organisation — a seeded
   * directory entry for a coaching centre has no account behind it, and the
   * enquiry simply waits in the table rather than being silently dropped or,
   * worse, emailed to an address we scraped.
   */
  if (course.providerId) {
    const members = await db
      .select({ userId: organisationMembers.userId })
      .from(providers)
      .innerJoin(
        organisationMembers,
        eq(organisationMembers.organisationId, providers.organisationId),
      )
      .where(eq(providers.id, course.providerId));

    for (const member of members) {
      await notify({
        userId: member.userId,
        type: "course.enquiry_received",
        title: "New course enquiry",
        body: `Someone asked about "${course.title}".`,
        href: `/providers/${course.providerId}`,
        dedupeKey: `course.enquiry:${enquiry.id}:${member.userId}`,
      });
    }
  }

  return enquiry;
}

/**
 * Provider-side view, authorised through the provider's organisation.
 *
 * Note the join direction: membership is checked against the organisation that
 * OWNS this provider, resolved from the provider row. Taking an organisation
 * id from the caller and checking membership of that would authorise any
 * organisation member to read any provider's enquiries.
 */
export async function listEnquiriesForProvider(providerId: string, userId: string) {
  const [linked] = await db
    .select({ organisationId: providers.organisationId })
    .from(providers)
    .innerJoin(
      organisationMembers,
      eq(organisationMembers.organisationId, providers.organisationId),
    )
    .where(and(eq(providers.id, providerId), eq(organisationMembers.userId, userId)))
    .limit(1);

  if (!linked) throw new ForbiddenError("You don't have access to that provider's enquiries.");

  return db
    .select({
      enquiry: courseEnquiries,
      courseTitle: courses.title,
    })
    .from(courseEnquiries)
    .innerJoin(courses, eq(courses.id, courseEnquiries.courseId))
    .where(eq(courses.providerId, providerId))
    .orderBy(desc(courseEnquiries.createdAt))
    .limit(200);
}

// ---------------------------------------------------------------------------
// Write paths (admin / provider)
// ---------------------------------------------------------------------------

export async function addOutcomeClaim(input: {
  courseId: string;
  metric: string;
  claimedValue: string;
  claimedPeriod?: string | null;
  note?: string | null;
  actorId: string;
}) {
  const [claim] = await db
    .insert(courseOutcomeClaims)
    .values({
      courseId: input.courseId,
      metric: input.metric,
      claimedValue: input.claimedValue,
      claimedPeriod: input.claimedPeriod ?? null,
      note: input.note ?? null,
      // Always starts unverified, whatever the submitter says. Verification is
      // an act someone performs, not a field they fill in.
      confidence: "UNVERIFIED",
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.actorId,
    action: "course.claim_added",
    entityType: "course",
    entityId: input.courseId,
    after: { metric: input.metric, value: input.claimedValue },
  });

  return claim;
}

export async function verifyOutcomeClaim(input: {
  claimId: string;
  adminId: string;
  sourceId: string;
  confidence?: "VERIFIED" | "ESTIMATED";
  note?: string;
}) {
  const [source] = await db.select().from(sources).where(eq(sources.id, input.sourceId)).limit(1);
  if (!source) throw new NotFoundError("That source doesn't exist.");

  const [claim] = await db
    .update(courseOutcomeClaims)
    .set({
      confidence: input.confidence ?? "VERIFIED",
      sourceId: input.sourceId,
      verifiedAt: new Date(),
      note: input.note ?? null,
    })
    .where(eq(courseOutcomeClaims.id, input.claimId))
    .returning();

  if (!claim) throw new NotFoundError("That claim doesn't exist.");

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "course.claim_verified",
    entityType: "course",
    entityId: claim.courseId,
    after: { claimId: claim.id, sourceId: input.sourceId },
  });

  return claim;
}

export async function upsertCourse(input: {
  id?: string;
  providerId: string;
  title: string;
  summary?: string | null;
  format?: string;
  isFree?: boolean;
  duration?: string | null;
  url?: string | null;
  status?: "DRAFT" | "NEEDS_REVIEW" | "PUBLISHED" | "ARCHIVED";
  actorId: string;
}) {
  if (input.id) {
    const [updated] = await db
      .update(courses)
      .set({
        title: input.title,
        summary: input.summary ?? null,
        format: input.format ?? "online",
        isFree: input.isFree ?? false,
        duration: input.duration ?? null,
        url: input.url ?? null,
        ...(input.status ? { status: input.status } : {}),
      })
      .where(eq(courses.id, input.id))
      .returning();
    if (!updated) throw new NotFoundError("That course doesn't exist.");
    return updated;
  }

  const [inserted] = await db
    .insert(courses)
    .values({
      providerId: input.providerId,
      title: input.title,
      summary: input.summary ?? null,
      format: input.format ?? "online",
      isFree: input.isFree ?? false,
      duration: input.duration ?? null,
      url: input.url ?? null,
      status: input.status ?? "DRAFT",
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.actorId,
    action: "course.created",
    entityType: "course",
    entityId: inserted.id,
  });

  return inserted;
}

export async function upsertBatch(input: {
  id?: string;
  courseId: string;
  label: string;
  mode: "ONLINE_LIVE" | "ONLINE_SELF_PACED" | "CLASSROOM" | "HYBRID" | "CORRESPONDENCE";
  startsOn?: Date | null;
  endsOn?: Date | null;
  seatsTotal?: number | null;
  seatsLeft?: number | null;
  feeAmount?: number | null;
  feeNote?: string | null;
  city?: string | null;
  isActive?: boolean;
}) {
  const values = {
    courseId: input.courseId,
    label: input.label,
    mode: input.mode,
    startsOn: input.startsOn ?? null,
    endsOn: input.endsOn ?? null,
    seatsTotal: input.seatsTotal ?? null,
    seatsLeft: input.seatsLeft ?? null,
    feeAmount: input.feeAmount ?? null,
    feeNote: input.feeNote ?? null,
    city: input.city ?? null,
    isActive: input.isActive ?? true,
    lastVerifiedAt: new Date(),
  };

  if (input.id) {
    const [updated] = await db
      .update(courseBatches)
      .set(values)
      .where(eq(courseBatches.id, input.id))
      .returning();
    if (!updated) throw new NotFoundError("That batch doesn't exist.");
    return updated;
  }

  const [inserted] = await db.insert(courseBatches).values(values).returning();
  return inserted;
}

/** Facets for the list page's filter controls. */
export async function courseFilterOptions() {
  const [examRows, cityRows] = await Promise.all([
    db
      .selectDistinct({ id: exams.id, name: exams.name })
      .from(courseTargets)
      .innerJoin(exams, eq(exams.id, courseTargets.examId))
      .orderBy(asc(exams.name))
      .limit(60),
    db
      .selectDistinct({ city: courseBatches.city })
      .from(courseBatches)
      .where(and(eq(courseBatches.isActive, true), sql`${courseBatches.city} IS NOT NULL`))
      .orderBy(asc(courseBatches.city))
      .limit(60),
  ]);

  return {
    exams: examRows,
    cities: cityRows.map((row) => row.city).filter((city): city is string => Boolean(city)),
  };
}
