import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { likePattern } from "@/modules/shared/params";
import {
  aiUsageLogs,
  auditLogs,
  careerProfiles,
  exams,
  jobPostings,
  occupations,
  organisations,
  sources,
  userDocuments,
  users,
} from "@/db/schema";

export async function adminOverview() {
  const since = new Date(Date.now() - 7 * 86_400_000);

  const [
    userCount,
    newUsers,
    careerPublished,
    careerDraft,
    examPublished,
    examDraft,
    jobActive,
    pendingOrgs,
    documentCount,
    aiUsage,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(gte(users.createdAt, since)),
    db.select({ value: count() }).from(careerProfiles).where(eq(careerProfiles.status, "PUBLISHED")),
    db.select({ value: count() }).from(careerProfiles).where(eq(careerProfiles.status, "DRAFT")),
    db.select({ value: count() }).from(exams).where(eq(exams.status, "PUBLISHED")),
    db.select({ value: count() }).from(exams).where(eq(exams.status, "DRAFT")),
    db.select({ value: count() }).from(jobPostings).where(eq(jobPostings.status, "ACTIVE")),
    db
      .select({ value: count() })
      .from(organisations)
      .where(eq(organisations.verificationStatus, "PENDING")),
    db.select({ value: count() }).from(userDocuments),
    db
      .select({
        calls: count(),
        cost: sql<number>`COALESCE(SUM(${aiUsageLogs.costEstimate}), 0)::float`,
        tokens: sql<number>`COALESCE(SUM(${aiUsageLogs.inputTokens} + ${aiUsageLogs.outputTokens}), 0)::int`,
      })
      .from(aiUsageLogs)
      .where(gte(aiUsageLogs.createdAt, since)),
  ]);

  return {
    users: { total: userCount[0].value, newThisWeek: newUsers[0].value },
    careers: { published: careerPublished[0].value, draft: careerDraft[0].value },
    exams: { published: examPublished[0].value, draft: examDraft[0].value },
    jobs: { active: jobActive[0].value },
    organisations: { pending: pendingOrgs[0].value },
    documents: { total: documentCount[0].value },
    ai: {
      callsThisWeek: aiUsage[0].calls,
      costThisWeek: aiUsage[0].cost,
      tokensThisWeek: aiUsage[0].tokens,
    },
  };
}

export async function listCareersForAdmin(status?: string) {
  return db
    .select({
      id: careerProfiles.id,
      slug: careerProfiles.slug,
      name: occupations.name,
      status: careerProfiles.status,
      sourceName: sources.name,
      lastVerifiedAt: careerProfiles.lastVerifiedAt,
      updatedAt: careerProfiles.updatedAt,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .leftJoin(sources, eq(careerProfiles.sourceId, sources.id))
    .where(status ? eq(careerProfiles.status, status as never) : undefined)
    .orderBy(desc(careerProfiles.updatedAt))
    .limit(200);
}

export async function listExamsForAdmin(status?: string) {
  return db
    .select({
      id: exams.id,
      slug: exams.slug,
      name: exams.name,
      shortName: exams.shortName,
      status: exams.status,
      category: exams.category,
      sourceName: sources.name,
      lastVerifiedAt: exams.lastVerifiedAt,
      updatedAt: exams.updatedAt,
    })
    .from(exams)
    .leftJoin(sources, eq(exams.sourceId, sources.id))
    .where(status ? eq(exams.status, status as never) : undefined)
    .orderBy(desc(exams.updatedAt))
    .limit(200);
}

export async function listOrganisationsForReview() {
  return db
    .select()
    .from(organisations)
    .orderBy(desc(organisations.createdAt))
    .limit(100);
}

export async function listUsersForAdmin(search?: string) {
  return db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      plan: users.plan,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .where(search ? sql`lower(${users.email}) LIKE ${likePattern(search)}` : undefined)
    .orderBy(desc(users.createdAt))
    .limit(100);
}

export async function listAuditLog(filters: { entityType?: string; limit?: number } = {}) {
  return db
    .select()
    .from(auditLogs)
    .where(filters.entityType ? eq(auditLogs.entityType, filters.entityType) : undefined)
    .orderBy(desc(auditLogs.createdAt))
    .limit(filters.limit ?? 100);
}

export async function listSources() {
  return db.select().from(sources).orderBy(desc(sources.createdAt)).limit(200);
}

export async function aiUsageByDay(days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${aiUsageLogs.createdAt}), 'YYYY-MM-DD')`,
      calls: count(),
      cost: sql<number>`COALESCE(SUM(${aiUsageLogs.costEstimate}), 0)::float`,
    })
    .from(aiUsageLogs)
    .where(gte(aiUsageLogs.createdAt, since))
    .groupBy(sql`date_trunc('day', ${aiUsageLogs.createdAt})`)
    .orderBy(sql`date_trunc('day', ${aiUsageLogs.createdAt})`);
  return rows;
}

export async function reviewOrganisation(input: {
  organisationId: string;
  adminId: string;
  decision: "VERIFIED" | "REJECTED";
  note?: string;
}) {
  await db
    .update(organisations)
    .set({
      verificationStatus: input.decision,
      reviewNote: input.note ?? null,
      reviewedAt: new Date(),
    })
    .where(eq(organisations.id, input.organisationId));
}
