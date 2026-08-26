import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/modules/auth/session";
import { getCountry } from "@/modules/geo/service";
import { INTEREST_OPTIONS } from "@/modules/recommendations/assessment";
import { budgetBands } from "@/modules/shared/format";
import { countListableMentors } from "@/modules/mentors/service";
import { RecommendationsWorkspace } from "@/components/recommendations-workspace";
import { ToolShell } from "@/components/guidance-ui";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "What suits me",
  description:
    "A ranked career shortlist scored against published guides, with the reason each one might not suit you.",
};

export default async function MatchesPage() {
  const [session, country, mentorCount] = await Promise.all([
    getSession(),
    getCountry(),
    countListableMentors(),
  ]);

  return (
    <ToolShell
      eyebrow="Guidance"
      title="What suits me"
      intro="Answer as much as you like — every field is optional, and a partial answer still produces a shortlist. Each result carries the reasons it scored well and the gaps it scored against, because a list of things that all sound good is not a decision."
      aside={
        <Callout tone="info" title="A shortlist, not an answer">
          <p>
            The ranking is arithmetic over the published guides for {country.name}: interest group,
            study time, cost against your budget, demand, competition, and the flags you tick.
            Everything it knows about you is what this form asked. It has never met you.
          </p>
          <p className="mt-2">
            The questions it cannot touch — whether you would actually enjoy the work, what your
            family expects, whether the third choice is worth the move —{" "}
            {mentorCount > 0 ? (
              <>
                are the ones to take to{" "}
                <Link href="/mentors" className="font-medium underline underline-offset-2">
                  someone who has done the job
                </Link>
                .
              </>
            ) : (
              <>
                need a person. No mentors are taking requests right now;{" "}
                <Link href="/mentors" className="font-medium underline underline-offset-2">
                  the directory
                </Link>{" "}
                shows when that changes.
              </>
            )}
          </p>
        </Callout>
      }
    >
      <RecommendationsWorkspace
        interests={INTEREST_OPTIONS}
        signedIn={Boolean(session)}
        currencyCode={country.currencyCode}
        budgetBands={budgetBands(country.currencyCode)}
      />

      <details className="mt-8 rounded-md border p-4">
        <summary className="cursor-pointer text-sm font-medium">How the shortlist is built</summary>
        <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
          <p>
            A scorer reads every published career guide for {country.name} and scores it against
            your answers — interest group, study time, cost against your budget, demand,
            competition, and the specific flags you ticked. That pass produces both the shortlist
            and its order, and the reasons shown against each result are the ones it actually
            scored on.
          </p>
          <p>
            Nothing reorders it afterwards. There used to be a second pass here, where a model was
            allowed to move a career up to three places and write a sentence about why it fitted
            you. It was removed. The ordering you see is the one the arithmetic produced, and the
            &ldquo;why this one, for me&rdquo; question — the part a scorer genuinely cannot answer
            — goes to a person instead.
          </p>
          <p>
            A career cannot appear here without a published guide, a verified pay range and an
            eligibility route on file. That is a deliberate limit: it means the shortlist is
            shorter than the world, and every entry on it leads somewhere real.
          </p>
        </div>
      </details>
    </ToolShell>
  );
}
