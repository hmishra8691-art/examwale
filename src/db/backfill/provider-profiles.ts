/**
 * Backfill provider profiles from the records that predate them.
 *
 * Also gives already-live job postings their first publication period, which
 * Stage 4 introduced — see `backfillPublicationPeriods` below.
 *
 * Stage 3 moved professional identity — headline, bio, languages, city, years,
 * current role — out of `mentors` and into `provider_profiles`, where it is
 * shared with everything else a person offers. Existing mentors have that data
 * in the old columns, which are still present (marked SUPERSEDED in the schema)
 * precisely so this script has something to read.
 *
 * The order matters on a live database: add the new home, backfill, switch the
 * reads, and only then drop the old columns — a later stage, once this has been
 * correct in production for a while. Dropping in the same deploy as the code
 * change means any failure is unrecoverable.
 *
 * Idempotent, so it is safe to run repeatedly and safe to run before the code
 * that needs it. Rerunning after a partial failure finishes the job.
 *
 *   npm run db:backfill
 */
// Must precede the client import: `@/db/client` reads DATABASE_URL at module
// load, so a later dotenv call is too late. `db:push` and `db:seed` both do
// this; this script did not, and only worked because it was always run in a
// shell that already had the variable exported. Anybody following the README on
// a fresh checkout hit "DATABASE_URL is not set" at step 4.
import "dotenv/config";
import { eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  mentors,
  organisationMembers,
  providerCapabilities,
  providerProfiles,
  users,
} from "@/db/schema";

type Counts = {
  profilesCreated: number;
  profilesSkipped: number;
  mentorCapabilities: number;
  employerCapabilities: number;
  timezonesSet: number;
  publicationPeriods: number;
  incomplete: string[];
};

async function backfillMentorProfiles(counts: Counts) {
  // Reads the superseded columns directly, since the typed schema no longer
  // exposes them under their old names and this is the one place that should.
  const rows = await db.execute<{
    user_id: string;
    name: string | null;
    headline: string | null;
    bio: string | null;
    city: string | null;
    languages: unknown;
    years_experience: number | null;
    current_role: string | null;
    current_organisation: string | null;
    country_id: string;
    status: string;
  }>(sql`
    SELECT m.user_id, u.name, m.headline, m.bio, m.city, m.languages,
           m.years_experience, m.current_role, m.current_organisation,
           m.country_id, m.status
    FROM mentors m
    JOIN users u ON u.id = m.user_id
  `);

  for (const row of rows.rows) {
    const [existing] = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, row.user_id))
      .limit(1);

    let profileId = existing?.id;

    if (profileId) {
      counts.profilesSkipped += 1;
    } else {
      /*
       * A mentor row with no headline or bio cannot produce a valid profile, and
       * inventing placeholder text would put words in somebody's mouth on a page
       * seekers read to decide who to trust. Such a row is reported and left
       * alone for a human to look at.
       */
      if (!row.headline?.trim() || !row.bio?.trim()) {
        counts.incomplete.push(row.user_id);
        continue;
      }

      const languages = Array.isArray(row.languages) ? (row.languages as string[]) : [];
      const [created] = await db
        .insert(providerProfiles)
        .values({
          userId: row.user_id,
          displayName: row.name ?? row.headline.slice(0, 60),
          headline: row.headline,
          bio: row.bio,
          currentRole: row.current_role,
          currentOrganisation: row.current_organisation,
          yearsExperience: row.years_experience ?? 0,
          languages: languages.length ? languages : ["English"],
          city: row.city,
          countryId: row.country_id,
        })
        .returning({ id: providerProfiles.id });
      profileId = created.id;
      counts.profilesCreated += 1;
    }

    // The capability mirrors the mentor's existing state rather than resetting
    // everyone to PENDING, which would un-list every working mentor.
    const status =
      row.status === "ACTIVE" ? "ACTIVE" : row.status === "REJECTED" ? "REJECTED" : "PENDING";

    const inserted = await db
      .insert(providerCapabilities)
      .values({
        providerProfileId: profileId,
        kind: "MENTOR",
        status,
        approvedAt: status === "ACTIVE" ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning({ id: providerCapabilities.id });
    if (inserted.length) counts.mentorCapabilities += 1;
  }
}

/**
 * Organisation members get an EMPLOYER capability, but only if they already have
 * a profile.
 *
 * No profile is invented here: an employer has no professional bio anywhere in
 * the old data, and a profile with a generated headline would be worse than
 * none — it would appear on a public directory as though the person had written
 * it. They are prompted to fill one in on first visit to /provider instead.
 */
async function backfillEmployerCapabilities(counts: Counts) {
  const rows = await db
    .selectDistinct({ userId: organisationMembers.userId })
    .from(organisationMembers)
    .innerJoin(providerProfiles, eq(providerProfiles.userId, organisationMembers.userId));

  for (const row of rows) {
    const [profile] = await db
      .select({ id: providerProfiles.id })
      .from(providerProfiles)
      .where(eq(providerProfiles.userId, row.userId))
      .limit(1);
    if (!profile) continue;

    const inserted = await db
      .insert(providerCapabilities)
      .values({
        providerProfileId: profile.id,
        kind: "EMPLOYER",
        // Already trusted with an organisation membership, so not sent back
        // through an approval queue they have effectively already passed.
        status: "ACTIVE",
        approvedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: providerCapabilities.id });
    if (inserted.length) counts.employerCapabilities += 1;
  }
}

/**
 * Give every profile a timezone from its country.
 *
 * A guess, and a defensible one — the alternative is rendering session times
 * with no zone at all, which is what Stage 1 fixed. Providers can change it, and
 * the mentor availability editor now shows what their device reports so a wrong
 * guess is visible rather than silent.
 */
async function backfillTimezones(counts: Counts) {
  const result = await db.execute(sql`
    UPDATE provider_profiles pp
    SET timezone = CASE c.iso_code
      WHEN 'IN' THEN 'Asia/Kolkata'
      WHEN 'AE' THEN 'Asia/Dubai'
      ELSE 'UTC'
    END
    FROM countries c
    WHERE c.id = pp.country_id AND pp.timezone IS NULL
  `);
  counts.timezonesSet = result.rowCount ?? 0;
}

/**
 * Give every already-live posting its first publication period.
 *
 * Stage 4 made publication history a table. Postings published before it existed
 * have no period row, which would make their history read as "never published"
 * and would make the first revival create period 1 rather than period 2. The
 * period is dated from `posted_at`, which is the real answer.
 *
 * Only ACTIVE postings get an open period. A posting that was CLOSED or expired
 * before this table existed has no reliable end date to record, and inventing
 * one would be worse than leaving its history starting from now.
 */
async function backfillPublicationPeriods(counts: Counts) {
  const result = await db.execute(sql`
    INSERT INTO job_publication_periods (id, job_posting_id, sequence, published_at, expires_at)
    SELECT
      md5(random()::text || jp.id),
      jp.id,
      1,
      coalesce(jp.posted_at, jp.created_at),
      jp.expires_at
    FROM job_postings jp
    WHERE jp.status = 'ACTIVE'
      AND NOT EXISTS (
        SELECT 1 FROM job_publication_periods p WHERE p.job_posting_id = jp.id
      )
  `);
  counts.publicationPeriods = result.rowCount ?? 0;
}

export async function backfillProviderProfiles(): Promise<Counts> {
  const counts: Counts = {
    profilesCreated: 0,
    profilesSkipped: 0,
    mentorCapabilities: 0,
    employerCapabilities: 0,
    timezonesSet: 0,
    publicationPeriods: 0,
    incomplete: [],
  };

  await backfillMentorProfiles(counts);
  await backfillEmployerCapabilities(counts);
  await backfillTimezones(counts);
  await backfillPublicationPeriods(counts);
  return counts;
}

// Run directly: `npm run db:backfill`
if (process.argv[1]?.includes("provider-profiles")) {
  backfillProviderProfiles()
    .then((counts) => {
      console.log("provider profile backfill");
      console.log(`  profiles created      ${counts.profilesCreated}`);
      console.log(`  profiles already there ${counts.profilesSkipped}`);
      console.log(`  MENTOR capabilities   ${counts.mentorCapabilities}`);
      console.log(`  EMPLOYER capabilities ${counts.employerCapabilities}`);
      console.log(`  timezones set         ${counts.timezonesSet}`);
      console.log(`  publication periods   ${counts.publicationPeriods}`);
      if (counts.incomplete.length) {
        console.log("");
        console.log(
          `  ${counts.incomplete.length} mentor row(s) had no headline or bio and were left alone,`,
        );
        console.log("  rather than given invented text on a page seekers read to judge trust:");
        for (const id of counts.incomplete) console.log(`    ${id}`);
        console.log("  These mentors will not appear in listings until a profile exists.");
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("backfill failed:", error);
      process.exit(1);
    });
}
