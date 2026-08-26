import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { careerProfiles, countries, occupations } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getCountryIso } from "@/modules/geo/service";
import { latestResume } from "@/modules/documents/service";
import { countListableMentors } from "@/modules/mentors/service";
import { ResumeReviewWorkspace } from "@/components/resume-review-workspace";
import { ToolShell } from "@/components/guidance-ui";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "Résumé report",
  description:
    "A scored structural report on your résumé against the role you want, computed from a stated rulebook.",
};

export default async function ResumeReportPage() {
  const session = await requirePage("/guidance/resume");
  const countryIso = await getCountryIso();

  const [stored, targets, mentorCount] = await Promise.all([
    latestResume(session.sub),
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
      title="Résumé report"
      intro="A structural report, computed from your text against the role you want. It counts what the document does and does not do, and the number does not drift between drafts — which is the only thing that makes comparing two of them worthwhile."
      aside={
        <Callout tone="info" title="What this can and cannot tell you">
          <p>
            The report reads structure: quantified bullets, ownership language, sections a reader
            expects to find, and overlap with the skills this role calls for. It cannot tell whether
            what you have written is true, whether it is the right story for the job, or how it
            reads to somebody who hires for it.
          </p>
          <p className="mt-2">
            {mentorCount > 0 ? (
              <>
                For that,{" "}
                <Link href="/mentors" className="font-medium underline underline-offset-2">
                  {mentorCount === 1 ? "a mentor" : `one of ${mentorCount} mentors`}
                </Link>{" "}
                reads it and writes back.
              </>
            ) : (
              <>
                For that you want a person. No mentors are taking requests at the moment — the
                report below still works, and{" "}
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
    </ToolShell>
  );
}
