import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/modules/auth/session";
import { getCountry } from "@/modules/geo/service";
import { getProvider } from "@/modules/ai/provider";
import { INTEREST_OPTIONS } from "@/modules/recommendations/assessment";
import { budgetBands } from "@/modules/shared/format";
import { RecommendationsWorkspace } from "@/components/recommendations-workspace";
import { ToolShell } from "@/components/ai-ui";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "What suits me",
  description:
    "A ranked career shortlist scored against real guides, with a written reason each one might not suit you.",
};

export default async function RecommendationsPage() {
  const [session, country] = await Promise.all([getSession(), getCountry()]);
  const provider = getProvider();

  return (
    <ToolShell
      eyebrow="AI tools"
      title="What suits me"
      intro="Answer as much as you like — every field is optional, and a partial answer still produces a shortlist. Each recommendation comes with the reason it might be wrong for you, because a list of things that all sound good is not a decision."
      aside={
        !provider.isModelBacked ? (
          <Callout tone="warn" title="No language-model key configured">
            <p>
              The ranking below is produced by a scorer over the career database and works exactly
              as it should. The written &ldquo;why this fits you&rdquo; needs a model, so you will
              see the scorer&rsquo;s own reasons instead — shorter, but not made up.
            </p>
          </Callout>
        ) : undefined
      }
    >
      <RecommendationsWorkspace
        interests={INTEREST_OPTIONS}
        signedIn={Boolean(session)}
        currencyCode={country.currencyCode}
        budgetBands={budgetBands(country.currencyCode)}
      />

      <details className="mt-8 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          How the shortlist is built, and what the AI is allowed to do
        </summary>
        <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
          <p>
            A deterministic scorer reads every published career guide for{" "}
            {country.name} and scores it against your answers — interest group, study time, cost
            against your budget, demand, competition, and the specific flags you ticked. That pass
            produces the shortlist and the initial order.
          </p>
          <p>
            The model then sees only that shortlist. It can reorder within it by at most three
            places, and it writes the fit, the counter-argument and the first step. It cannot add a
            career, remove one, or state a salary or cost figure beyond what it was given. Where it
            moved something, the card shows an arrow and how far.
          </p>
          <p>
            The reason for the restriction: asked openly, a model will name occupations this
            platform has no guide, no verified pay range and no eligibility route for — and you
            would hit a dead end on the recommendation it was most enthusiastic about.
          </p>
        </div>
      </details>

      <p className="mt-6 text-sm text-muted">
        Want a longer conversation about it instead?{" "}
        <Link href={session ? "/chat" : "/signup"} className="underline">
          Ask the assistant
        </Link>
        , which can follow up on your situation rather than scoring a form.
      </p>
    </ToolShell>
  );
}
