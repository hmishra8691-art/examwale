import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { careerProfiles, countries, occupations } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getCountryIso } from "@/modules/geo/service";
import { countListableMentors } from "@/modules/mentors/service";
import { InterviewWorkspace } from "@/components/interview-workspace";
import { ToolShell } from "@/components/guidance-ui";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "Interview practice",
  description:
    "Mock interview questions built from the role's own guide, with your answers scored against a published rubric.",
};

export default async function InterviewPage() {
  await requirePage("/guidance/interview");
  const countryIso = await getCountryIso();

  const [targets, mentorCount] = await Promise.all([
    db
      .select({ slug: careerProfiles.slug, label: occupations.name })
      .from(careerProfiles)
      .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
      .innerJoin(countries, eq(careerProfiles.countryId, countries.id))
      .where(and(eq(careerProfiles.status, "PUBLISHED"), eq(countries.isoCode, countryIso)))
      .orderBy(asc(occupations.name)),
    countListableMentors(),
  ]);

  return (
    <ToolShell
      eyebrow="Guidance"
      title="Interview practice"
      intro="Questions drawn from what the role actually involves, and a scored read of how your answer is built — structure, specifics, and whether a panel could tell what you personally did."
      aside={
        <Callout tone="info" title="Practice against the rubric, then against a person">
          <p>
            The questions are the same every time you pick a role and a round, and your answer is
            scored against the published rubric below. That repeatability is the point: you can
            answer badly, see why, and answer again knowing the yardstick has not moved.
          </p>
          <p className="mt-2">
            What it cannot do is interrupt you, push on a weak claim, or read the room.{" "}
            {mentorCount > 0 ? (
              <Link href="/mentors" className="font-medium underline underline-offset-2">
                Book a mock with a mentor
              </Link>
            ) : (
              <Link href="/mentors" className="font-medium underline underline-offset-2">
                The mentor directory
              </Link>
            )}{" "}
            {mentorCount > 0
              ? "when you want the version that answers back."
              : "is empty at the moment — the practice below still works."}
          </p>
        </Callout>
      }
    >
      <InterviewWorkspace targets={targets} />

      <details className="mt-8 rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">How an answer is scored</summary>
        <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
          <p>
            Five components, weighted. <strong>Specifics</strong> (2.5) counts concrete figures and
            named things. <strong>Structure</strong> (2) looks for the four beats — situation, task,
            action, result — and the one most often missing is the result.{" "}
            <strong>Answers the question</strong> (2) measures overlap with what was actually asked.{" "}
            <strong>Ownership</strong> (1.5) compares &ldquo;I&rdquo; against &ldquo;we&rdquo;:
            all-&ldquo;we&rdquo; hides your contribution, all-&ldquo;I&rdquo; on team work reads
            badly too. <strong>Length</strong> (1) bands the word count, with roughly 90 to 330
            words — about 45 seconds to two and a half minutes spoken — scoring full marks.
          </p>
          <p>
            The prompt you get back is structural: it tells you which beat is missing and where a
            number belongs. It is deliberately not a model answer, and it is not a rewrite of your
            story in someone else&rsquo;s words — a borrowed answer collapses on the first follow-up
            question, and a rewritten one stops being yours.
          </p>
        </div>
      </details>
    </ToolShell>
  );
}
