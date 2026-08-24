import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  countries,
  educationStages,
  regions,
  savedItems,
  skills as skillsTable,
  userGoals,
  userInterests,
  userProfiles,
  userSkills,
  users,
} from "@/db/schema";
import { slugify } from "@/db/id";
import { NotFoundError } from "@/modules/shared/errors";

export const profileSchema = z.object({
  name: z.string().trim().max(120).optional(),
  age: z.number().int().min(10).max(90).nullable().optional(),
  countryIso: z.string().length(2).optional(),
  regionName: z.string().trim().max(80).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  preferredLanguage: z.enum(["en", "hi"]).optional(),

  educationStageSlug: z.string().trim().max(60).nullable().optional(),
  degree: z.string().trim().max(120).nullable().optional(),
  major: z.string().trim().max(120).nullable().optional(),
  institution: z.string().trim().max(160).nullable().optional(),
  academicPerformance: z.string().trim().max(60).nullable().optional(),

  employmentStatus: z
    .enum(["student", "employed", "unemployed", "self_employed", "career_break"])
    .nullable()
    .optional(),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),

  availableBudget: z.number().int().min(0).max(100_000_000).nullable().optional(),
  availableHoursPerDay: z.number().min(0).max(18).nullable().optional(),
  preferredRegionName: z.string().trim().max(80).nullable().optional(),
  willingnessToRelocate: z.boolean().optional(),
  onlineOfflinePreference: z.enum(["online", "offline", "either"]).optional(),
  riskTolerance: z.enum(["low", "medium", "high"]).optional(),
  desiredIncomeMin: z.number().int().min(0).max(100_000_000).nullable().optional(),

  interests: z.array(z.string().trim().max(40)).max(20).optional(),
  skills: z.array(z.string().trim().max(60)).max(60).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export async function getFullProfile(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) throw new NotFoundError("Account not found.");

  const [profileRow] = await db
    .select({
      profile: userProfiles,
      countryIso: countries.isoCode,
      countryName: countries.name,
      currencyCode: countries.currencyCode,
      regionName: regions.name,
      stageSlug: educationStages.slug,
      stageName: educationStages.name,
    })
    .from(userProfiles)
    .leftJoin(countries, eq(userProfiles.countryId, countries.id))
    .leftJoin(regions, eq(userProfiles.regionId, regions.id))
    .leftJoin(educationStages, eq(userProfiles.educationStageId, educationStages.id))
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  const [interests, skillRows, goals, preferredRegion] = await Promise.all([
    db.select({ tag: userInterests.tag }).from(userInterests).where(eq(userInterests.userId, userId)),
    db
      .select({ name: skillsTable.name, source: userSkills.source, proficiency: userSkills.proficiency })
      .from(userSkills)
      .innerJoin(skillsTable, eq(userSkills.skillId, skillsTable.id))
      .where(eq(userSkills.userId, userId)),
    db.select().from(userGoals).where(eq(userGoals.userId, userId)),
    profileRow?.profile.preferredRegionId
      ? db
          .select({ name: regions.name })
          .from(regions)
          .where(eq(regions.id, profileRow.profile.preferredRegionId))
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role, plan: user.plan },
    profile: profileRow?.profile ?? null,
    countryIso: profileRow?.countryIso ?? null,
    countryName: profileRow?.countryName ?? null,
    currencyCode: profileRow?.currencyCode ?? "INR",
    regionName: profileRow?.regionName ?? null,
    preferredRegionName: preferredRegion[0]?.name ?? null,
    stageSlug: profileRow?.stageSlug ?? null,
    stageName: profileRow?.stageName ?? null,
    interests: interests.map((row) => row.tag),
    skills: skillRows,
    goals,
  };
}

export type FullProfile = Awaited<ReturnType<typeof getFullProfile>>;

export async function updateProfile(userId: string, input: ProfileInput) {
  if (input.name !== undefined) {
    await db.update(users).set({ name: input.name || null }).where(eq(users.id, userId));
  }

  const countryId = input.countryIso
    ? (await db.query.countries.findFirst({ where: eq(countries.isoCode, input.countryIso) }))?.id ?? null
    : undefined;

  const regionId =
    input.regionName === undefined
      ? undefined
      : input.regionName === null
        ? null
        : (await findRegionId(input.regionName, countryId ?? undefined)) ?? null;

  const preferredRegionId =
    input.preferredRegionName === undefined
      ? undefined
      : input.preferredRegionName === null
        ? null
        : (await findRegionId(input.preferredRegionName, countryId ?? undefined)) ?? null;

  const educationStageId =
    input.educationStageSlug === undefined
      ? undefined
      : input.educationStageSlug === null
        ? null
        : (
            await db.query.educationStages.findFirst({
              where: eq(educationStages.slug, input.educationStageSlug),
            })
          )?.id ?? null;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) patch[key] = value;
  };

  assign("age", input.age);
  assign("countryId", countryId);
  assign("regionId", regionId);
  assign("city", input.city);
  assign("preferredLanguage", input.preferredLanguage);
  assign("educationStageId", educationStageId);
  assign("degree", input.degree);
  assign("major", input.major);
  assign("institution", input.institution);
  assign("academicPerformance", input.academicPerformance);
  assign("employmentStatus", input.employmentStatus);
  assign("yearsExperience", input.yearsExperience);
  assign("availableBudget", input.availableBudget);
  assign("availableHoursPerDay", input.availableHoursPerDay);
  assign("preferredRegionId", preferredRegionId);
  assign("willingnessToRelocate", input.willingnessToRelocate);
  assign("onlineOfflinePreference", input.onlineOfflinePreference);
  assign("riskTolerance", input.riskTolerance);
  assign("desiredIncomeMin", input.desiredIncomeMin);

  await db
    .insert(userProfiles)
    .values({ userId, ...patch } as never)
    .onConflictDoUpdate({ target: userProfiles.userId, set: patch as never });

  if (input.interests) {
    await db.delete(userInterests).where(eq(userInterests.userId, userId));
    if (input.interests.length) {
      await db
        .insert(userInterests)
        .values(input.interests.map((tag) => ({ userId, tag })))
        .onConflictDoNothing();
    }
  }

  if (input.skills) {
    await setSelfReportedSkills(userId, input.skills);
  }

  return getFullProfile(userId);
}

async function findRegionId(name: string, countryId?: string): Promise<string | undefined> {
  const row = await db.query.regions.findFirst({
    where: countryId ? and(eq(regions.name, name), eq(regions.countryId, countryId)) : eq(regions.name, name),
  });
  return row?.id;
}

/** Replaces self-reported skills, leaving AI-extracted ones alone. */
async function setSelfReportedSkills(userId: string, names: string[]) {
  const cleaned = [...new Set(names.map((name) => name.trim()).filter(Boolean))];

  const existing = await db
    .select({ skillId: userSkills.skillId, source: userSkills.source })
    .from(userSkills)
    .where(eq(userSkills.userId, userId));

  const selfReported = existing.filter((row) => row.source === "self_reported").map((row) => row.skillId);
  if (selfReported.length) {
    await db
      .delete(userSkills)
      .where(and(eq(userSkills.userId, userId), inArray(userSkills.skillId, selfReported)));
  }

  if (!cleaned.length) return;

  const slugs = cleaned.map((name) => slugify(name));
  const found = await db
    .select({ id: skillsTable.id, slug: skillsTable.slug })
    .from(skillsTable)
    .where(inArray(skillsTable.slug, slugs));

  const bySlug = new Map(found.map((row) => [row.slug, row.id]));
  const missing = cleaned.filter((name) => !bySlug.has(slugify(name)));

  if (missing.length) {
    const inserted = await db
      .insert(skillsTable)
      .values(missing.map((name) => ({ name, slug: slugify(name), category: "user" })))
      .onConflictDoNothing()
      .returning({ id: skillsTable.id, slug: skillsTable.slug });
    for (const row of inserted) bySlug.set(row.slug, row.id);
  }

  const values = cleaned
    .map((name) => bySlug.get(slugify(name)))
    .filter((id): id is string => Boolean(id))
    .map((skillId) => ({ userId, skillId, source: "self_reported", proficiency: 3, confirmed: true }));

  if (values.length) await db.insert(userSkills).values(values).onConflictDoNothing();
}

/**
 * Drives the "your profile is N% complete" nudge. Weighted by how much each
 * field actually improves recommendations — budget and hours matter far more
 * than institution name, and the prompt should reflect that.
 */
export function profileCompleteness(profile: FullProfile): {
  percent: number;
  missing: { field: string; label: string; weight: number }[];
} {
  const checks: { field: string; label: string; weight: number; done: boolean }[] = [
    { field: "age", label: "Your age", weight: 10, done: profile.profile?.age != null },
    { field: "location", label: "Where you are", weight: 10, done: Boolean(profile.regionName || profile.profile?.city) },
    { field: "education", label: "Your education level", weight: 15, done: Boolean(profile.stageSlug || profile.profile?.degree) },
    { field: "interests", label: "What interests you", weight: 15, done: profile.interests.length > 0 },
    { field: "skills", label: "Skills you have", weight: 15, done: profile.skills.length > 0 },
    { field: "goals", label: "What you're aiming for", weight: 15, done: profile.goals.length > 0 },
    { field: "budget", label: "Your budget", weight: 10, done: profile.profile?.availableBudget != null },
    { field: "hours", label: "Study hours you have", weight: 10, done: profile.profile?.availableHoursPerDay != null },
  ];

  const earned = checks.filter((check) => check.done).reduce((sum, check) => sum + check.weight, 0);
  return {
    percent: earned,
    missing: checks
      .filter((check) => !check.done)
      .map(({ field, label, weight }) => ({ field, label, weight }))
      .sort((a, b) => b.weight - a.weight),
  };
}

// ---------------------------------------------------------------------------
// Saved items
// ---------------------------------------------------------------------------

export async function toggleSaved(input: {
  userId: string;
  itemType: string;
  itemId: string;
  label?: string;
}): Promise<{ saved: boolean }> {
  const existing = await db.query.savedItems.findFirst({
    where: and(
      eq(savedItems.userId, input.userId),
      eq(savedItems.itemType, input.itemType),
      eq(savedItems.itemId, input.itemId),
    ),
  });

  if (existing) {
    await db.delete(savedItems).where(eq(savedItems.id, existing.id));
    return { saved: false };
  }

  await db.insert(savedItems).values({
    userId: input.userId,
    itemType: input.itemType,
    itemId: input.itemId,
    label: input.label ?? null,
  });
  return { saved: true };
}

export async function listSaved(userId: string, itemType?: string) {
  return db
    .select()
    .from(savedItems)
    .where(
      itemType
        ? and(eq(savedItems.userId, userId), eq(savedItems.itemType, itemType))
        : eq(savedItems.userId, userId),
    )
    .orderBy(savedItems.savedAt);
}

export async function isSaved(userId: string, itemType: string, itemId: string): Promise<boolean> {
  const row = await db.query.savedItems.findFirst({
    where: and(
      eq(savedItems.userId, userId),
      eq(savedItems.itemType, itemType),
      eq(savedItems.itemId, itemId),
    ),
  });
  return Boolean(row);
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export const goalSchema = z.object({
  goalType: z.enum([
    "get_job",
    "change_career",
    "government_job",
    "study_abroad",
    "start_business",
    "freelance",
    "increase_salary",
    "learn_skill",
    "prepare_exam",
    "become_professional",
  ]),
  targetCareerSlug: z.string().optional(),
  targetExamSlug: z.string().optional(),
  targetDate: z.string().datetime().optional(),
  note: z.string().max(500).optional(),
});

export async function addGoal(userId: string, input: z.infer<typeof goalSchema>) {
  const careerId = input.targetCareerSlug
    ? (
        await db.query.careerProfiles.findFirst({
          where: (table, { eq: equals }) => equals(table.slug, input.targetCareerSlug!),
        })
      )?.id ?? null
    : null;

  const examId = input.targetExamSlug
    ? (
        await db.query.exams.findFirst({
          where: (table, { eq: equals }) => equals(table.slug, input.targetExamSlug!),
        })
      )?.id ?? null
    : null;

  const [goal] = await db
    .insert(userGoals)
    .values({
      userId,
      goalType: input.goalType,
      targetCareerProfileId: careerId,
      targetExamId: examId,
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
      note: input.note ?? null,
    })
    .returning();

  return goal;
}

export async function removeGoal(userId: string, goalId: string) {
  await db.delete(userGoals).where(and(eq(userGoals.id, goalId), eq(userGoals.userId, userId)));
}
