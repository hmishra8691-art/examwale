import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  careerProfiles,
  occupations,
  savedItems,
  userDocuments,
} from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getFullProfile, profileCompleteness } from "@/modules/users/service";
import { activeRoadmap } from "@/modules/roadmaps/service";
import { recommendedJobs, listApplications } from "@/modules/jobs/service";
import { upcomingDeadlines } from "@/modules/exams/service";
import { countListableMentors } from "@/modules/mentors/service";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  EmptyState,
  ProgressBar,
  SectionHeading,
  Stat,
} from "@/components/ui";
import { formatDate, formatMoneyRange, relativeDays } from "@/modules/shared/format";
import type { AssessmentResult } from "@/db/schema";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requirePage("/dashboard");

  const [profile, roadmap, latestAssessment, saved, documents, applications, deadlines, mentorsAvailable] =
    await Promise.all([
      getFullProfile(session.sub),
      activeRoadmap(session.sub),
      db
        .select()
        .from(assessments)
        .where(eq(assessments.userId, session.sub))
        .orderBy(desc(assessments.createdAt))
        .limit(1),
      db.select().from(savedItems).where(eq(savedItems.userId, session.sub)).limit(50),
      db.select().from(userDocuments).where(eq(userDocuments.userId, session.sub)).limit(10),
      listApplications(session.sub),
      upcomingDeadlines(4),
      countListableMentors(),
    ]);

  const completeness = profileCompleteness(profile);
  const skills = profile.skills.map((skill) => skill.name);
  const jobs = skills.length
    ? await recommendedJobs({ skills, regionName: profile.regionName, limit: 4 })
    : [];

  const recommendations = (latestAssessment[0]?.results ?? []) as AssessmentResult[];

  // Resolve saved career slugs so the saved list can show names, not ids.
  const savedCareerIds = saved.filter((item) => item.itemType === "career").map((item) => item.itemId);
  const savedCareers = savedCareerIds.length
    ? await db
        .select({ id: careerProfiles.id, slug: careerProfiles.slug, name: occupations.name })
        .from(careerProfiles)
        .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
    : [];
  const savedCareerRows = savedCareers.filter((career) => savedCareerIds.includes(career.id));

  const firstName = profile.user.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Hello, {firstName}
        </h1>
        <p className="mt-1 text-muted">
          {profile.goals.length
            ? `You're working towards: ${profile.goals[0].note ?? profile.goals[0].goalType.replace(/_/g, " ")}`
            : "Set a goal and everything below starts pointing at it."}
        </p>
      </header>

      {completeness.percent < 100 ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[220px] flex-1">
              <ProgressBar percent={completeness.percent} label="Profile completeness" />
            </div>
            <ButtonLink href="/dashboard/profile" size="sm">
              Finish your profile
            </ButtonLink>
          </div>
          {completeness.missing.length ? (
            <p className="mt-3 text-sm text-muted">
              Still missing:{" "}
              {completeness.missing
                .slice(0, 3)
                .map((item) => item.label.toLowerCase())
                .join(", ")}
              . These are the fields that change recommendations most.
            </p>
          ) : null}
        </Card>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Saved items" value={saved.length} />
        <Stat label="Applications" value={applications.length} />
        <Stat label="Documents" value={documents.length} />
        <Stat
          label="Mentors available"
          value={mentorsAvailable}
          hint={mentorsAvailable === 0 ? "none taking requests" : "taking requests"}
          tone={mentorsAvailable === 0 ? "warn" : undefined}
        />
      </div>

      {/* Roadmap */}
      <section aria-labelledby="roadmap-heading">
        <SectionHeading
          title="Your roadmap"
          id="roadmap-heading"
          action={
            roadmap ? (
              <ButtonLink href={`/dashboard/roadmaps/${roadmap.roadmap.id}`} variant="secondary" size="sm">
                Open
              </ButtonLink>
            ) : null
          }
        />
        {roadmap ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{roadmap.roadmap.title}</h3>
                <p className="mt-0.5 text-sm text-muted">{roadmap.roadmap.goalDescription}</p>
              </div>
              {roadmap.roadmap.realityCheck ? (
                <Badge
                  tone={
                    roadmap.roadmap.realityCheck.verdict === "ACHIEVABLE"
                      ? "good"
                      : roadmap.roadmap.realityCheck.verdict === "HIGHLY_UNLIKELY"
                        ? "bad"
                        : "warn"
                  }
                >
                  {roadmap.roadmap.realityCheck.verdict.replace(/_/g, " ").toLowerCase()}
                </Badge>
              ) : null}
            </div>

            <div className="mt-4">
              <ProgressBar
                percent={roadmap.progress}
                label={`${roadmap.steps.filter((step) => step.status === "DONE").length} of ${roadmap.steps.length} steps done`}
              />
            </div>

            {roadmap.nextStep ? (
              <div className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Next step</p>
                <p className="mt-0.5 font-medium">{roadmap.nextStep.title}</p>
                {roadmap.nextStep.targetDate ? (
                  <p className="text-sm text-muted">Target: {formatDate(roadmap.nextStep.targetDate)}</p>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : (
          <EmptyState
            title="No roadmap yet"
            description="Pick a career you're interested in and we'll turn it into a dated, step-by-step plan — with an honest check on whether your timeline works."
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
        )}
      </section>

      {/* Recommendations */}
      <section aria-labelledby="recs-heading">
        <SectionHeading
          title="Recommended careers"
          id="recs-heading"
          description={
            recommendations.length
              ? "From your most recent assessment. The reasons are shown so you can judge the ranking yourself."
              : undefined
          }
          action={
            <ButtonLink href="/assessment" variant="ghost" size="sm">
              {recommendations.length ? "Retake" : "Take assessment"} →
            </ButtonLink>
          }
        />
        {recommendations.length ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.slice(0, 6).map((rec) => (
              <Card as="li" key={rec.careerSlug} className="relative p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">
                    <Link href={`/careers/${rec.careerSlug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {rec.name}
                    </Link>
                  </h3>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{rec.score}%</span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-muted">{rec.reasons[0]}</p>
                <p className="mt-2 text-xs tabular-nums text-faint">
                  {formatMoneyRange(rec.salaryEntryMin, rec.salaryEntryMax, rec.currencyCode)}
                </p>
              </Card>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No recommendations yet"
            description="The assessment takes about three minutes and scores every career against what you tell it."
            action={
              <ButtonLink href="/assessment" size="sm">
                Start
              </ButtonLink>
            }
          />
        )}
      </section>

      {/* Jobs */}
      {jobs.length ? (
        <section aria-labelledby="jobs-heading">
          <SectionHeading
            title="Jobs matched to your skills"
            id="jobs-heading"
            action={
              <ButtonLink href="/jobs" variant="ghost" size="sm">
                All jobs →
              </ButtonLink>
            }
          />
          <ul className="space-y-2">
            {jobs.map((job) => (
              <Card as="li" key={job.slug} className="relative p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">
                      <Link href={`/jobs/${job.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {job.title}
                      </Link>
                    </h3>
                    <p className="text-xs text-muted">
                      {job.companyName} · {job.city ?? job.regionName ?? "India"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">{job.match.score}% match</p>
                    <p className="text-xs tabular-nums text-faint">
                      {job.isSalaryDisclosed
                        ? formatMoneyRange(job.salaryMin, job.salaryMax, job.currencyCode)
                        : "Not disclosed"}
                    </p>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      ) : (
        <Callout tone="info" title="Add your skills for job matches">
          <p>
            <Link href="/dashboard/profile" className="font-medium underline">
              List your skills
            </Link>{" "}
            or{" "}
            <Link href="/dashboard/documents" className="font-medium underline">
              upload a résumé
            </Link>{" "}
            and we&rsquo;ll extract them. Job matching needs something to match against.
          </p>
        </Callout>
      )}

      {/* Deadlines */}
      {deadlines.length ? (
        <section aria-labelledby="deadlines-heading">
          <SectionHeading title="Application deadlines" id="deadlines-heading" />
          <ul className="space-y-2">
            {deadlines.map((deadline) => (
              <Card as="li" key={`${deadline.examSlug}-${deadline.year}`} className="relative p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">
                      <Link href={`/exams/${deadline.examSlug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {deadline.shortName} {deadline.year}
                      </Link>
                    </h3>
                    <p className="text-xs text-muted">{deadline.examName}</p>
                  </div>
                  <Badge tone="warn">Closes {formatDate(deadline.applicationEnd)}</Badge>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Saved + applications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="saved-heading">
          <SectionHeading
            title="Saved"
            id="saved-heading"
            action={
              <ButtonLink href="/dashboard/saved" variant="ghost" size="sm">
                All →
              </ButtonLink>
            }
          />
          {savedCareerRows.length || saved.length ? (
            <Card className="p-4">
              <ul className="space-y-2 text-sm">
                {savedCareerRows.slice(0, 5).map((career) => (
                  <li key={career.id}>
                    <Link href={`/careers/${career.slug}`} className="hover:text-brand-600">
                      {career.name}
                    </Link>
                  </li>
                ))}
                {saved.filter((item) => item.itemType !== "career").slice(0, 3).map((item) => (
                  <li key={item.id} className="text-muted">
                    {item.label ?? item.itemType}
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-muted">
                Nothing saved yet. The bookmark button on any career, exam or job puts it here.
              </p>
            </Card>
          )}
        </section>

        <section aria-labelledby="apps-heading">
          <SectionHeading
            title="Recent applications"
            id="apps-heading"
            action={
              <ButtonLink href="/dashboard/applications" variant="ghost" size="sm">
                All →
              </ButtonLink>
            }
          />
          {applications.length ? (
            <Card className="p-4">
              <ul className="space-y-2 text-sm">
                {applications.slice(0, 5).map((application) => (
                  <li key={application.id} className="flex items-center justify-between gap-3">
                    <Link href={`/jobs/${application.jobSlug}`} className="truncate hover:text-brand-600">
                      {application.jobTitle}
                    </Link>
                    <span className="shrink-0 text-xs text-faint">
                      {relativeDays(application.appliedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <Card className="p-4">
              <p className="text-sm text-muted">
                No applications yet.{" "}
                <Link href="/jobs" className="underline">
                  Browse jobs
                </Link>
                .
              </p>
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
