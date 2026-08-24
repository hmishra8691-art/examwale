import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { careerProfiles, countries, occupations } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getCountryIso } from "@/modules/geo/service";
import { getProvider } from "@/modules/ai/provider";
import { getUsageSnapshot } from "@/modules/ai/usage";
import { InterviewWorkspace } from "@/components/interview-workspace";
import { QuotaLine, ToolShell } from "@/components/ai-ui";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "Interview practice",
  description:
    "Mock interview questions built from the role's own guide, with scored feedback on your answers.",
};

export default async function InterviewPage() {
  const session = await requirePage("/ai/interview");
  const countryIso = await getCountryIso();

  const [targets, usage] = await Promise.all([
    db
      .select({ slug: careerProfiles.slug, label: occupations.name })
      .from(careerProfiles)
      .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
      .innerJoin(countries, eq(careerProfiles.countryId, countries.id))
      .where(and(eq(careerProfiles.status, "PUBLISHED"), eq(countries.isoCode, countryIso)))
      .orderBy(asc(occupations.name)),
    getUsageSnapshot(session.sub, session.plan),
  ]);

  const provider = getProvider();

  return (
    <ToolShell
      eyebrow="AI tools"
      title="Interview practice"
      intro="Questions built from what the role actually involves, then feedback on how your answer is constructed — structure, specifics, and whether the panel can tell what you personally did."
      meta={<QuotaLine used={usage.used} limit={usage.limit} />}
      aside={
        !provider.isModelBacked ? (
          <Callout tone="warn" title="No language-model key configured">
            <p>
              Questions still come from the role&rsquo;s guide, and your answers are still scored
              against the rubric. What is missing is the rewrite in your own wording — you will get
              a structural prompt instead, clearly labelled.
            </p>
          </Callout>
        ) : undefined
      }
    >
      <InterviewWorkspace targets={targets} />

      <details className="mt-8 rounded-xl border p-4">
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
            The rewrite you get back uses your facts and your example. It is deliberately not a
            model answer: a borrowed story collapses on the first follow-up question.
          </p>
        </div>
      </details>
    </ToolShell>
  );
}
