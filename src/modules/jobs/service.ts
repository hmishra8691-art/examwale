import { and, asc, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import {
  companies,
  countries,
  jobApplications,
  jobPostings,
  occupations,
  regions,
} from "@/db/schema";
import { NotFoundError } from "@/modules/shared/errors";
import { getCountryIso } from "@/modules/geo/service";

export type JobFilters = {
  country?: string;
  search?: string;
  region?: string;
  employmentType?: string[];
  remoteType?: string[];
  minSalary?: number;
  maxExperience?: number;
  minExperience?: number;
  occupation?: string;
  page?: number;
  perPage?: number;
  sort?: "recent" | "salary";
};

export async function listJobs(filters: JobFilters = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(50, Math.max(6, filters.perPage ?? 20));
  const countryIso = filters.country ?? (await getCountryIso());

  const conditions: SQL[] = [eq(jobPostings.status, "ACTIVE"), eq(countries.isoCode, countryIso)];

  if (filters.region) conditions.push(eq(regions.name, filters.region));
  if (filters.employmentType?.length) {
    conditions.push(inArray(jobPostings.employmentType, filters.employmentType as never[]));
  }
  if (filters.remoteType?.length) {
    conditions.push(inArray(jobPostings.remoteType, filters.remoteType as never[]));
  }
  if (filters.minSalary != null) {
    conditions.push(gte(jobPostings.salaryMax, filters.minSalary));
  }
  if (filters.maxExperience != null) {
    conditions.push(lte(jobPostings.experienceMinYears, filters.maxExperience));
  }
  if (filters.minExperience != null) {
    conditions.push(
      or(
        gte(jobPostings.experienceMaxYears, filters.minExperience),
        sql`${jobPostings.experienceMaxYears} IS NULL`,
      )!,
    );
  }
  if (filters.occupation) conditions.push(eq(occupations.slug, filters.occupation));
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim().toLowerCase()}%`;
    conditions.push(
      or(
        sql`lower(${jobPostings.title}) LIKE ${term}`,
        sql`lower(${jobPostings.description}) LIKE ${term}`,
        sql`lower(${companies.name}) LIKE ${term}`,
        sql`lower(${jobPostings.skillsRequired}::text) LIKE ${term}`,
      )!,
    );
  }

  const orderBy =
    filters.sort === "salary"
      ? [desc(sql`COALESCE(${jobPostings.salaryMax}, 0)`)]
      : [desc(jobPostings.postedAt)];

  const rows = await db
    .select({
      id: jobPostings.id,
      slug: jobPostings.slug,
      title: jobPostings.title,
      companyName: companies.name,
      companySlug: companies.slug,
      companyVerification: companies.verificationStatus,
      city: jobPostings.city,
      regionName: regions.name,
      employmentType: jobPostings.employmentType,
      remoteType: jobPostings.remoteType,
      experienceMinYears: jobPostings.experienceMinYears,
      experienceMaxYears: jobPostings.experienceMaxYears,
      salaryMin: jobPostings.salaryMin,
      salaryMax: jobPostings.salaryMax,
      currencyCode: jobPostings.currencyCode,
      isSalaryDisclosed: jobPostings.isSalaryDisclosed,
      skillsRequired: jobPostings.skillsRequired,
      postedAt: jobPostings.postedAt,
      source: jobPostings.source,
    })
    .from(jobPostings)
    .innerJoin(companies, eq(jobPostings.companyId, companies.id))
    .innerJoin(countries, eq(companies.countryId, countries.id))
    .leftJoin(regions, eq(jobPostings.regionId, regions.id))
    .leftJoin(occupations, eq(jobPostings.occupationId, occupations.id))
    .where(and(...conditions))
    .orderBy(...orderBy)
    .limit(perPage)
    .offset((page - 1) * perPage);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(jobPostings)
    .innerJoin(companies, eq(jobPostings.companyId, companies.id))
    .innerJoin(countries, eq(companies.countryId, countries.id))
    .leftJoin(regions, eq(jobPostings.regionId, regions.id))
    .leftJoin(occupations, eq(jobPostings.occupationId, occupations.id))
    .where(and(...conditions));

  return { items: rows, total, page, perPage, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getJobBySlug(slug: string) {
  const [row] = await db
    .select({
      job: jobPostings,
      company: companies,
      region: regions,
      occupation: occupations,
    })
    .from(jobPostings)
    .innerJoin(companies, eq(jobPostings.companyId, companies.id))
    .leftJoin(regions, eq(jobPostings.regionId, regions.id))
    .leftJoin(occupations, eq(jobPostings.occupationId, occupations.id))
    .where(eq(jobPostings.slug, slug))
    .limit(1);

  if (!row) throw new NotFoundError("That job posting isn't available.");
  return row;
}

export async function listJobRegions(country?: string) {
  const countryIso = country ?? (await getCountryIso());
  return db
    .select({ name: regions.name, count: sql<number>`count(${jobPostings.id})::int` })
    .from(jobPostings)
    .innerJoin(regions, eq(jobPostings.regionId, regions.id))
    .innerJoin(countries, eq(regions.countryId, countries.id))
    .where(and(eq(jobPostings.status, "ACTIVE"), eq(countries.isoCode, countryIso)))
    .groupBy(regions.name)
    .orderBy(desc(sql`count(${jobPostings.id})`))
    .limit(20);
}

export type JobMatch = {
  score: number;
  matched: string[];
  missing: string[];
  experienceFit: "meets" | "under" | "over" | "unknown";
  notes: string[];
};

/**
 * Skill-overlap match with an experience adjustment.
 *
 * This is an estimate from the information on file, and the wording everywhere
 * it surfaces says so — it is not a hiring probability, and we don't dress it
 * up as one.
 */
export function matchJob(input: {
  userSkills: string[];
  yearsExperience?: number | null;
  job: {
    skillsRequired: string[];
    skillsPreferred?: string[] | null;
    experienceMinYears: number;
    experienceMaxYears?: number | null;
  };
}): JobMatch {
  const normalise = (value: string) => value.trim().toLowerCase();
  const userSet = new Set(input.userSkills.map(normalise));

  const required = input.job.skillsRequired.map(normalise);
  const preferred = (input.job.skillsPreferred ?? []).map(normalise);

  const matchedRequired = required.filter((skill) => userSet.has(skill));
  const matchedPreferred = preferred.filter((skill) => userSet.has(skill));
  const missing = required.filter((skill) => !userSet.has(skill));

  const requiredScore = required.length ? matchedRequired.length / required.length : 0.5;
  const preferredScore = preferred.length ? matchedPreferred.length / preferred.length : 0;

  let score = requiredScore * 80 + preferredScore * 10;

  const notes: string[] = [];
  let experienceFit: JobMatch["experienceFit"] = "unknown";

  if (input.yearsExperience != null) {
    const years = input.yearsExperience;
    if (years >= input.job.experienceMinYears) {
      experienceFit =
        input.job.experienceMaxYears != null && years > input.job.experienceMaxYears + 3
          ? "over"
          : "meets";
      score += experienceFit === "meets" ? 10 : 4;
      if (experienceFit === "over") {
        notes.push(
          "You have more experience than this role targets, which sometimes counts against you on level fit.",
        );
      }
    } else {
      experienceFit = "under";
      const shortfall = input.job.experienceMinYears - years;
      notes.push(
        `This role asks for ${input.job.experienceMinYears} years and your profile shows ${years}. A ${shortfall}-year gap is not always disqualifying, but expect it to come up.`,
      );
    }
  } else {
    notes.push("Add your years of experience to your profile for a more accurate estimate.");
  }

  if (missing.length) {
    notes.push(
      `Biggest gap${missing.length === 1 ? "" : "s"}: ${missing.slice(0, 3).join(", ")}.`,
    );
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    matched: [...matchedRequired, ...matchedPreferred],
    missing,
    experienceFit,
    notes,
  };
}

export async function applyToJob(input: {
  userId: string;
  jobPostingId: string;
  resumeDocumentId?: string | null;
  coverLetter?: string | null;
  match?: JobMatch;
}) {
  const [application] = await db
    .insert(jobApplications)
    .values({
      userId: input.userId,
      jobPostingId: input.jobPostingId,
      resumeDocumentId: input.resumeDocumentId ?? null,
      coverLetter: input.coverLetter ?? null,
      matchScore: input.match?.score ?? null,
      matchExplanation: (input.match ?? null) as never,
    })
    .onConflictDoUpdate({
      target: [jobApplications.userId, jobApplications.jobPostingId],
      set: { status: "APPLIED", updatedAt: new Date() },
    })
    .returning();
  return application;
}

export async function listApplications(userId: string) {
  return db
    .select({
      id: jobApplications.id,
      status: jobApplications.status,
      appliedAt: jobApplications.appliedAt,
      matchScore: jobApplications.matchScore,
      jobTitle: jobPostings.title,
      jobSlug: jobPostings.slug,
      companyName: companies.name,
    })
    .from(jobApplications)
    .innerJoin(jobPostings, eq(jobApplications.jobPostingId, jobPostings.id))
    .innerJoin(companies, eq(jobPostings.companyId, companies.id))
    .where(eq(jobApplications.userId, userId))
    .orderBy(desc(jobApplications.appliedAt));
}

export async function recommendedJobs(input: {
  skills: string[];
  regionName?: string | null;
  limit?: number;
}) {
  const limit = input.limit ?? 6;
  const rows = await db
    .select({
      slug: jobPostings.slug,
      title: jobPostings.title,
      companyName: companies.name,
      city: jobPostings.city,
      regionName: regions.name,
      salaryMin: jobPostings.salaryMin,
      salaryMax: jobPostings.salaryMax,
      currencyCode: jobPostings.currencyCode,
      isSalaryDisclosed: jobPostings.isSalaryDisclosed,
      skillsRequired: jobPostings.skillsRequired,
      experienceMinYears: jobPostings.experienceMinYears,
      experienceMaxYears: jobPostings.experienceMaxYears,
      remoteType: jobPostings.remoteType,
      postedAt: jobPostings.postedAt,
    })
    .from(jobPostings)
    .innerJoin(companies, eq(jobPostings.companyId, companies.id))
    .leftJoin(regions, eq(jobPostings.regionId, regions.id))
    .where(eq(jobPostings.status, "ACTIVE"))
    .orderBy(desc(jobPostings.postedAt))
    .limit(60);

  const scored = rows
    .map((row) => ({
      ...row,
      match: matchJob({
        userSkills: input.skills,
        job: {
          skillsRequired: (row.skillsRequired ?? []) as string[],
          experienceMinYears: row.experienceMinYears,
          experienceMaxYears: row.experienceMaxYears,
        },
      }),
    }))
    .sort((a, b) => {
      const local = (row: typeof a) =>
        input.regionName && row.regionName === input.regionName ? 5 : 0;
      return b.match.score + local(b) - (a.match.score + local(a));
    });

  return scored.slice(0, limit);
}
