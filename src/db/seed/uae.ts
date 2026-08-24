/**
 * UAE loader.
 *
 * The Phase 3 claim was that opening a second country is a content operation.
 * This file is the receipt: it adds no table, no column, no endpoint and no
 * component. It reads a corpus, writes rows through the existing schema, and
 * declares coverage through the existing gate.
 *
 * Two things here are worth more than the rows they write.
 *
 * **Occupations are shared; profiles are not.** "Software Developer" is one
 * occupation globally, with one skills taxonomy. What differs by country is the
 * *profile* — the pay, the qualification route, the regulator, what is hard
 * about it. So this reuses an existing occupation when the name matches and
 * only ever adds a country-scoped profile. Duplicating the occupation would
 * have quietly broken every cross-country comparison the schema was designed to
 * make possible.
 *
 * **Coverage is declared honestly, including the gaps.** Careers are covered.
 * Exams are NOT_APPLICABLE, with a note, because the UAE genuinely has no
 * competitive civil-service examination and pretending otherwise — or leaving
 * an empty list to imply we simply had not got round to it — would be the exact
 * failure the coverage machinery exists to prevent. Jobs, courses and mentors
 * are PLANNED, which is the truthful answer: not built yet, not pretending
 * otherwise.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { slugify } from "@/db/id";
import {
  careerProfiles,
  countries,
  countryCoverage,
  occupationGroups,
  occupationSkills,
  occupations,
  regions,
  skills as skillsTable,
  sources,
  verificationRecords,
} from "@/db/schema";
import { UAE_CAREERS } from "@/db/seed/uae-data";

/** The seven emirates, used for location filtering and job scoping. */
const EMIRATES = [
  "Abu Dhabi",
  "Dubai",
  "Sharjah",
  "Ajman",
  "Umm Al Quwain",
  "Ras Al Khaimah",
  "Fujairah",
];

const COVERAGE: { section: string; state: "COVERED" | "PARTIAL" | "PLANNED" | "NOT_APPLICABLE"; note: string | null }[] = [
  {
    section: "careers",
    state: "COVERED",
    note: null,
  },
  {
    section: "exams",
    state: "NOT_APPLICABLE",
    note: "The UAE has no competitive national civil-service examination equivalent to India's UPSC or SSC. Entry to government and regulated work runs through professional licensing — DHA, DOH and MOHAP for healthcare, Society of Engineers registration for engineering — which is covered inside the relevant career guides rather than as a separate exams section.",
  },
  {
    section: "jobs",
    state: "PLANNED",
    note: "No UAE job listings yet. We would rather show none than fill the page with scraped adverts we cannot verify.",
  },
  {
    section: "business",
    state: "PLANNED",
    note: "Business model guides here need free-zone versus mainland licensing costs researched properly. Getting that wrong would misstate someone's startup budget by a wide margin, so it is not published until it is right.",
  },
  {
    section: "courses",
    state: "PLANNED",
    note: "No UAE training providers listed yet.",
  },
  {
    section: "mentors",
    state: "PLANNED",
    note: "No UAE-based mentors have been verified yet. Mentors are listed only after a credential check, and that has not been done for this market.",
  },
  {
    section: "scholarships",
    state: "PLANNED",
    note: "UAE scholarship coverage is not built yet.",
  },
];

export async function seedUae() {
  const [country] = await db.select().from(countries).where(eq(countries.isoCode, "AE")).limit(1);
  if (!country) throw new Error("UAE country row missing — run reference seed first.");

  // Regions.
  for (const name of EMIRATES) {
    await db
      .insert(regions)
      .values({ countryId: country.id, name, type: "emirate" })
      .onConflictDoNothing();
  }

  const [editorial] = await db
    .select({ id: sources.id })
    .from(sources)
    .where(eq(sources.name, "ExamWale editorial research"))
    .limit(1);
  if (!editorial) throw new Error("Editorial source missing — run reference seed first.");

  const groupRows = await db
    .select({ id: occupationGroups.id, slug: occupationGroups.slug })
    .from(occupationGroups);
  const groupIds = new Map(groupRows.map((row) => [row.slug, row.id]));

  const skillRows = await db.select({ id: skillsTable.id, name: skillsTable.name }).from(skillsTable);
  const skillIds = new Map(skillRows.map((row) => [row.name, row.id]));

  let created = 0;

  for (const seed of UAE_CAREERS) {
    const groupId = groupIds.get(seed.group);
    if (!groupId) throw new Error(`Unknown occupation group: ${seed.group}`);

    // Reuse the global occupation when it already exists — see the note above.
    const occupationSlug = slugify(seed.occupation);
    const existing = await db.query.occupations.findFirst({
      where: eq(occupations.slug, occupationSlug),
    });

    const occupationId =
      existing?.id ??
      (
        await db
          .insert(occupations)
          .values({
            globalCode: `OCC-${occupationSlug.toUpperCase()}`,
            name: seed.occupation,
            slug: occupationSlug,
            description: seed.description,
            groupId,
          })
          .returning()
      )[0].id;

    for (const skillName of seed.skills) {
      const skillId = skillIds.get(skillName);
      if (!skillId) continue;
      await db
        .insert(occupationSkills)
        .values({ occupationId, skillId, importance: 4 })
        .onConflictDoNothing();
    }

    const [profile] = await db
      .insert(careerProfiles)
      .values({
        occupationId,
        countryId: country.id,
        slug: seed.slug,
        summary: seed.summary,
        dayToDay: seed.dayToDay,
        workEnvironment: seed.workEnvironment,
        educationRequired: seed.education,
        eligibility: seed.eligibility,
        timeRequiredMonthsMin: seed.timeMonths[0],
        timeRequiredMonthsMax: seed.timeMonths[1],
        costMin: seed.cost[0],
        costMax: seed.cost[1],
        // The whole point of the exercise: the currency comes from the country.
        currencyCode: country.currencyCode,
        lowCostAlternatives: seed.lowCost ?? null,
        salaryEntryMin: seed.salary.entry[0],
        salaryEntryMax: seed.salary.entry[1],
        salaryMidMin: seed.salary.mid[0],
        salaryMidMax: seed.salary.mid[1],
        salarySeniorMin: seed.salary.senior[0],
        salarySeniorMax: seed.salary.senior[1],
        salaryConfidence: "ESTIMATED",
        selfEmploymentPossible: seed.selfEmployment ?? false,
        freelancingPossible: seed.freelancing ?? false,
        remotePossible: seed.remote ?? false,
        internationalNote: seed.internationalNote ?? null,
        automationRiskLevel: seed.automationRisk,
        futureDemandLevel: seed.demand,
        competitionLevel: seed.competition,
        difficultyLevel: seed.difficulty,
        advantages: seed.advantages,
        disadvantages: seed.disadvantages,
        progression: seed.progression,
        nextSteps: seed.nextSteps,
        licensingNote: seed.licensing ?? null,
        isRegulated: seed.regulated ?? false,
        status: "PUBLISHED",
        sourceId: editorial.id,
        lastVerifiedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning();

    if (!profile) continue;
    created += 1;

    // Same 180-day verification window as every other seeded record: these are
    // researched estimates with an expiry, not facts.
    await db.insert(verificationRecords).values({
      entityType: "career",
      entityId: profile.id,
      sourceId: editorial.id,
      expiresAt: new Date(Date.now() + 180 * 86_400_000),
      note: "Editorial UAE corpus. Structural facts (licensing bodies, visa dependence, Emiratisation) researched; salary and cost figures are planning estimates requiring verification against a primary source.",
    });
  }

  for (const entry of COVERAGE) {
    await db
      .insert(countryCoverage)
      .values({
        countryId: country.id,
        section: entry.section,
        state: entry.state,
        note: entry.note,
      })
      .onConflictDoUpdate({
        target: [countryCoverage.countryId, countryCoverage.section],
        set: { state: entry.state, note: entry.note, updatedAt: new Date() },
      });
  }

  // Activated here rather than left for an administrator, so a fresh install
  // demonstrates a working two-country product. The readiness gate is still
  // what decides whether that is legitimate — see scripts/smoke.sh, which
  // asserts the gate refuses an unready country.
  await db.update(countries).set({ isActive: true }).where(eq(countries.id, country.id));

  console.log(
    `✓ ${created} UAE careers, ${EMIRATES.length} emirates, coverage declared (exams marked not applicable)`,
  );
}
