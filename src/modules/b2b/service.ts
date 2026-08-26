/**
 * B2B — institutions and cohorts.
 *
 * An institution dashboard is a surveillance product unless you design against
 * it. A college that can see which of its students looked at which careers,
 * how they scored on an assessment, and which jobs they applied to has been
 * handed something students never agreed to give it — and students who suspect
 * that is happening will simply stop using the honest features, which are the
 * ones that help them.
 *
 * Three rules make this a reporting tool rather than a monitoring one, and all
 * three are enforced in this file:
 *
 *  1. **Consent gates membership.** An institution can invite; it cannot add.
 *     A student who has not accepted contributes nothing to any figure.
 *  2. **Aggregates only, with a floor.** No query here returns a row about a
 *     named student. Every breakdown is suppressed unless at least
 *     MIN_COHORT_SIZE consented students fall into it, so a "1 student is
 *     considering leaving education" cell can never appear.
 *  3. **Students see what is shared.** `cohortDisclosureForUser` exists so the
 *     student-facing side can state exactly what their institution can see.
 */
import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { db } from "@/db/client";
import {
  assessments,
  careerProfiles,
  cohortMembers,
  cohorts,
  occupations,
  organisationMembers,
  organisations,
  roadmaps,
  savedItems,
  userGoals,
  userProfiles,
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

/**
 * Smallest group whose aggregate may be shown.
 *
 * Five is the conventional floor for small-cell suppression in published
 * statistics. Below it, a figure plus a little outside knowledge identifies a
 * person — and in a cohort of thirty students who all know each other, "one
 * person is looking at dropping out" identifies them to their classmates too.
 */
export const MIN_COHORT_SIZE = 5;

export async function requireInstitutionMember(userId: string, organisationId: string) {
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

  if (!row) throw new ForbiddenError("You don't have access to that institution.");
  return row;
}

/** Authorises against the cohort's OWNING organisation, resolved from the row. */
export async function requireCohortAccess(userId: string, cohortId: string) {
  const [row] = await db
    .select({ cohort: cohorts, organisation: organisations })
    .from(cohorts)
    .innerJoin(organisations, eq(organisations.id, cohorts.organisationId))
    .where(eq(cohorts.id, cohortId))
    .limit(1);

  if (!row) throw new NotFoundError("That cohort doesn't exist.");
  await requireInstitutionMember(userId, row.cohort.organisationId);
  return row;
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

export async function listCohorts(organisationId: string, userId: string) {
  await requireInstitutionMember(userId, organisationId);

  return db
    .select({
      cohort: cohorts,
      consented: sql<number>`(
        SELECT count(*)::int FROM ${cohortMembers}
        WHERE ${cohortMembers.cohortId} = ${cohorts.id}
          AND ${cohortMembers.status} = 'ACTIVE'
          AND ${cohortMembers.consentedAt} IS NOT NULL
      )`,
      invited: sql<number>`(
        SELECT count(*)::int FROM ${cohortMembers}
        WHERE ${cohortMembers.cohortId} = ${cohorts.id}
          AND ${cohortMembers.status} = 'INVITED'
      )`,
    })
    .from(cohorts)
    .where(eq(cohorts.organisationId, organisationId))
    .orderBy(desc(cohorts.createdAt));
}

export async function createCohort(input: {
  organisationId: string;
  userId: string;
  name: string;
  academicYear?: string | null;
  description?: string | null;
}) {
  await requireInstitutionMember(input.userId, input.organisationId);

  // Seats are an entitlement, so an institution cannot quietly outgrow what it
  // bought by creating more cohorts.
  const { entitlements } = await getEntitlements(input.userId);
  if (entitlements.cohortSeats <= 0) {
    throw new ValidationError(
      "Cohorts are part of the institution plan. Your account doesn't include student seats.",
    );
  }

  const joinCode = randomBytes(4).toString("hex").toUpperCase();
  const joinCodeHash = await bcrypt.hash(joinCode, 12);

  const [cohort] = await db
    .insert(cohorts)
    .values({
      organisationId: input.organisationId,
      name: input.name,
      academicYear: input.academicYear ?? null,
      description: input.description ?? null,
      joinCodeHash,
      createdById: input.userId,
    })
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "cohort.created",
    entityType: "cohort",
    entityId: cohort.id,
    after: { name: cohort.name },
  });

  // The plain code is shown once, to the creator, and never stored.
  return { cohort, joinCode };
}

/**
 * Records invitations.
 *
 * Deliberately does NOT create memberships. Each row is INVITED with a null
 * `consentedAt`, and stays outside every aggregate until the student accepts.
 */
export async function inviteToCohort(input: {
  cohortId: string;
  userId: string;
  emails: string[];
}) {
  const { cohort } = await requireCohortAccess(input.userId, input.cohortId);

  const { entitlements } = await getEntitlements(input.userId);
  const [{ existing }] = await db
    .select({ existing: count() })
    .from(cohortMembers)
    .where(eq(cohortMembers.cohortId, input.cohortId));

  const emails = [...new Set(input.emails.map((email) => email.toLowerCase().trim()))].filter(
    Boolean,
  );

  if (existing + emails.length > entitlements.cohortSeats) {
    throw new ValidationError(
      `That would take this cohort past your ${entitlements.cohortSeats} student seats.`,
    );
  }

  let invited = 0;
  let alreadyMembers = 0;

  for (const email of emails) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (user) {
      const [clash] = await db
        .select({ id: cohortMembers.id })
        .from(cohortMembers)
        .where(
          and(eq(cohortMembers.cohortId, input.cohortId), eq(cohortMembers.userId, user.id)),
        )
        .limit(1);
      if (clash) {
        alreadyMembers += 1;
        continue;
      }
    }

    await db.insert(cohortMembers).values({
      cohortId: input.cohortId,
      userId: user?.id ?? null,
      inviteEmail: email,
      status: "INVITED",
      consentedAt: null,
    });
    invited += 1;

    if (user) {
      await notify({
        userId: user.id,
        type: "cohort.invited",
        title: `${cohort.name} invited you`,
        body: "Joining shares aggregate progress with your institution. You choose whether to accept.",
        href: "/dashboard/cohorts",
        dedupeKey: `cohort.invited:${input.cohortId}:${user.id}`,
      });
    }
  }

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "cohort.invited",
    entityType: "cohort",
    entityId: input.cohortId,
    after: { invited, alreadyMembers },
  });

  return { invited, alreadyMembers };
}

/** The student's own action. Nothing else may set `consentedAt`. */
export async function acceptCohortInvite(cohortId: string, userId: string) {
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new NotFoundError("We couldn't find your account.");

  const [invite] = await db
    .select()
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.status, "INVITED"),
        sql`(${cohortMembers.userId} = ${userId} OR lower(${cohortMembers.inviteEmail}) = ${user.email.toLowerCase()})`,
      ),
    )
    .limit(1);

  if (!invite) throw new NotFoundError("We couldn't find that invitation.");

  const [updated] = await db
    .update(cohortMembers)
    .set({ userId, status: "ACTIVE", consentedAt: new Date() })
    .where(eq(cohortMembers.id, invite.id))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "cohort.joined",
    entityType: "cohort",
    entityId: cohortId,
  });

  return updated;
}

/** A student may leave at any time; their data leaves the aggregates with them. */
export async function leaveCohort(cohortId: string, userId: string) {
  const [updated] = await db
    .update(cohortMembers)
    .set({ status: "REMOVED", removedAt: new Date(), consentedAt: null })
    .where(and(eq(cohortMembers.cohortId, cohortId), eq(cohortMembers.userId, userId)))
    .returning();

  if (!updated) throw new NotFoundError("You're not in that cohort.");

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "cohort.left",
    entityType: "cohort",
    entityId: cohortId,
  });

  return updated;
}

export async function removeCohortMember(input: {
  cohortId: string;
  memberId: string;
  userId: string;
}) {
  await requireCohortAccess(input.userId, input.cohortId);

  const [updated] = await db
    .update(cohortMembers)
    .set({ status: "REMOVED", removedAt: new Date(), consentedAt: null })
    .where(
      and(eq(cohortMembers.id, input.memberId), eq(cohortMembers.cohortId, input.cohortId)),
    )
    .returning();

  if (!updated) throw new NotFoundError("That member isn't in this cohort.");
  return updated;
}

/**
 * The member list an institution may see.
 *
 * Names and emails only, plus whether they have consented. Deliberately no
 * per-student activity: this screen exists to manage membership, and a
 * "students" tab that also shows what each one has been doing is exactly the
 * design this module is written to avoid.
 */
export async function listCohortMembers(cohortId: string, userId: string) {
  await requireCohortAccess(userId, cohortId);

  return db
    .select({
      member: cohortMembers,
      name: users.name,
      email: users.email,
    })
    .from(cohortMembers)
    .leftJoin(users, eq(users.id, cohortMembers.userId))
    // The cohort predicate belongs in the query. Filtering in JS afterwards
    // gave the right answer while loading every INVITED or ACTIVE member on the
    // platform, joined to their name and email — a latency cliff, and one
    // refactor away from returning all of it.
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        inArray(cohortMembers.status, ["INVITED", "ACTIVE"]),
      ),
    )
    .orderBy(asc(cohortMembers.createdAt))
;
}

// ---------------------------------------------------------------------------
// Analytics — aggregates only, suppressed below MIN_COHORT_SIZE
// ---------------------------------------------------------------------------

export type SuppressedBreakdown = {
  suppressed: true;
  reason: string;
};

export type Breakdown = {
  suppressed: false;
  rows: { label: string; value: number }[];
};

function suppress(rows: { label: string; value: number }[], consented: number): Breakdown | SuppressedBreakdown {
  if (consented < MIN_COHORT_SIZE) {
    return {
      suppressed: true,
      reason: `Shown once at least ${MIN_COHORT_SIZE} students have joined. Below that, a breakdown can identify individuals.`,
    };
  }
  // Small cells are dropped rather than shown, for the same reason.
  return { suppressed: false, rows: rows.filter((row) => row.value >= MIN_COHORT_SIZE) };
}

export async function cohortAnalytics(cohortId: string, userId: string) {
  const { cohort } = await requireCohortAccess(userId, cohortId);

  const consentedRows = await db
    .select({ userId: cohortMembers.userId })
    .from(cohortMembers)
    .where(
      and(
        eq(cohortMembers.cohortId, cohortId),
        eq(cohortMembers.status, "ACTIVE"),
        isNotNull(cohortMembers.consentedAt),
      ),
    );

  const memberIds = consentedRows
    .map((row) => row.userId)
    .filter((id): id is string => Boolean(id));
  const consented = memberIds.length;

  const [{ invitedTotal }] = await db
    .select({ invitedTotal: count() })
    .from(cohortMembers)
    .where(eq(cohortMembers.cohortId, cohortId));

  if (consented < MIN_COHORT_SIZE) {
    const reason = `Figures appear once at least ${MIN_COHORT_SIZE} students have joined and consented. ${consented} of ${invitedTotal} have so far.`;
    return {
      cohort,
      consented,
      invitedTotal,
      minCohortSize: MIN_COHORT_SIZE,
      // Even the engagement counters are withheld below the floor: "1
      // assessment taken" in a cohort of two is about a person.
      engagement: { assessmentsTaken: 0, roadmapsStarted: 0, goalsSet: 0 },
      topCareers: { suppressed: true, reason } as Breakdown | SuppressedBreakdown,
      educationStages: { suppressed: true, reason } as Breakdown | SuppressedBreakdown,
    };
  }

  const [assessmentRows, roadmapRows, goalRows, savedRows, stageRows] = await Promise.all([
    db
      .select({ value: count() })
      .from(assessments)
      .where(inArray(assessments.userId, memberIds)),
    db.select({ value: count() }).from(roadmaps).where(inArray(roadmaps.userId, memberIds)),
    db.select({ value: count() }).from(userGoals).where(inArray(userGoals.userId, memberIds)),
    db
      .select({
        label: occupations.name,
        value: sql<number>`count(*)::int`,
      })
      .from(savedItems)
      .innerJoin(careerProfiles, eq(careerProfiles.id, savedItems.itemId))
      .innerJoin(occupations, eq(occupations.id, careerProfiles.occupationId))
      .where(and(inArray(savedItems.userId, memberIds), eq(savedItems.itemType, "career")))
      .groupBy(occupations.name)
      .orderBy(desc(sql`count(*)`))
      .limit(12),
    db
      .select({
        label: sql<string>`coalesce(${userProfiles.degree}, 'Not stated')`,
        value: sql<number>`count(*)::int`,
      })
      .from(userProfiles)
      .where(inArray(userProfiles.userId, memberIds))
      .groupBy(sql`coalesce(${userProfiles.degree}, 'Not stated')`)
      .orderBy(desc(sql`count(*)`))
      .limit(12),
  ]);

  return {
    cohort,
    consented,
    invitedTotal,
    minCohortSize: MIN_COHORT_SIZE,
    engagement: {
      assessmentsTaken: assessmentRows[0]?.value ?? 0,
      roadmapsStarted: roadmapRows[0]?.value ?? 0,
      goalsSet: goalRows[0]?.value ?? 0,
    },
    topCareers: suppress(savedRows, consented),
    educationStages: suppress(stageRows, consented),
  };
}

/**
 * What a student's institutions can see about them.
 *
 * Powers the student-facing disclosure. Written as a function returning the
 * actual list rather than as static copy, so it cannot drift out of date if
 * the analytics above ever change.
 */
export async function cohortDisclosureForUser(userId: string) {
  const memberships = await db
    .select({
      member: cohortMembers,
      cohort: cohorts,
      organisationName: organisations.name,
    })
    .from(cohortMembers)
    .innerJoin(cohorts, eq(cohorts.id, cohortMembers.cohortId))
    .innerJoin(organisations, eq(organisations.id, cohorts.organisationId))
    .where(inArray(cohortMembers.status, ["INVITED", "ACTIVE"]))
    .orderBy(desc(cohortMembers.createdAt))
    .then((rows) => rows.filter((row) => row.member.userId === userId));

  return {
    memberships,
    shared: [
      "That you're a member of the cohort",
      "Counts only: how many people took an assessment, started a roadmap or set a goal",
      `Popular careers across the cohort, and only where at least ${MIN_COHORT_SIZE} people picked the same one`,
    ],
    notShared: [
      "Your assessment answers or results",
      "Your roadmaps, goals or study plans",
      "Which jobs you looked at or applied to",
      "Your saved conversations with the assistant, from before it was withdrawn",
      "Your documents or anything extracted from them",
      "Anything at all identified to you personally",
    ],
  };
}

export async function getInstitutionForUser(userId: string) {
  const [row] = await db
    .select({ organisation: organisations, role: organisationMembers.role })
    .from(organisationMembers)
    .innerJoin(organisations, eq(organisations.id, organisationMembers.organisationId))
    .where(
      and(eq(organisationMembers.userId, userId), eq(organisations.type, "institution")),
    )
    .limit(1);
  return row ?? null;
}

/** CSV of the aggregate report — never per-student rows. */
export async function exportCohortReport(cohortId: string, userId: string): Promise<string> {
  const analytics = await cohortAnalytics(cohortId, userId);

  const lines: string[] = [
    `Cohort,${JSON.stringify(analytics.cohort.name)}`,
    `Consented students,${analytics.consented}`,
    `Invited total,${analytics.invitedTotal}`,
    "",
    "Metric,Value",
    `Assessments taken,${analytics.engagement.assessmentsTaken}`,
    `Roadmaps started,${analytics.engagement.roadmapsStarted}`,
    `Goals set,${analytics.engagement.goalsSet}`,
    "",
  ];

  lines.push("Popular careers,Count");
  if (analytics.topCareers.suppressed) {
    lines.push(`"${analytics.topCareers.reason}",`);
  } else {
    for (const row of analytics.topCareers.rows) {
      lines.push(`${JSON.stringify(row.label)},${row.value}`);
    }
  }

  return lines.join("\n");
}
