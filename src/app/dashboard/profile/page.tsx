import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { countries, educationStages, regions, skills as skillsTable } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getFullProfile } from "@/modules/users/service";
import { INTEREST_OPTIONS } from "@/modules/recommendations/assessment";
import { ProfileForm } from "@/components/profile-form";
import { Callout } from "@/components/ui";
import { getCountryIso } from "@/modules/geo/service";

export const metadata: Metadata = { title: "Your profile" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProfilePage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage("/dashboard/profile");
  const params = await searchParams;
  const welcome = params.welcome === "1";

  const profile = await getFullProfile(session.sub);

  // Regions offered must belong to the country this request resolved to —
  // otherwise a UAE user is asked to pick an Indian state.
  const countryIso = await getCountryIso();

  const [regionRows, stageRows, skillRows] = await Promise.all([
    db
      .select({ name: regions.name })
      .from(regions)
      .innerJoin(countries, eq(regions.countryId, countries.id))
      .where(eq(countries.isoCode, countryIso))
      .orderBy(asc(regions.name)),
    db
      .select({ slug: educationStages.slug, name: educationStages.name })
      .from(educationStages)
      .orderBy(asc(educationStages.sequence)),
    db.select({ name: skillsTable.name }).from(skillsTable).orderBy(asc(skillsTable.name)).limit(400),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Your profile
        </h1>
        <p className="mt-1 text-muted">
          This is what every recommendation, roadmap and job match is scored against. Honest answers
          get better advice than aspirational ones.
        </p>
      </header>

      {welcome ? (
        <Callout tone="good" title="Account created">
          <p>
            Ten minutes here is the highest-value thing you can do on this platform. The three
            fields that matter most are your budget, the hours you have, and what actually interests
            you — everything else is refinement.
          </p>
        </Callout>
      ) : null}

      <ProfileForm
        countryIso={countryIso}
        profile={profile}
        regions={regionRows.map((row) => row.name)}
        stages={stageRows}
        skillSuggestions={skillRows.map((row) => row.name)}
        interestOptions={INTEREST_OPTIONS}
      />
    </div>
  );
}
