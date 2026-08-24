import type { Metadata } from "next";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { careerProfiles, countries, occupations } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getCountryIso } from "@/modules/geo/service";
import { latestResume } from "@/modules/documents/service";
import { getProvider } from "@/modules/ai/provider";
import { getUsageSnapshot } from "@/modules/ai/usage";
import { ResumeReviewWorkspace } from "@/components/resume-review-workspace";
import { QuotaLine, ToolShell } from "@/components/ai-ui";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "Résumé review",
  description:
    "A scored review of your résumé against the role you want, using a stated rulebook rather than an impression.",
};

export default async function ResumeReviewPage() {
  const session = await requirePage("/ai/resume");
  const countryIso = await getCountryIso();

  const [stored, targets, usage] = await Promise.all([
    latestResume(session.sub),
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
      title="Résumé review"
      intro="Scored against a rulebook you can read below, then reviewed line by line. The number does not move because the model is in a different mood — which is what makes comparing two drafts worth doing."
      meta={<QuotaLine used={usage.used} limit={usage.limit} />}
      aside={
        !provider.isModelBacked ? (
          <Callout tone="warn" title="No language-model key configured">
            <p>
              The score, the section verdicts and the keyword comparison all still work — they are
              rule-based. What you will not get is rewrites phrased for your specific wording. The
              result will say so where it applies.
            </p>
          </Callout>
        ) : undefined
      }
    >
      <ResumeReviewWorkspace
        storedResume={
          stored
            ? {
                id: stored.document.id,
                filename: stored.document.originalName,
                uploadedAt: stored.document.uploadedAt.toISOString(),
              }
            : null
        }
        targets={targets}
      />

      <details className="mt-8 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-medium">
          How the score is calculated
        </summary>
        <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-muted">
          <p>
            Six components, weighted. <strong>Impact</strong> (weight 2.5) is the share of bullets
            carrying a number that is not a year, less six points for each &ldquo;responsible
            for&rdquo;-style opener — a penalty capped at half the earned score, so real
            achievements cannot be wiped out by phrasing.
            <strong> Relevance</strong> (2) is the share of the target role&rsquo;s listed skills
            that appear anywhere in the text. <strong>Structure</strong> (1.5) counts how many of
            the seven conventional section headings are present.{" "}
            <strong>Skills named</strong> (1.5) counts recognised skills against a curated
            vocabulary. <strong>Contact</strong> (1) checks for an email, a phone number and a link.{" "}
            <strong>Length</strong> (1) bands the word count, with 300–900 scoring full marks.
          </p>
          <p>
            If you do not pick a target role, relevance is removed from the calculation rather than
            scored as zero — otherwise the headline number would punish you for not answering an
            optional question.
          </p>
          <p>
            None of this can tell whether what you wrote is true, and none of it sees your layout.
            It is a structural review, and a strong score is not a prediction about interviews.
          </p>
        </div>
      </details>
    </ToolShell>
  );
}
