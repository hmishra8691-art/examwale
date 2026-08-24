import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerCertifications,
  careerEntranceExams,
  careerProfiles,
  careerRelations,
  careerScholarships,
  countries,
  exams,
  learningResources,
  occupationGroups,
  occupationSkills,
  occupations,
  roadmapTemplates,
  scholarships,
  skills,
  sources,
} from "@/db/schema";
import { NotFoundError } from "@/modules/shared/errors";
import { getCountryIso } from "@/modules/geo/service";

export type CareerFilters = {
  country?: string;
  group?: string;
  search?: string;
  maxCost?: number;
  minSalary?: number;
  remoteOnly?: boolean;
  selfEmploymentOnly?: boolean;
  demand?: string[];
  difficulty?: string[];
  page?: number;
  perPage?: number;
  sort?: "relevance" | "salary" | "cost" | "demand" | "name";
};

export type CareerListItem = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  groupName: string;
  groupSlug: string;
  salaryEntryMin: number | null;
  salaryEntryMax: number | null;
  salarySeniorMax: number | null;
  currencyCode: string;
  costMin: number | null;
  costMax: number | null;
  timeRequiredMonthsMin: number | null;
  timeRequiredMonthsMax: number | null;
  futureDemandLevel: string;
  competitionLevel: string;
  difficultyLevel: string;
  remotePossible: boolean;
  selfEmploymentPossible: boolean;
  isRegulated: boolean;
};

const DEMAND_ORDER = sql`CASE ${careerProfiles.futureDemandLevel}
  WHEN 'VERY_HIGH' THEN 5 WHEN 'HIGH' THEN 4 WHEN 'MEDIUM' THEN 3
  WHEN 'LOW' THEN 2 ELSE 1 END`;

export async function listCareers(filters: CareerFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(60, Math.max(6, filters.perPage ?? 24));
  const countryIso = filters.country ?? (await getCountryIso());

  const conditions: SQL[] = [eq(careerProfiles.status, "PUBLISHED"), eq(countries.isoCode, countryIso)];

  if (filters.group) conditions.push(eq(occupationGroups.slug, filters.group));
  if (filters.maxCost != null) {
    // A career qualifies if its *lowest* pathway fits the budget.
    conditions.push(or(lte(careerProfiles.costMin, filters.maxCost), sql`${careerProfiles.costMin} IS NULL`)!);
  }
  if (filters.minSalary != null) {
    conditions.push(gte(careerProfiles.salaryEntryMax, filters.minSalary));
  }
  if (filters.remoteOnly) conditions.push(eq(careerProfiles.remotePossible, true));
  if (filters.selfEmploymentOnly) conditions.push(eq(careerProfiles.selfEmploymentPossible, true));
  if (filters.demand?.length) {
    conditions.push(inArray(careerProfiles.futureDemandLevel, filters.demand as never[]));
  }
  if (filters.difficulty?.length) {
    conditions.push(inArray(careerProfiles.difficultyLevel, filters.difficulty as never[]));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${occupations.name}) LIKE ${term}`,
        sql`lower(${careerProfiles.summary}) LIKE ${term}`,
        sql`lower(${occupationGroups.name}) LIKE ${term}`,
      )!,
    );
  }

  const orderBy = (() => {
    switch (filters.sort) {
      case "salary":
        return [desc(sql`COALESCE(${careerProfiles.salaryEntryMax}, 0)`)];
      case "cost":
        return [asc(sql`COALESCE(${careerProfiles.costMin}, 0)`)];
      case "name":
        return [asc(occupations.name)];
      case "demand":
      default:
        return [desc(DEMAND_ORDER), asc(occupations.name)];
    }
  })();

  const rows = await db
    .select({
      id: careerProfiles.id,
      slug: careerProfiles.slug,
      name: occupations.name,
      summary: careerProfiles.summary,
      groupName: occupationGroups.name,
      groupSlug: occupationGroups.slug,
      salaryEntryMin: careerProfiles.salaryEntryMin,
      salaryEntryMax: careerProfiles.salaryEntryMax,
      salarySeniorMax: careerProfiles.salarySeniorMax,
      currencyCode: careerProfiles.currencyCode,
      costMin: careerProfiles.costMin,
      costMax: careerProfiles.costMax,
      timeRequiredMonthsMin: careerProfiles.timeRequiredMonthsMin,
      timeRequiredMonthsMax: careerProfiles.timeRequiredMonthsMax,
      futureDemandLevel: careerProfiles.futureDemandLevel,
      competitionLevel: careerProfiles.competitionLevel,
      difficultyLevel: careerProfiles.difficultyLevel,
      remotePossible: careerProfiles.remotePossible,
      selfEmploymentPossible: careerProfiles.selfEmploymentPossible,
      isRegulated: careerProfiles.isRegulated,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .innerJoin(occupationGroups, eq(occupations.groupId, occupationGroups.id))
    .innerJoin(countries, eq(careerProfiles.countryId, countries.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .innerJoin(occupationGroups, eq(occupations.groupId, occupationGroups.id))
    .innerJoin(countries, eq(careerProfiles.countryId, countries.id))
    .where(and(...conditions));

  return {
    items: rows as CareerListItem[],
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function listCareerGroups(country?: string) {
  const countryIso = country ?? (await getCountryIso());
  return db
    .select({
      slug: occupationGroups.slug,
      name: occupationGroups.name,
      icon: occupationGroups.icon,
      count: sql<number>`count(${careerProfiles.id})::int`,
    })
    .from(occupationGroups)
    .leftJoin(occupations, eq(occupations.groupId, occupationGroups.id))
    .leftJoin(
      careerProfiles,
      and(eq(careerProfiles.occupationId, occupations.id), eq(careerProfiles.status, "PUBLISHED")),
    )
    .leftJoin(countries, eq(careerProfiles.countryId, countries.id))
    .where(or(eq(countries.isoCode, countryIso), sql`${countries.isoCode} IS NULL`))
    .groupBy(occupationGroups.slug, occupationGroups.name, occupationGroups.icon, occupationGroups.sequence)
    .orderBy(asc(occupationGroups.sequence), asc(occupationGroups.name));
}

export async function getCareerBySlug(slug: string) {
  const [row] = await db
    .select({
      career: careerProfiles,
      occupation: occupations,
      group: occupationGroups,
      country: countries,
      source: sources,
    })
    .from(careerProfiles)
    .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    .innerJoin(occupationGroups, eq(occupations.groupId, occupationGroups.id))
    .innerJoin(countries, eq(careerProfiles.countryId, countries.id))
    .leftJoin(sources, eq(careerProfiles.sourceId, sources.id))
    .where(eq(careerProfiles.slug, slug))
    .limit(1);

  if (!row) throw new NotFoundError("We don't have a guide for that career yet.");

  const [
    requiredSkills,
    certifications,
    entranceExams,
    relatedCareers,
    financialAid,
    resources,
    template,
  ] = await Promise.all([
    db
      .select({ name: skills.name, slug: skills.slug, importance: occupationSkills.importance })
      .from(occupationSkills)
      .innerJoin(skills, eq(occupationSkills.skillId, skills.id))
      .where(eq(occupationSkills.occupationId, row.occupation.id))
      .orderBy(desc(occupationSkills.importance)),

    db
      .select()
      .from(careerCertifications)
      .where(eq(careerCertifications.careerProfileId, row.career.id)),

    db
      .select({
        slug: exams.slug,
        name: exams.name,
        shortName: exams.shortName,
        category: exams.category,
        note: careerEntranceExams.note,
      })
      .from(careerEntranceExams)
      .innerJoin(exams, eq(careerEntranceExams.examId, exams.id))
      .where(eq(careerEntranceExams.careerProfileId, row.career.id)),

    db
      .select({
        slug: careerProfiles.slug,
        name: occupations.name,
        summary: careerProfiles.summary,
        relationType: careerRelations.relationType,
        salaryEntryMin: careerProfiles.salaryEntryMin,
        salaryEntryMax: careerProfiles.salaryEntryMax,
        currencyCode: careerProfiles.currencyCode,
      })
      .from(careerRelations)
      .innerJoin(careerProfiles, eq(careerRelations.toId, careerProfiles.id))
      .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
      .where(and(eq(careerRelations.fromId, row.career.id), eq(careerProfiles.status, "PUBLISHED"))),

    db
      .select({
        name: scholarships.name,
        provider: scholarships.provider,
        type: scholarships.type,
        summary: scholarships.summary,
        eligibility: scholarships.eligibility,
        approxValue: scholarships.approxValue,
        officialUrl: scholarships.officialUrl,
        lastVerifiedAt: scholarships.lastVerifiedAt,
      })
      .from(careerScholarships)
      .innerJoin(scholarships, eq(careerScholarships.scholarshipId, scholarships.id))
      .where(eq(careerScholarships.careerProfileId, row.career.id)),

    db
      .select()
      .from(learningResources)
      .where(eq(learningResources.careerSlug, slug))
      .orderBy(asc(learningResources.sequence)),

    db
      .select()
      .from(roadmapTemplates)
      .where(eq(roadmapTemplates.careerProfileId, row.career.id))
      .limit(1),
  ]);

  return {
    ...row,
    requiredSkills,
    certifications,
    entranceExams,
    relatedCareers,
    financialAid,
    resources,
    roadmapTemplate: template[0] ?? null,
  };
}

export type CareerDetail = Awaited<ReturnType<typeof getCareerBySlug>>;

/**
 * "Can I afford this?" — compares the career's own cost band against what the
 * user said they have. Returns a verdict plus the cheapest route we know of,
 * never a bare yes/no.
 */
export function affordability(
  career: { costMin: number | null; costMax: number | null; currencyCode: string },
  budget: number | null | undefined,
): {
  verdict: "within_budget" | "tight" | "over_budget" | "unknown";
  headline: string;
  detail: string;
} {
  if (budget == null) {
    return {
      verdict: "unknown",
      headline: "Add your budget to see this",
      detail:
        "Tell us what you can spend on education and training, and we'll show whether this path fits and what the cheaper routes are.",
    };
  }
  if (career.costMin == null) {
    return {
      verdict: "unknown",
      headline: "Cost varies too much to compare",
      detail:
        "Training costs for this path depend heavily on the institution. Check the pathway options below and confirm fees with the institution directly.",
    };
  }
  if (budget >= (career.costMax ?? career.costMin)) {
    return {
      verdict: "within_budget",
      headline: "This fits your stated budget",
      detail:
        "Your budget covers the typical range for this path. Costs still vary by city and institution, so treat these as planning estimates.",
    };
  }
  if (budget >= career.costMin) {
    return {
      verdict: "tight",
      headline: "The lower-cost routes fit; the premium ones don't",
      detail:
        "Your budget covers the cheaper end of this path — usually government or public institutions. The private-institution route would need more.",
    };
  }
  return {
    verdict: "over_budget",
    headline: "The standard route is above your budget",
    detail:
      "That doesn't close the door. Look at the free and low-cost alternatives and the financial assistance listed below before ruling this out.",
  };
}
