/**
 * Country resolution and launch readiness.
 *
 * Two responsibilities, and they are related:
 *
 *  - **Resolution.** Which country's content is this request about? Answered
 *    once per request, from the signed-in user's profile, else a cookie, else
 *    the deployment default.
 *  - **Readiness.** May a country be offered at all? Answered by
 *    `assertLaunchable`, which is Phase 3's equivalent of the publish gate:
 *    activating a country with nothing in it is the multi-country version of
 *    publishing a career with no source.
 *
 * They belong together because resolution must never return a country that
 * readiness would refuse. `listActiveCountries` is the only source the
 * switcher reads, and it only returns activated rows.
 */
import { cache } from "react";
import { cookies } from "next/headers";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  businessModelTemplates,
  careerProfiles,
  countries,
  countryCoverage,
  courses,
  exams,
  jobPostings,
  mentors,
  providers,
  regions,
  scholarships,
  userProfiles,
} from "@/db/schema";
import { env } from "@/modules/shared/env";
import { NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { getSession } from "@/modules/auth/session";
import {
  COUNTRY_COOKIE,
  COVERAGE_SECTIONS,
  FALLBACK_COUNTRY_ISO,
  type ActiveCountry,
  type CoverageSection,
  type CoverageState,
} from "@/modules/geo/config";

const COUNTRY_FIELDS = {
  id: countries.id,
  isoCode: countries.isoCode,
  name: countries.name,
  currencyCode: countries.currencyCode,
  currencySymbol: countries.currencySymbol,
  defaultLocale: countries.defaultLocale,
};

/**
 * Every country a visitor may switch to.
 *
 * Only active ones. An inactive country is seeded infrastructure, not an
 * offer, and listing it would invite someone to switch into an empty product.
 */
export const listActiveCountries = cache(async (): Promise<ActiveCountry[]> => {
  return db
    .select(COUNTRY_FIELDS)
    .from(countries)
    .where(eq(countries.isActive, true))
    .orderBy(asc(countries.name));
});

export const getCountryByIso = cache(async (iso: string): Promise<ActiveCountry | null> => {
  const [row] = await db
    .select(COUNTRY_FIELDS)
    .from(countries)
    .where(eq(countries.isoCode, iso.toUpperCase()))
    .limit(1);
  return row ?? null;
});

/**
 * The country this request is about. Deduped per request via `cache`, so every
 * query on a page agrees — a page that mixed jurisdictions would be giving
 * eligibility answers for the wrong country.
 *
 * Precedence: the signed-in user's profile, then the cookie, then the
 * deployment default, then whatever is active. Profile beats cookie because a
 * stated home country is a considered answer, while a cookie may be a stray
 * click from a previous session.
 */
export const getCountry = cache(async (): Promise<ActiveCountry> => {
  const active = await listActiveCountries();

  // No activated country at all: fall back to the configured default even if
  // inactive, so a fresh install renders instead of erroring.
  if (!active.length) {
    const fallback =
      (await getCountryByIso(env.defaultCountry)) ?? (await getCountryByIso(FALLBACK_COUNTRY_ISO));
    if (!fallback) throw new NotFoundError("No countries are configured.");
    return fallback;
  }

  const pick = (iso: string | null | undefined) =>
    iso ? active.find((country) => country.isoCode === iso.toUpperCase()) : undefined;

  try {
    const session = await getSession();
    if (session) {
      const [profile] = await db
        .select({ countryId: userProfiles.countryId })
        .from(userProfiles)
        .where(eq(userProfiles.userId, session.sub))
        .limit(1);

      const fromProfile =
        profile?.countryId && active.find((country) => country.id === profile.countryId);
      if (fromProfile) return fromProfile;
    }

    const store = await cookies();
    const fromCookie = pick(store.get(COUNTRY_COOKIE)?.value);
    if (fromCookie) return fromCookie;
  } catch {
    // Outside a request scope (a script, a background job): fall through.
  }

  return pick(env.defaultCountry) ?? active[0];
});

/** ISO code shorthand — most service filters key off the code, not the id. */
export const getCountryIso = cache(async (): Promise<string> => {
  return (await getCountry()).isoCode;
});

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export type SectionCoverage = {
  section: CoverageSection;
  state: CoverageState;
  note: string | null;
  /** Live row count, for the admin view. Never used to derive `state`. */
  rows: number;
};

/**
 * Live row counts per section for one country.
 *
 * Used to show an administrator what is actually there, and by
 * `assertLaunchable` to refuse an empty launch. Never used to *infer* a
 * coverage state — see the note in `modules/geo/config.ts`.
 */
async function sectionRowCounts(countryId: string): Promise<Record<CoverageSection, number>> {
  const one = async (query: Promise<{ value: number }[]>) => (await query)[0]?.value ?? 0;

  const [careersN, examsN, jobsN, businessN, coursesN, mentorsN, scholarshipsN] = await Promise.all([
    one(
      db
        .select({ value: count() })
        .from(careerProfiles)
        .where(
          and(eq(careerProfiles.countryId, countryId), eq(careerProfiles.status, "PUBLISHED")),
        ),
    ),
    one(
      db
        .select({ value: count() })
        .from(exams)
        .where(and(eq(exams.countryId, countryId), eq(exams.status, "PUBLISHED"))),
    ),
    one(
      db
        .select({ value: count() })
        .from(jobPostings)
        .innerJoin(regions, eq(regions.id, jobPostings.regionId))
        .where(and(eq(regions.countryId, countryId), eq(jobPostings.status, "ACTIVE"))),
    ),
    one(
      db
        .select({ value: count() })
        .from(businessModelTemplates)
        .where(
          and(
            eq(businessModelTemplates.countryId, countryId),
            eq(businessModelTemplates.status, "PUBLISHED"),
          ),
        ),
    ),
    // Courses carry no country of their own — they belong to a provider, and
    // the provider is the thing that operates in a country.
    one(
      db
        .select({ value: count() })
        .from(courses)
        .innerJoin(providers, eq(providers.id, courses.providerId))
        .where(and(eq(providers.countryId, countryId), eq(courses.status, "PUBLISHED"))),
    ),
    one(
      db
        .select({ value: count() })
        .from(mentors)
        .where(and(eq(mentors.countryId, countryId), eq(mentors.status, "ACTIVE"))),
    ),
    one(
      db
        .select({ value: count() })
        .from(scholarships)
        .where(and(eq(scholarships.countryId, countryId), eq(scholarships.status, "PUBLISHED"))),
    ),
  ]);

  return {
    careers: careersN,
    exams: examsN,
    jobs: jobsN,
    business: businessN,
    courses: coursesN,
    mentors: mentorsN,
    scholarships: scholarshipsN,
  };
}

export async function getCoverage(countryId: string): Promise<SectionCoverage[]> {
  const [declared, rows] = await Promise.all([
    db.select().from(countryCoverage).where(eq(countryCoverage.countryId, countryId)),
    sectionRowCounts(countryId),
  ]);

  const bySection = new Map(declared.map((row) => [row.section, row]));

  return COVERAGE_SECTIONS.map((section) => {
    const row = bySection.get(section);
    return {
      section,
      // Undeclared means nobody has said anything about it yet, which is
      // PLANNED — not "covered because rows happen to exist".
      state: (row?.state as CoverageState) ?? "PLANNED",
      note: row?.note ?? null,
      rows: rows[section],
    };
  });
}

/** Coverage for the country this request resolved to, keyed for quick lookup. */
export const getCurrentCoverage = cache(
  async (): Promise<Record<CoverageSection, SectionCoverage>> => {
    const country = await getCountry();
    const coverage = await getCoverage(country.id);
    return Object.fromEntries(coverage.map((entry) => [entry.section, entry])) as Record<
      CoverageSection,
      SectionCoverage
    >;
  },
);

export async function setCoverage(input: {
  countryId: string;
  section: CoverageSection;
  state: CoverageState;
  note?: string | null;
  adminId: string;
}) {
  const [row] = await db
    .insert(countryCoverage)
    .values({
      countryId: input.countryId,
      section: input.section,
      state: input.state,
      note: input.note ?? null,
    })
    .onConflictDoUpdate({
      target: [countryCoverage.countryId, countryCoverage.section],
      set: { state: input.state, note: input.note ?? null, updatedAt: new Date() },
    })
    .returning();

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: "country.coverage_set",
    entityType: "country",
    entityId: input.countryId,
    after: { section: input.section, state: input.state },
  });

  return row;
}

// ---------------------------------------------------------------------------
// The launch gate
// ---------------------------------------------------------------------------

/**
 * Minimum content before a country may be switched on.
 *
 * Careers is the only hard requirement, because it is the one section every
 * country genuinely has and the one the rest of the product hangs off. The
 * others are checked as *declarations*: a country may launch with no exams,
 * but somebody has to have said in the coverage table whether that is because
 * the concept does not apply or because the work is not done — an
 * undeclared section is an unanswered question, not a pass.
 */
export const MIN_CAREERS_TO_LAUNCH = 10;

export type LaunchReadiness = {
  ready: boolean;
  blockers: string[];
  warnings: string[];
  coverage: SectionCoverage[];
};

export async function launchReadiness(countryId: string): Promise<LaunchReadiness> {
  const [country] = await db.select().from(countries).where(eq(countries.id, countryId)).limit(1);
  if (!country) throw new NotFoundError("That country doesn't exist.");

  const coverage = await getCoverage(countryId);
  const blockers: string[] = [];
  const warnings: string[] = [];

  const careers = coverage.find((entry) => entry.section === "careers");
  if ((careers?.rows ?? 0) < MIN_CAREERS_TO_LAUNCH) {
    blockers.push(
      `Only ${careers?.rows ?? 0} published careers. A country needs at least ${MIN_CAREERS_TO_LAUNCH} before it is worth switching on.`,
    );
  }

  const undeclared = coverage.filter((entry) => entry.state === "PLANNED");
  if (undeclared.length) {
    blockers.push(
      `Coverage is undeclared for: ${undeclared.map((entry) => entry.section).join(", ")}. Say whether each is covered, partial, or not applicable here — an empty section with no explanation reads as a broken page.`,
    );
  }

  // A section claiming to be covered while empty is the specific dishonesty
  // this gate exists to catch.
  for (const entry of coverage) {
    if (entry.state === "COVERED" && entry.rows === 0) {
      blockers.push(`"${entry.section}" is marked covered but has no published rows.`);
    }
    if (entry.state === "NOT_APPLICABLE" && entry.rows > 0) {
      warnings.push(
        `"${entry.section}" is marked not applicable but has ${entry.rows} rows. One of the two is wrong.`,
      );
    }
  }

  const [{ regionCount }] = await db
    .select({ regionCount: count() })
    .from(regions)
    .where(eq(regions.countryId, countryId));
  if (regionCount === 0) {
    warnings.push("No regions defined, so location filtering will be unavailable.");
  }

  if (!country.currencyCode) blockers.push("No currency set.");

  return { ready: blockers.length === 0, blockers, warnings, coverage };
}

/**
 * The gate itself, checked at activation time rather than trusted from an
 * earlier review — the same reason `assertPublishable` re-checks organisation
 * verification instead of trusting the approval record.
 */
export async function assertLaunchable(countryId: string): Promise<void> {
  const readiness = await launchReadiness(countryId);
  if (!readiness.ready) {
    throw new ValidationError(
      `This country isn't ready to launch. ${readiness.blockers.join(" ")}`,
    );
  }
}

export async function setCountryActive(input: {
  countryId: string;
  isActive: boolean;
  adminId: string;
}) {
  if (input.isActive) await assertLaunchable(input.countryId);

  if (!input.isActive) {
    // Never leave the product with nothing to show.
    const active = await listActiveCountries();
    if (active.length <= 1 && active.some((country) => country.id === input.countryId)) {
      throw new ValidationError(
        "That's the only active country. Activate another before switching this one off.",
      );
    }
  }

  const [row] = await db
    .update(countries)
    .set({ isActive: input.isActive })
    .where(eq(countries.id, input.countryId))
    .returning();

  await recordAudit({
    actorType: "admin",
    actorId: input.adminId,
    action: input.isActive ? "country.activated" : "country.deactivated",
    entityType: "country",
    entityId: input.countryId,
    after: { isActive: input.isActive },
  });

  return row;
}

/** Admin console listing: every country, active or not, with its readiness. */
export async function listCountriesForAdmin() {
  const all = await db.select().from(countries).orderBy(asc(countries.name));

  return Promise.all(
    all.map(async (country) => ({
      country,
      readiness: await launchReadiness(country.id),
    })),
  );
}
