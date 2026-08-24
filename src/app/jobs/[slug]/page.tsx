import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getJobBySlug, matchJob } from "@/modules/jobs/service";
import { getSession } from "@/modules/auth/session";
import { db } from "@/db/client";
import { skills as skillsTable, userProfiles, userSkills } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, SectionHeading } from "@/components/ui";
import { formatDate, formatMoneyRange, titleCase } from "@/modules/shared/format";
import { SaveButton } from "@/components/save-button";
import { ApplyPanel } from "@/components/apply-panel";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const detail = await getJobBySlug(slug);
    return {
      title: `${detail.job.title} at ${detail.company.name}`,
      description: detail.job.description.slice(0, 155),
    };
  } catch {
    return { title: "Job not found" };
  }
}

export default async function JobDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  let detail: Awaited<ReturnType<typeof getJobBySlug>>;
  try {
    detail = await getJobBySlug(slug);
  } catch {
    notFound();
  }

  const { job, company, region, occupation } = detail;
  const session = await getSession();

  let match: ReturnType<typeof matchJob> | null = null;
  if (session) {
    const [profile, skillRows] = await Promise.all([
      db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, session.sub) }),
      db
        .select({ name: skillsTable.name })
        .from(userSkills)
        .innerJoin(skillsTable, eq(userSkills.skillId, skillsTable.id))
        .where(eq(userSkills.userId, session.sub)),
    ]);

    match = matchJob({
      userSkills: skillRows.map((row) => row.name),
      yearsExperience: profile?.yearsExperience ?? null,
      job: {
        skillsRequired: (job.skillsRequired ?? []) as string[],
        skillsPreferred: (job.skillsPreferred ?? []) as string[],
        experienceMinYears: job.experienceMinYears,
        experienceMaxYears: job.experienceMaxYears,
      },
    });
  }

  const responsibilities = (job.responsibilities ?? []) as string[];
  const required = (job.skillsRequired ?? []) as string[];
  const preferred = (job.skillsPreferred ?? []) as string[];

  return (
    <article className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/jobs" className="hover:text-[var(--text)]">
          Jobs
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
              {job.title}
            </h1>
            <p className="mt-1 text-lg text-muted">
              {company.name} · {job.city ?? region?.name ?? "India"}
            </p>
          </div>
          <SaveButton itemType="job" itemId={job.id} label={job.title} signedIn={Boolean(session)} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge tone="neutral">{titleCase(job.employmentType)}</Badge>
          <Badge tone={job.remoteType === "REMOTE" ? "good" : "neutral"}>{titleCase(job.remoteType)}</Badge>
          <Badge tone="neutral">
            {job.experienceMinYears}
            {job.experienceMaxYears ? `–${job.experienceMaxYears}` : "+"} years
          </Badge>
          {job.source === "seed" ? <Badge tone="warn">Sample listing</Badge> : null}
        </div>
      </header>

      <Card className="mb-6">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Salary</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">
              {job.isSalaryDisclosed
                ? formatMoneyRange(job.salaryMin, job.salaryMax, job.currencyCode)
                : "Not disclosed"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Education</dt>
            <dd className="mt-0.5 text-sm">{job.educationRequired ?? "Not specified"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted">Posted</dt>
            <dd className="mt-0.5 text-sm">{formatDate(job.postedAt)}</dd>
          </div>
        </dl>
      </Card>

      {match ? (
        <section className="mb-6" aria-labelledby="match">
          <SectionHeading title="How you match" id="match" />
          <Card>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{match.score}%</span>
                <span className="text-sm text-muted">estimated match</span>
              </div>
              <div className="h-2 min-w-[140px] flex-1 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${match.score}%` }}
                />
              </div>
            </div>

            <p className="mt-3 text-sm text-muted">
              This is an estimate from the skills and experience on your profile. It is not a
              probability of being hired, and no employer sees it.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {match.matched.length ? (
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold text-verified-700 dark:text-verified-100">
                    You have
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {match.matched.map((skill) => (
                      <li key={skill}>
                        <Badge tone="good">{skill}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {match.missing.length ? (
                <div>
                  <h3 className="mb-1.5 text-sm font-semibold text-estimate-700 dark:text-estimate-100">
                    Gaps
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {match.missing.map((skill) => (
                      <li key={skill}>
                        <Badge tone="warn">{skill}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {match.notes.length ? (
              <ul className="mt-4 space-y-1 border-t pt-3 text-sm text-muted">
                {match.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
          </Card>
        </section>
      ) : (
        <Callout tone="info" title="See how well you match">
          <p>
            <Link href={`/login?next=/jobs/${job.slug}`} className="font-medium underline">
              Sign in
            </Link>{" "}
            and add your skills — or upload a résumé and we&rsquo;ll extract them — to see a match
            estimate and the specific gaps for this role.
          </p>
        </Callout>
      )}

      <section className="mt-8" aria-labelledby="about-role">
        <SectionHeading title="About the role" id="about-role" />
        <Card>
          <p className="text-sm">{job.description}</p>
          {responsibilities.length ? (
            <>
              <h3 className="mb-2 mt-4 text-sm font-semibold">What you&rsquo;ll do</h3>
              <ul className="space-y-1.5 text-sm">
                {responsibilities.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Card>
      </section>

      <section className="mt-8" aria-labelledby="skills">
        <SectionHeading title="Skills" id="skills" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold">Required</h3>
            <ul className="flex flex-wrap gap-1.5">
              {required.map((skill) => (
                <li key={skill}>
                  <Badge tone="brand">{skill}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          {preferred.length ? (
            <Card>
              <h3 className="mb-2 text-sm font-semibold">Nice to have</h3>
              <ul className="flex flex-wrap gap-1.5">
                {preferred.map((skill) => (
                  <li key={skill}>
                    <Badge tone="neutral">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="apply">
        <SectionHeading title="Apply" id="apply" />
        <ApplyPanel jobId={job.id} jobSlug={job.slug} signedIn={Boolean(session)} applyUrl={job.applyUrl} />
      </section>

      <section className="mt-8" aria-labelledby="company">
        <SectionHeading title={`About ${company.name}`} id="company" />
        <Card>
          <p className="text-sm">{company.about ?? "No description provided."}</p>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {company.industry ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Industry</dt>
                <dd>{company.industry}</dd>
              </div>
            ) : null}
            {company.sizeBand ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Size</dt>
                <dd>{company.sizeBand} employees</dd>
              </div>
            ) : null}
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted">Verification</dt>
              <dd>{titleCase(company.verificationStatus)}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {occupation ? (
        <Callout tone="info" title="Thinking about this as a career, not just a job?">
          <p>
            <Link href={`/careers/${occupation.slug}-in`} className="font-medium underline">
              Read the {occupation.name} career guide
            </Link>{" "}
            for what the path looks like over ten years — qualifications, pay progression and the
            honest downsides.
          </p>
        </Callout>
      ) : null}
    </article>
  );
}
