import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { affordability, getCareerBySlug } from "@/modules/careers/service";
import { getSession } from "@/modules/auth/session";
import { db } from "@/db/client";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  ConfidenceBadge,
  Meter,
  SectionHeading,
  SourceNote,
  SummaryPanel,
} from "@/components/ui";
import {
  formatMoney,
  formatMoneyRange,
  formatMonths,
  levelIndex,
  levelLabel,
} from "@/modules/shared/format";
import { SaveButton } from "@/components/save-button";
import { RoadmapVisual } from "@/components/roadmap-visual";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const detail = await getCareerBySlug(slug);
    return {
      title: `${detail.occupation.name} — career guide`,
      description: detail.career.summary.slice(0, 155),
    };
  } catch {
    return { title: "Career not found" };
  }
}

export default async function CareerDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  let detail: Awaited<ReturnType<typeof getCareerBySlug>>;
  try {
    detail = await getCareerBySlug(slug);
  } catch {
    notFound();
  }

  const { career, occupation, group, source } = detail;
  const session = await getSession();

  const profile = session
    ? await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, session.sub) })
    : null;

  const afford = affordability(career, profile?.availableBudget);
  const education = career.educationRequired as { label: string; detail: string; mandatory?: boolean }[];
  const eligibility = career.eligibility as { label: string; detail: string }[];
  const lowCost = (career.lowCostAlternatives ?? []) as { label: string; detail: string; approxCost?: number }[];
  const advantages = career.advantages as string[];
  const disadvantages = career.disadvantages as string[];
  const progression = career.progression as { stage: string; typicalYears: string; note?: string }[];
  const nextSteps = career.nextSteps as string[];

  return (
    <article className="page page-measure py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/careers" className="hover:text-[var(--text)]">
          Careers
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <Link href={`/careers?group=${group.slug}`} className="hover:text-[var(--text)]">
          {group.name}
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              {occupation.name}
            </h1>
            <p className="mt-2 max-w-3xl text-lg text-muted">{career.summary}</p>
          </div>
          <SaveButton itemType="career" itemId={career.id} label={occupation.name} signedIn={Boolean(session)} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{group.name}</Badge>
          {career.isRegulated ? <Badge tone="warn">Regulated profession</Badge> : null}
          {career.remotePossible ? <Badge tone="brand">Remote possible</Badge> : null}
          {career.selfEmploymentPossible ? <Badge tone="brand">Self-employment possible</Badge> : null}
          {career.freelancingPossible ? <Badge tone="brand">Freelance market exists</Badge> : null}
        </div>
      </header>

      {/* Summary first — the UX rule for every complex page. */}
      <SummaryPanel
        eyebrow="The short version"
        title={`What it takes to become a ${occupation.name.toLowerCase()}`}
        points={[
          { label: "Time to qualify", value: formatMonths(career.timeRequiredMonthsMin, career.timeRequiredMonthsMax) },
          {
            label: "Education cost",
            value: (
              <>
                {career.costMin === 0
                  ? `Free – ${formatMoney(career.costMax, career.currencyCode)}`
                  : formatMoneyRange(career.costMin, career.costMax, career.currencyCode)}{" "}
                <ConfidenceBadge level="ESTIMATED" size="xs" />
              </>
            ),
          },
          {
            label: "Entry salary",
            value: (
              <>
                {formatMoneyRange(career.salaryEntryMin, career.salaryEntryMax, career.currencyCode)}{" "}
                <ConfidenceBadge level={career.salaryConfidence} size="xs" />
              </>
            ),
          },
          { label: "Future demand", value: levelLabel(career.futureDemandLevel) },
          { label: "Competition", value: levelLabel(career.competitionLevel) },
          { label: "Difficulty", value: levelLabel(career.difficultyLevel) },
        ]}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href={session ? `/dashboard/roadmaps?career=${career.slug}` : "/signup"} size="sm">
              Build my roadmap for this
            </ButtonLink>
            <ButtonLink href={`/jobs?q=${encodeURIComponent(occupation.name)}`} variant="secondary" size="sm">
              See related jobs
            </ButtonLink>
          </div>
        }
      />

      {/* Can I afford this? */}
      <section className="mt-8" aria-labelledby="afford">
        <SectionHeading title="Can I afford this?" id="afford" />
        <Callout
          tone={
            afford.verdict === "within_budget" ? "good" : afford.verdict === "over_budget" ? "warn" : "info"
          }
          title={afford.headline}
        >
          <p>{afford.detail}</p>
          {!session ? (
            <p className="mt-2">
              <Link href="/signup" className="underline">
                Add your budget
              </Link>{" "}
              and we&rsquo;ll check this against your actual situation.
            </p>
          ) : null}
        </Callout>

        {lowCost.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lowCost.map((alternative) => (
              <Card key={alternative.label} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{alternative.label}</h3>
                  {alternative.approxCost !== undefined ? (
                    <span className="shrink-0 text-sm font-medium tabular-nums text-verified-700 dark:text-verified-100">
                      {alternative.approxCost === 0 ? "Free" : formatMoney(alternative.approxCost, career.currencyCode)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-muted">{alternative.detail}</p>
              </Card>
            ))}
          </div>
        ) : null}

        {detail.financialAid.length ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Financial assistance you may qualify for</h3>
            <ul className="space-y-2">
              {detail.financialAid.map((aid) => (
                <li key={aid.name} className="card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-semibold">{aid.name}</h4>
                    <Badge tone="neutral">{aid.type}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{aid.summary}</p>
                  <p className="mt-1 text-sm">
                    <span className="text-muted">Eligibility: </span>
                    {aid.eligibility}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {aid.officialUrl ? (
                      <a
                        href={aid.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-600 underline"
                      >
                        Official portal ↗
                      </a>
                    ) : null}
                    <SourceNote sourceName={aid.provider} lastVerifiedAt={aid.lastVerifiedAt} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {/* The work itself */}
      <section className="mt-10" aria-labelledby="work">
        <SectionHeading title="What the work is actually like" id="work" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Day to day</h3>
            <p className="text-sm">{career.dayToDay}</p>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Work environment</h3>
            <p className="text-sm">{career.workEnvironment}</p>
          </Card>
        </div>
      </section>

      {/* Getting in */}
      <section className="mt-10" aria-labelledby="entry">
        <SectionHeading title="How you get in" id="entry" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Education</h3>
            <ul className="space-y-3">
              {education.map((item) => (
                <li key={item.label}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.mandatory ? <Badge tone="warn">Required</Badge> : <Badge>Optional route</Badge>}
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Eligibility</h3>
            <ul className="space-y-3">
              {eligibility.map((item) => (
                <li key={item.label}>
                  <span className="text-sm font-medium">{item.label}</span>
                  <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {career.isRegulated && career.licensingNote ? (
          <Callout tone="warn" title="This is a regulated profession">
            <p>{career.licensingNote}</p>
          </Callout>
        ) : null}

        {detail.entranceExams.length ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Entrance exams on this path</h3>
            <ul className="flex flex-wrap gap-2">
              {detail.entranceExams.map((exam) => (
                <li key={exam.slug}>
                  <Link
                    href={`/exams/${exam.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:border-brand-400"
                  >
                    <span className="font-medium">{exam.shortName}</span>
                    <span className="text-muted">{exam.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {detail.requiredSkills.length ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Skills that matter</h3>
            <ul className="flex flex-wrap gap-1.5">
              {detail.requiredSkills.map((skill) => (
                <li key={skill.slug}>
                  <Badge tone="neutral">{skill.name}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {detail.certifications.length ? (
          <div className="mt-4">
            <h3 className="mb-2 text-sm font-semibold">Certifications worth having</h3>
            <ul className="grid gap-2 sm:grid-cols-2">
              {detail.certifications.map((cert) => (
                <li key={cert.id} className="card flex items-center justify-between gap-3 p-3">
                  <div>
                    <p className="text-sm font-medium">{cert.name}</p>
                    {cert.provider ? <p className="text-xs text-faint">{cert.provider}</p> : null}
                  </div>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {cert.isFree ? (
                      <span className="text-verified-700 dark:text-verified-100">Free</span>
                    ) : (
                      formatMoney(cert.approxCost, cert.currencyCode)
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-faint">
              Certification prices change. Confirm the current fee with the provider before budgeting.
            </p>
          </div>
        ) : null}
      </section>

      {/* Money */}
      <section className="mt-10" aria-labelledby="money">
        <SectionHeading
          title="What it pays"
          id="money"
          description="Ranges gathered for planning. Actual pay depends on employer, city, skills and negotiation — these are not offers."
        />
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Entry level", min: career.salaryEntryMin, max: career.salaryEntryMax, note: "0–2 years" },
            { label: "Mid career", min: career.salaryMidMin, max: career.salaryMidMax, note: "3–8 years" },
            { label: "Senior", min: career.salarySeniorMin, max: career.salarySeniorMax, note: "8+ years" },
          ].map((band) => (
            <Card key={band.label} className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted">{band.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {formatMoneyRange(band.min, band.max, career.currencyCode)}
              </p>
              <p className="text-xs text-faint">{band.note} · per year</p>
            </Card>
          ))}
        </div>
        <div className="mt-3">
          <ConfidenceBadge level={career.salaryConfidence} />
        </div>
      </section>

      {/* Outlook */}
      <section className="mt-10" aria-labelledby="outlook">
        <SectionHeading title="Outlook" id="outlook" />
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <Meter label={`Future demand — ${levelLabel(career.futureDemandLevel)}`} index={levelIndex(career.futureDemandLevel)} tone="good" />
            <Meter label={`Competition — ${levelLabel(career.competitionLevel)}`} index={levelIndex(career.competitionLevel)} tone="warn" />
            <Meter label={`Difficulty — ${levelLabel(career.difficultyLevel)}`} index={levelIndex(career.difficultyLevel)} tone="brand" />
            <Meter label={`Automation exposure — ${levelLabel(career.automationRiskLevel)}`} index={levelIndex(career.automationRiskLevel)} tone="warn" />
          </div>
          {career.internationalNote ? (
            <div className="mt-4 border-t pt-3">
              <h3 className="text-sm font-semibold">Working abroad</h3>
              <p className="mt-1 text-sm text-muted">{career.internationalNote}</p>
            </div>
          ) : null}
        </Card>
      </section>

      {/* Honest trade-offs */}
      <section className="mt-10" aria-labelledby="tradeoffs">
        <SectionHeading title="The trade-offs" id="tradeoffs" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-verified-700 dark:text-verified-100">
              What&rsquo;s good about it
            </h3>
            <ul className="space-y-1.5 text-sm">
              {advantages.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-verified-600" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-estimate-700 dark:text-estimate-100">
              What&rsquo;s hard about it
            </h3>
            <ul className="space-y-1.5 text-sm">
              {disadvantages.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-estimate-600" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* Progression */}
      <section className="mt-10" aria-labelledby="progression">
        <SectionHeading title="How the career progresses" id="progression" />
        <ol className="relative space-y-4 border-l-2 border-dashed pl-6">
          {progression.map((stage) => (
            <li key={stage.stage} className="relative">
              <span
                aria-hidden
                className="absolute -left-[31px] top-1.5 size-3 rounded-full border-2 border-[var(--surface)] bg-brand-500"
              />
              <div className="flex flex-wrap items-baseline gap-x-3">
                <h3 className="font-medium">{stage.stage}</h3>
                <span className="text-sm text-faint">{stage.typicalYears}</span>
              </div>
              {stage.note ? <p className="mt-0.5 text-sm text-muted">{stage.note}</p> : null}
            </li>
          ))}
        </ol>
      </section>

      {/* Roadmap */}
      {detail.roadmapTemplate ? (
        <section className="mt-10" aria-labelledby="roadmap">
          <SectionHeading
            title="The step-by-step path"
            id="roadmap"
            description="A typical route. Sign in to turn this into a dated plan checked against your own timeline."
            action={
              <ButtonLink href={session ? `/dashboard/roadmaps?career=${career.slug}` : "/signup"} size="sm">
                Make it mine
              </ButtonLink>
            }
          />
          <RoadmapVisual
            steps={(detail.roadmapTemplate.steps as { title: string; description: string; kind: string; typicalMonths?: number }[]).map(
              (step) => ({
                title: step.title,
                description: step.description,
                kind: step.kind,
                meta: step.typicalMonths ? formatMonths(step.typicalMonths) : undefined,
              }),
            )}
          />
        </section>
      ) : null}

      {/* Next steps */}
      <section className="mt-10" aria-labelledby="next">
        <SectionHeading title="What to do next" id="next" />
        <Card>
          <ol className="space-y-2.5">
            {nextSteps.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/50 dark:text-brand-200">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* Related */}
      {detail.relatedCareers.length ? (
        <section className="mt-10" aria-labelledby="related">
          <SectionHeading
            title="If this isn't quite right"
            id="related"
            description="Adjacent careers that use overlapping skills or suit similar people."
          />
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {detail.relatedCareers.map((related) => (
              <Card as="li" key={related.slug} className="relative p-4">
                <h3 className="text-sm font-semibold">
                  <Link href={`/careers/${related.slug}`} className="hover:text-brand-600">
                    <span className="absolute inset-0" aria-hidden />
                    {related.name}
                  </Link>
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{related.summary}</p>
                <p className="mt-2 text-xs tabular-nums text-faint">
                  Entry {formatMoneyRange(related.salaryEntryMin, related.salaryEntryMax, related.currencyCode)}
                </p>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="mt-10 border-t pt-4">
        <SourceNote
          sourceName={source?.name}
          sourceUrl={source?.url}
          lastVerifiedAt={career.lastVerifiedAt}
          fallback="This guide has not yet been verified against a primary source."
        />
        <p className="mt-2 text-xs text-faint">
          Nothing on this page is a guarantee of admission, employment or income. Confirm eligibility,
          fees and licensing requirements with the relevant institution or authority before acting.
        </p>
      </footer>
    </article>
  );
}
