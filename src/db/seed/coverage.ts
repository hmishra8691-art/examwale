/**
 * India's declared coverage.
 *
 * The UAE loader declares its own coverage; this does the same for India, which
 * was previously implicit. "Implicit" meant a live country with nothing said
 * about what it covers, and the launch gate exists precisely to refuse that —
 * so India was being held to a lower standard than the country launched after
 * it. It is stated here instead.
 *
 * Every section is COVERED because India genuinely has content in all seven.
 * The notes are omitted where the state speaks for itself: a note that repeats
 * "this is covered" is noise, and the notes are shown to readers.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { countries, countryCoverage } from "@/db/schema";
import { COVERAGE_SECTIONS } from "@/modules/geo/config";

const INDIA: Partial<Record<(typeof COVERAGE_SECTIONS)[number], { state: "COVERED" | "PARTIAL"; note?: string }>> = {
  careers: { state: "COVERED" },
  exams: { state: "COVERED" },
  jobs: {
    state: "PARTIAL",
    note: "The listings here are a demonstration corpus, not a live feed from employers. Employer-posted vacancies go through verification and moderation before they appear.",
  },
  business: { state: "COVERED" },
  courses: {
    state: "PARTIAL",
    note: "Provider listings are growing. Fees shown are per batch and are what the provider stated — always confirm directly before paying anything.",
  },
  mentors: { state: "COVERED" },
  scholarships: {
    state: "PARTIAL",
    note: "A starting set of national programmes. State-level schemes are not covered yet, and there are many.",
  },
};

export async function seedCoverage() {
  const [india] = await db.select().from(countries).where(eq(countries.isoCode, "IN")).limit(1);
  if (!india) throw new Error("India country row missing — run reference seed first.");

  let declared = 0;
  for (const section of COVERAGE_SECTIONS) {
    const entry = INDIA[section];
    if (!entry) continue;

    await db
      .insert(countryCoverage)
      .values({
        countryId: india.id,
        section,
        state: entry.state,
        note: entry.note ?? null,
      })
      .onConflictDoUpdate({
        target: [countryCoverage.countryId, countryCoverage.section],
        set: { state: entry.state, note: entry.note ?? null, updatedAt: new Date() },
      });
    declared += 1;
  }

  return declared;
}
