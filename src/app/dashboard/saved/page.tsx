import type { Metadata } from "next";
import Link from "next/link";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  businessModelTemplates,
  careerProfiles,
  exams,
  jobPostings,
  occupations,
  savedItems,
} from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { ButtonLink, Card, EmptyState, SectionHeading } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Saved" };

export default async function SavedPage() {
  const session = await requirePage("/dashboard/saved");

  const items = await db.select().from(savedItems).where(eq(savedItems.userId, session.sub));

  const byType = (type: string) => items.filter((item) => item.itemType === type).map((item) => item.itemId);

  const [careers, examRows, jobs, businesses] = await Promise.all([
    byType("career").length
      ? db
          .select({ id: careerProfiles.id, slug: careerProfiles.slug, name: occupations.name, summary: careerProfiles.summary })
          .from(careerProfiles)
          .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
          .where(inArray(careerProfiles.id, byType("career")))
      : Promise.resolve([]),
    byType("exam").length
      ? db
          .select({ id: exams.id, slug: exams.slug, name: exams.name, shortName: exams.shortName })
          .from(exams)
          .where(inArray(exams.id, byType("exam")))
      : Promise.resolve([]),
    byType("job").length
      ? db
          .select({ id: jobPostings.id, slug: jobPostings.slug, title: jobPostings.title })
          .from(jobPostings)
          .where(inArray(jobPostings.id, byType("job")))
      : Promise.resolve([]),
    byType("business").length
      ? db
          .select({ id: businessModelTemplates.id, slug: businessModelTemplates.slug, name: businessModelTemplates.name })
          .from(businessModelTemplates)
          .where(inArray(businessModelTemplates.id, byType("business")))
      : Promise.resolve([]),
  ]);

  const savedAt = new Map(items.map((item) => [item.itemId, item.savedAt]));
  const isEmpty = !careers.length && !examRows.length && !jobs.length && !businesses.length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Saved
        </h1>
        <p className="mt-1 text-muted">Everything you&rsquo;ve bookmarked, in one place.</p>
      </header>

      {isEmpty ? (
        <EmptyState
          title="Nothing saved yet"
          description="The bookmark button on any career, exam, job or business idea puts it here."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <ButtonLink href="/careers" size="sm">
                Browse careers
              </ButtonLink>
              <ButtonLink href="/exams" variant="secondary" size="sm">
                Browse exams
              </ButtonLink>
            </div>
          }
        />
      ) : (
        <>
          {careers.length ? (
            <section aria-labelledby="saved-careers">
              <SectionHeading title="Careers" id="saved-careers" />
              <ul className="grid gap-3 sm:grid-cols-2">
                {careers.map((career) => (
                  <Card as="li" key={career.id} className="relative p-4">
                    <h3 className="text-sm font-semibold">
                      <Link href={`/careers/${career.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {career.name}
                      </Link>
                    </h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{career.summary}</p>
                    <p className="mt-2 text-xs text-faint">Saved {formatDate(savedAt.get(career.id))}</p>
                  </Card>
                ))}
              </ul>
            </section>
          ) : null}

          {examRows.length ? (
            <section aria-labelledby="saved-exams">
              <SectionHeading title="Exams" id="saved-exams" />
              <ul className="grid gap-3 sm:grid-cols-2">
                {examRows.map((exam) => (
                  <Card as="li" key={exam.id} className="relative p-4">
                    <h3 className="text-sm font-semibold">
                      <Link href={`/exams/${exam.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {exam.shortName}
                      </Link>
                    </h3>
                    <p className="mt-0.5 text-sm text-muted">{exam.name}</p>
                    <p className="mt-2 text-xs text-faint">Saved {formatDate(savedAt.get(exam.id))}</p>
                  </Card>
                ))}
              </ul>
            </section>
          ) : null}

          {jobs.length ? (
            <section aria-labelledby="saved-jobs">
              <SectionHeading title="Jobs" id="saved-jobs" />
              <ul className="grid gap-3 sm:grid-cols-2">
                {jobs.map((job) => (
                  <Card as="li" key={job.id} className="relative p-4">
                    <h3 className="text-sm font-semibold">
                      <Link href={`/jobs/${job.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {job.title}
                      </Link>
                    </h3>
                    <p className="mt-2 text-xs text-faint">Saved {formatDate(savedAt.get(job.id))}</p>
                  </Card>
                ))}
              </ul>
            </section>
          ) : null}

          {businesses.length ? (
            <section aria-labelledby="saved-business">
              <SectionHeading title="Business ideas" id="saved-business" />
              <ul className="grid gap-3 sm:grid-cols-2">
                {businesses.map((business) => (
                  <Card as="li" key={business.id} className="relative p-4">
                    <h3 className="text-sm font-semibold">
                      <Link href={`/business/${business.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {business.name}
                      </Link>
                    </h3>
                    <p className="mt-2 text-xs text-faint">Saved {formatDate(savedAt.get(business.id))}</p>
                  </Card>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
