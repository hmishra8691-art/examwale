import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { careerProfiles, occupations, userProfiles } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { listRoadmaps } from "@/modules/roadmaps/service";
import { ButtonLink, Card, EmptyState, ProgressBar, SectionHeading } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";
import { RoadmapBuilder } from "@/components/roadmap-builder";
import { one } from "@/modules/shared/params";

export const metadata: Metadata = { title: "Roadmaps" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function RoadmapsPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage("/dashboard/roadmaps");
  const params = await searchParams;
  const careerSlug = one(params.career);

  const [roadmaps, profile] = await Promise.all([
    listRoadmaps(session.sub),
    db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, session.sub) }),
  ]);

  const targetCareer = careerSlug
    ? (
        await db
          .select({
            slug: careerProfiles.slug,
            name: occupations.name,
            timeMin: careerProfiles.timeRequiredMonthsMin,
            timeMax: careerProfiles.timeRequiredMonthsMax,
          })
          .from(careerProfiles)
          .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
          .where(eq(careerProfiles.slug, careerSlug))
          .limit(1)
      )[0]
    : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Roadmaps
        </h1>
        <p className="mt-1 text-muted">
          A dated, step-by-step path to a career — with an honest check on whether your timeline
          holds up against the workload.
        </p>
      </header>

      {targetCareer ? (
        <section aria-labelledby="build">
          <SectionHeading title={`Build a roadmap for ${targetCareer.name}`} id="build" />
          <RoadmapBuilder
            careerSlug={targetCareer.slug}
            careerName={targetCareer.name}
            typicalMonthsMin={targetCareer.timeMin}
            typicalMonthsMax={targetCareer.timeMax}
            defaultHoursPerDay={profile?.availableHoursPerDay ?? 3}
            defaultTargetIncome={profile?.desiredIncomeMin ?? null}
          />
        </section>
      ) : null}

      <section aria-labelledby="your-roadmaps">
        <SectionHeading
          title="Your roadmaps"
          id="your-roadmaps"
          action={
            <ButtonLink href="/careers" variant="secondary" size="sm">
              Pick a career
            </ButtonLink>
          }
        />
        {roadmaps.length === 0 ? (
          <EmptyState
            title="No roadmaps yet"
            description="Open any career guide and choose 'Build my roadmap', or take the assessment first if you're not sure which career to aim at."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ButtonLink href="/assessment" size="sm">
                  Take the assessment
                </ButtonLink>
                <ButtonLink href="/careers" variant="secondary" size="sm">
                  Browse careers
                </ButtonLink>
              </div>
            }
          />
        ) : (
          <ul className="space-y-3">
            {roadmaps.map((roadmap) => (
              <Card as="li" key={roadmap.id} className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-semibold">
                      <Link href={`/dashboard/roadmaps/${roadmap.id}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {roadmap.title}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-sm text-muted">{roadmap.goalDescription}</p>
                    <p className="mt-1 text-xs text-faint">Created {formatDate(roadmap.createdAt)}</p>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums text-muted">
                    {roadmap.doneSteps}/{roadmap.totalSteps} done
                  </span>
                </div>
                <div className="mt-3">
                  <ProgressBar percent={roadmap.progress} />
                </div>
              </Card>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
