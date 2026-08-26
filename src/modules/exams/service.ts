import { and, asc, desc, eq, gte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  countries,
  examEditions,
  examPayStructures,
  examSelectionSteps,
  examStages,
  examSyllabusTopics,
  exams,
  govOrganisations,
  learningResources,
  sources,
  type Feasibility,
  type StudyPlanShape,
} from "@/db/schema";
import { likePattern } from "@/modules/shared/params";
import { NotFoundError } from "@/modules/shared/errors";
import { getCountryIso } from "@/modules/geo/service";

export type ExamFilters = {
  country?: string;
  category?: string;
  search?: string;
  maxAge?: number;
  page?: number;
  perPage?: number;
};

export async function listExams(filters: ExamFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(60, Math.max(6, filters.perPage ?? 24));
  const countryIso = filters.country ?? (await getCountryIso());

  const conditions: SQL[] = [eq(exams.status, "PUBLISHED"), eq(countries.isoCode, countryIso)];
  if (filters.category) conditions.push(eq(exams.category, filters.category));
  if (filters.search?.trim()) {
    const term = likePattern(filters.search);
    conditions.push(
      or(
        sql`lower(${exams.name}) LIKE ${term}`,
        sql`lower(${exams.shortName}) LIKE ${term}`,
        sql`lower(${exams.description}) LIKE ${term}`,
        sql`lower(${govOrganisations.name}) LIKE ${term}`,
      )!,
    );
  }
  // "Which exams can I still apply for at my age?" — the upper age limit lives
  // in JSONB because relaxation rules differ per exam, so it's queried as JSON.
  if (filters.maxAge != null) {
    conditions.push(
      sql`COALESCE((${exams.ageLimit} ->> 'max')::int, 999) >= ${filters.maxAge}
          AND COALESCE((${exams.ageLimit} ->> 'min')::int, 0) <= ${filters.maxAge}`,
    );
  }

  const rows = await db
    .select({
      id: exams.id,
      slug: exams.slug,
      name: exams.name,
      shortName: exams.shortName,
      category: exams.category,
      description: exams.description,
      difficultyLevel: exams.difficultyLevel,
      preparationMonthsTypical: exams.preparationMonthsTypical,
      ageLimit: exams.ageLimit,
      educationRequirement: exams.educationRequirement,
      organisationName: govOrganisations.name,
      organisationShort: govOrganisations.shortName,
      officialWebsite: exams.officialWebsite,
      lastVerifiedAt: exams.lastVerifiedAt,
    })
    .from(exams)
    .innerJoin(govOrganisations, eq(exams.organisationId, govOrganisations.id))
    .innerJoin(countries, eq(exams.countryId, countries.id))
    .where(and(...conditions))
    .orderBy(asc(exams.name))
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(exams)
    .innerJoin(govOrganisations, eq(exams.organisationId, govOrganisations.id))
    .innerJoin(countries, eq(exams.countryId, countries.id))
    .where(and(...conditions));

  return { items: rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function listExamCategories(country?: string) {
  const countryIso = country ?? (await getCountryIso());
  return db
    .select({ category: exams.category, count: sql<number>`count(*)::int` })
    .from(exams)
    .innerJoin(countries, eq(exams.countryId, countries.id))
    .where(and(eq(exams.status, "PUBLISHED"), eq(countries.isoCode, countryIso)))
    .groupBy(exams.category)
    .orderBy(desc(sql`count(*)`));
}

export async function getExamBySlug(slug: string) {
  const [row] = await db
    .select({
      exam: exams,
      organisation: govOrganisations,
      country: countries,
      source: sources,
    })
    .from(exams)
    .innerJoin(govOrganisations, eq(exams.organisationId, govOrganisations.id))
    .innerJoin(countries, eq(exams.countryId, countries.id))
    .leftJoin(sources, eq(exams.sourceId, sources.id))
    .where(eq(exams.slug, slug))
    .limit(1);

  if (!row) throw new NotFoundError("We don't have a guide for that exam yet.");

  const [stages, topics, selection, pay, editions, resources] = await Promise.all([
    db.select().from(examStages).where(eq(examStages.examId, row.exam.id)).orderBy(asc(examStages.sequence)),
    db
      .select()
      .from(examSyllabusTopics)
      .where(eq(examSyllabusTopics.examId, row.exam.id))
      .orderBy(asc(examSyllabusTopics.sequence)),
    db
      .select()
      .from(examSelectionSteps)
      .where(eq(examSelectionSteps.examId, row.exam.id))
      .orderBy(asc(examSelectionSteps.sequence)),
    db.select().from(examPayStructures).where(eq(examPayStructures.examId, row.exam.id)),
    db
      .select()
      .from(examEditions)
      .where(eq(examEditions.examId, row.exam.id))
      .orderBy(desc(examEditions.year)),
    db
      .select()
      .from(learningResources)
      .where(eq(learningResources.examId, row.exam.id))
      .orderBy(asc(learningResources.sequence)),
  ]);

  const subjects = new Map<string, typeof topics>();
  for (const topic of topics) {
    const list = subjects.get(topic.subject) ?? [];
    list.push(topic);
    subjects.set(topic.subject, list);
  }

  return {
    ...row,
    stages,
    topics,
    subjects: [...subjects.entries()].map(([subject, items]) => ({ subject, topics: items })),
    selection,
    pay,
    editions,
    resources,
    resourcesByTier: {
      free: resources.filter((r) => r.budgetTier === "free"),
      low: resources.filter((r) => r.budgetTier === "low"),
      standard: resources.filter((r) => r.budgetTier === "standard"),
    },
  };
}

export type ExamDetail = Awaited<ReturnType<typeof getExamBySlug>>;

/** Exams currently inside their application window, for the dashboard. */
export async function upcomingDeadlines(limit = 5) {
  return db
    .select({
      examSlug: exams.slug,
      examName: exams.name,
      shortName: exams.shortName,
      year: examEditions.year,
      applicationEnd: examEditions.applicationEnd,
      notificationUrl: examEditions.officialNotificationUrl,
    })
    .from(examEditions)
    .innerJoin(exams, eq(examEditions.examId, exams.id))
    .where(
      and(
        eq(examEditions.status, "PUBLISHED"),
        gte(examEditions.applicationEnd, new Date()),
      ),
    )
    .orderBy(asc(examEditions.applicationEnd))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Study plan generation
// ---------------------------------------------------------------------------

/**
 * Turns a syllabus plus "I can study N hours a day" into a month-by-month plan.
 *
 * The workload model is deliberately transparent: each syllabus topic carries a
 * weight (1..5) and one weight unit is treated as ~6 focused hours. The output
 * always states the assumption, and `feasibility` reports the arithmetic rather
 * than a promise — a plan that doesn't fit is labelled, not quietly compressed.
 */
const HOURS_PER_WEIGHT_UNIT = 6;
const REVISION_SHARE = 0.25;
const PRACTICE_SHARE = 0.15;

export function buildStudyPlan(input: {
  topics: { subject: string; topic: string; weightEstimate: number }[];
  hoursPerDay: number;
  targetDate: Date;
  now?: Date;
}): { plan: StudyPlanShape; feasibility: Feasibility } {
  const now = input.now ?? new Date();
  const totalDays = Math.max(1, Math.ceil((input.targetDate.getTime() - now.getTime()) / 86_400_000));
  const totalMonths = Math.max(1, Math.round(totalDays / 30));

  const learningHours = input.topics.reduce(
    (sum, topic) => sum + topic.weightEstimate * HOURS_PER_WEIGHT_UNIT,
    0,
  );
  const totalHours = Math.round(learningHours * (1 + REVISION_SHARE + PRACTICE_SHARE));

  const availableHoursPerWeek = Math.round(input.hoursPerDay * 7 * 10) / 10;
  const weeksAvailable = Math.max(1, totalDays / 7);
  const impliedHoursPerWeek = Math.round((totalHours / weeksAvailable) * 10) / 10;

  const ratio = impliedHoursPerWeek / Math.max(0.1, availableHoursPerWeek);
  const verdict: Feasibility["verdict"] =
    ratio <= 0.85 ? "ACHIEVABLE" : ratio <= 1.05 ? "DIFFICULT" : ratio <= 1.6 ? "NEEDS_ADJUSTMENT" : "HIGHLY_UNLIKELY";

  const note = (() => {
    switch (verdict) {
      case "ACHIEVABLE":
        return `At ${input.hoursPerDay} hours a day you have roughly ${availableHoursPerWeek} hours a week, and this syllabus works out to about ${impliedHoursPerWeek} hours a week over your timeline. That leaves some slack. Actual progress still depends on your starting knowledge and how much of the syllabus you already know.`;
      case "DIFFICULT":
        return `This needs about ${impliedHoursPerWeek} hours a week and you have roughly ${availableHoursPerWeek}. It fits, but with almost no margin for a bad week. Consider starting earlier or trimming optional topics.`;
      case "NEEDS_ADJUSTMENT":
        return `This syllabus works out to about ${impliedHoursPerWeek} hours a week, and you have roughly ${availableHoursPerWeek}. Something has to give: extend the timeline, raise daily hours, or target a later attempt. The plan below shows the full syllabus so you can decide what to cut.`;
      case "HIGHLY_UNLIKELY":
        return `Covering this syllabus by your target date would take roughly ${impliedHoursPerWeek} hours a week against the ${availableHoursPerWeek} you have. We won't tell you it's fine — it isn't, at this pace. A later target date or a substantially higher daily commitment is the realistic option.`;
    }
  })();

  // Distribute topics across months by weight so heavy subjects don't all
  // land in the same block.
  const sorted = [...input.topics].sort((a, b) => b.weightEstimate - a.weightEstimate);
  const buckets: { topics: string[]; hours: number }[] = Array.from({ length: totalMonths }, () => ({
    topics: [],
    hours: 0,
  }));
  for (const topic of sorted) {
    const lightest = buckets.reduce((min, bucket) => (bucket.hours < min.hours ? bucket : min), buckets[0]);
    lightest.topics.push(`${topic.subject}: ${topic.topic}`);
    lightest.hours += topic.weightEstimate * HOURS_PER_WEIGHT_UNIT;
  }

  const monthLabel = (index: number) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index, 1);
    return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };

  const plan: StudyPlanShape = {
    months: buckets.map((bucket, index) => ({
      index: index + 1,
      label: monthLabel(index),
      topics: bucket.topics,
      hours: Math.round(bucket.hours),
    })),
    weekly: [
      { day: "Monday – Thursday", focus: "New syllabus topics", hours: input.hoursPerDay },
      { day: "Friday", focus: "Current affairs and revision of the week's topics", hours: input.hoursPerDay },
      { day: "Saturday", focus: "Full-length or sectional mock test", hours: Math.max(2, input.hoursPerDay) },
      { day: "Sunday", focus: "Mock analysis and weak-topic repair", hours: Math.max(1, input.hoursPerDay - 1) },
    ],
    revision: [
      "Revise each topic 24 hours after first study, then again after 7 days and 30 days.",
      "Keep a single running list of weak topics; every Sunday, pick the three that recur most.",
      "Reserve the final 15% of your timeline entirely for revision — do not schedule new topics there.",
    ],
    mocks: [
      "Sectional tests from the first month, once you have one subject partly covered.",
      "One full-length mock a week from the halfway point.",
      "Two full-length mocks a week in the last month, at the real exam's time of day.",
      "Analyse every mock for longer than you took to write it — the analysis is where the marks come from.",
    ],
    totalTopics: input.topics.length,
    totalHours,
  };

  return {
    plan,
    feasibility: { verdict, impliedHoursPerWeek, availableHoursPerWeek, note },
  };
}
