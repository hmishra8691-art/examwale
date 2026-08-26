import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getExamBySlug } from "@/modules/exams/service";
import { getSession } from "@/modules/auth/session";
import {
  Badge,
  ButtonLink,
  Callout,
  Card,
  SectionHeading,
  SourceNote,
  SummaryPanel,
} from "@/components/ui";
import { formatDate, formatMoneyRange, levelLabel, titleCase } from "@/modules/shared/format";
import { SaveButton } from "@/components/save-button";
import { StudyPlanBuilder } from "@/components/study-plan-builder";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const detail = await getExamBySlug(slug);
    return {
      title: `${detail.exam.shortName} — eligibility, pattern and syllabus`,
      description: detail.exam.description.slice(0, 155),
    };
  } catch {
    return { title: "Exam not found" };
  }
}

export default async function ExamDetailPage({ params }: { params: Params }) {
  const { slug } = await params;

  let detail: Awaited<ReturnType<typeof getExamBySlug>>;
  try {
    detail = await getExamBySlug(slug);
  } catch {
    notFound();
  }

  const { exam, organisation, source } = detail;
  const session = await getSession();

  const eligibility = exam.eligibility as { label: string; detail: string }[];
  const age = exam.ageLimit as {
    min?: number;
    max?: number;
    relaxations?: { group: string; years: number }[];
    note?: string;
  };
  const currentEdition = detail.editions.find((edition) => edition.status === "PUBLISHED") ?? null;
  const totalWeight = detail.topics.reduce((sum, topic) => sum + topic.weightEstimate, 0);

  return (
    <article className="page page-measure py-8">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/exams" className="hover:text-[var(--text)]">
          Government exams
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <Link href={`/exams?category=${exam.category}`} className="hover:text-[var(--text)]">
          {titleCase(exam.category)}
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              {exam.shortName}
            </h1>
            <p className="mt-1 text-lg">{exam.name}</p>
            <p className="mt-1 text-sm text-muted">Conducted by {organisation.name}</p>
          </div>
          <SaveButton itemType="exam" itemId={exam.id} label={exam.shortName} signedIn={Boolean(session)} />
        </div>
        <p className="mt-4 max-w-3xl text-muted">{exam.description}</p>
      </header>

      <SummaryPanel
        eyebrow="The short version"
        title="Can I apply, and what does it take?"
        points={[
          { label: "Education needed", value: exam.educationRequirement },
          {
            label: "Age range",
            value: `${age.min ?? "—"} to ${age.max ?? "no upper limit"}`,
          },
          { label: "Stages", value: `${detail.stages.length} stage${detail.stages.length === 1 ? "" : "s"}` },
          { label: "Typical preparation", value: `${exam.preparationMonthsTypical ?? "?"} months` },
          { label: "Difficulty", value: levelLabel(exam.difficultyLevel) },
          { label: "Syllabus topics", value: `${detail.topics.length} across ${detail.subjects.length} subjects` },
        ]}
        footer={
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={exam.officialWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-brand-700 underline dark:text-brand-300"
            >
              Official website ↗
            </a>
            <span className="text-xs text-muted">
              Always confirm dates and eligibility there before applying.
            </span>
          </div>
        }
      />

      {/* Cycle data — deliberately empty until verified */}
      <section className="mt-8" aria-labelledby="dates">
        <SectionHeading title="This cycle's dates and vacancies" id="dates" />
        {currentEdition ? (
          <Card>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Notification</dt>
                <dd className="font-medium">{formatDate(currentEdition.notificationDate)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Applications close</dt>
                <dd className="font-medium">{formatDate(currentEdition.applicationEnd)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted">Vacancies</dt>
                <dd className="font-medium tabular-nums">{currentEdition.vacancyCount ?? "—"}</dd>
              </div>
            </dl>
            <SourceNote
              sourceName={source?.name}
              sourceUrl={currentEdition.officialNotificationUrl ?? exam.officialWebsite}
              lastVerifiedAt={currentEdition.lastVerifiedAt}
            />
          </Card>
        ) : (
          <Callout tone="warn" title="We don't have this cycle's dates yet">
            <p>
              Rather than show you a date we haven&rsquo;t verified, we&rsquo;re showing you nothing.
              Application windows, fees and vacancy counts for {exam.shortName} change every cycle and
              the only authoritative source is the official notification.
            </p>
            <p className="mt-2">
              <a
                href={exam.officialWebsite}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline"
              >
                Check {organisation.shortName}&rsquo;s official site ↗
              </a>
            </p>
          </Callout>
        )}
      </section>

      {/* Eligibility */}
      <section className="mt-10" aria-labelledby="eligibility">
        <SectionHeading title="Eligibility" id="eligibility" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Requirements</h3>
            <ul className="space-y-3">
              {eligibility.map((item) => (
                <li key={item.label}>
                  <span className="text-sm font-medium">{item.label}</span>
                  <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
                </li>
              ))}
              {exam.nationalityRequirement ? (
                <li>
                  <span className="text-sm font-medium">Nationality</span>
                  <p className="mt-0.5 text-sm text-muted">{exam.nationalityRequirement}</p>
                </li>
              ) : null}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Age limits</h3>
            <p className="text-2xl font-semibold tabular-nums">
              {age.min ?? "—"} – {age.max ?? "no upper limit"}
            </p>
            {age.relaxations?.length ? (
              <>
                <p className="mt-3 text-xs uppercase tracking-wide text-muted">Relaxations</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {age.relaxations.map((relaxation) => (
                    <li key={relaxation.group} className="flex justify-between gap-3">
                      <span>{relaxation.group}</span>
                      <span className="font-medium tabular-nums">+{relaxation.years} years</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {age.note ? <p className="mt-3 text-xs text-faint">{age.note}</p> : null}
          </Card>
        </div>
      </section>

      {/* Pattern */}
      <section className="mt-10" aria-labelledby="pattern">
        <SectionHeading title="Exam pattern" id="pattern" />
        <div className="space-y-4">
          {detail.stages.map((stage) => (
            <Card key={stage.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">
                  Stage {stage.sequence}: {stage.name}
                </h3>
                {stage.isQualifyingOnly ? <Badge tone="warn">Qualifying / screening</Badge> : null}
                {stage.negativeMarking ? <Badge tone="bad">Negative marking</Badge> : <Badge tone="good">No negative marking</Badge>}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                      <th className="pb-2 pr-3 font-medium">Paper</th>
                      <th className="pb-2 pr-3 font-medium">Marks</th>
                      <th className="pb-2 pr-3 font-medium">Questions</th>
                      <th className="pb-2 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(stage.pattern as { paper: string; marks?: number; questions?: number; durationMinutes?: number; note?: string }[]).map(
                      (paper) => (
                        <tr key={paper.paper} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {paper.paper}
                            {paper.note ? <span className="block text-xs text-faint">{paper.note}</span> : null}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">{paper.marks ?? "—"}</td>
                          <td className="py-2 pr-3 tabular-nums">{paper.questions ?? "—"}</td>
                          <td className="py-2 tabular-nums">
                            {paper.durationMinutes ? `${paper.durationMinutes} min` : "—"}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                {stage.marksTotal ? (
                  <span>
                    Total marks: <strong className="tabular-nums text-[var(--text)]">{stage.marksTotal}</strong>
                  </span>
                ) : null}
                {stage.durationMinutes ? (
                  <span>
                    Duration: <strong className="tabular-nums text-[var(--text)]">{stage.durationMinutes} min</strong>
                  </span>
                ) : null}
                {stage.negativeMarkingRatio ? <span>Penalty: {stage.negativeMarkingRatio}</span> : null}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Selection */}
      <section className="mt-10" aria-labelledby="selection">
        <SectionHeading title="Selection process" id="selection" />
        <ol className="relative space-y-4 border-l-2 border-dashed pl-6">
          {detail.selection.map((step) => (
            <li key={step.id} className="relative">
              <span
                aria-hidden
                className="absolute -left-[31px] top-1.5 size-3 rounded-full border-2 border-[var(--surface)] bg-brand-500"
              />
              <h3 className="font-medium">{step.name}</h3>
              <p className="mt-0.5 text-sm text-muted">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Syllabus */}
      <section className="mt-10" aria-labelledby="syllabus">
        <SectionHeading
          title="Syllabus"
          id="syllabus"
          description={`${detail.topics.length} topics across ${detail.subjects.length} subjects. The bar shows relative study load, not marks weightage.`}
        />
        <div className="space-y-3">
          {detail.subjects.map((subject) => {
            const subjectWeight = subject.topics.reduce((sum, topic) => sum + topic.weightEstimate, 0);
            const share = totalWeight ? Math.round((subjectWeight / totalWeight) * 100) : 0;
            return (
              <details key={subject.subject} className="card group p-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4">
                  <span className="flex-1 font-medium">{subject.subject}</span>
                  <span className="text-xs text-faint">{subject.topics.length} topics</span>
                  <span className="hidden w-28 sm:block">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                      <span className="block h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
                    </span>
                  </span>
                  <span className="w-10 text-right text-xs tabular-nums text-muted">{share}%</span>
                  <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden>
                    <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                  </svg>
                </summary>
                <ul className="border-t px-4 py-3">
                  {subject.topics.map((topic) => (
                    <li key={topic.id} className="flex items-center justify-between gap-3 py-1 text-sm">
                      <span>{topic.topic}</span>
                      <span className="flex gap-0.5" aria-label={`Study load ${topic.weightEstimate} of 5`}>
                        {Array.from({ length: 5 }).map((_, index) => (
                          <span
                            key={index}
                            className={
                              index < topic.weightEstimate
                                ? "h-1.5 w-3 rounded-full bg-brand-400"
                                : "h-1.5 w-3 rounded-full bg-ink-200 dark:bg-ink-700"
                            }
                          />
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </div>
      </section>

      {/* Study plan */}
      <section className="mt-10" aria-labelledby="plan">
        <SectionHeading
          title="Build a study plan"
          id="plan"
          description="Tell us your hours and target date. We'll do the arithmetic and tell you honestly whether it fits."
        />
        <StudyPlanBuilder examSlug={exam.slug} examName={exam.shortName} signedIn={Boolean(session)} />
      </section>

      {/* Pay */}
      {detail.pay.length ? (
        <section className="mt-10" aria-labelledby="pay">
          <SectionHeading title="Pay structure" id="pay" />
          <Card className="overflow-x-auto p-0">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
                  <th className="p-3 font-medium">Post</th>
                  <th className="p-3 font-medium">Pay level</th>
                  <th className="p-3 font-medium">Pay range</th>
                </tr>
              </thead>
              <tbody>
                {detail.pay.map((pay) => (
                  <tr key={pay.id} className="border-b last:border-0">
                    <td className="p-3">
                      {pay.postName}
                      {pay.note ? <span className="block text-xs text-faint">{pay.note}</span> : null}
                    </td>
                    <td className="p-3">{pay.payLevel ?? "—"}</td>
                    <td className="p-3 tabular-nums">
                      {formatMoneyRange(pay.grossRangeMin, pay.grossRangeMax, pay.currencyCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <p className="mt-2 text-xs text-faint">
            Basic pay per the applicable pay commission. Gross in hand varies with allowances and
            posting city. Confirm against the official notification.
          </p>
        </section>
      ) : null}

      {/* Resources by budget */}
      <section className="mt-10" aria-labelledby="resources">
        <SectionHeading
          title="Books and resources"
          id="resources"
          description="Grouped by what you can spend. The free tier is not a lesser option — a large share of successful candidates use only it."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              { key: "free", title: "₹0 — free", items: detail.resourcesByTier.free, tone: "good" as const },
              { key: "low", title: "Low budget", items: detail.resourcesByTier.low, tone: "brand" as const },
              { key: "standard", title: "Standard budget", items: detail.resourcesByTier.standard, tone: "neutral" as const },
            ]
          )
            .filter((tier) => tier.items.length > 0)
            .map((tier) => (
              <Card key={tier.key}>
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="font-semibold">{tier.title}</h3>
                  <Badge tone={tier.tone}>{tier.items.length}</Badge>
                </div>
                <ul className="space-y-3">
                  {tier.items.map((resource) => (
                    <li key={resource.id}>
                      <p className="text-sm font-medium">
                        {resource.url ? (
                          <a
                            href={resource.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand-600 underline"
                          >
                            {resource.title} ↗
                          </a>
                        ) : (
                          resource.title
                        )}
                      </p>
                      {resource.author ? <p className="text-xs text-faint">{resource.author}</p> : null}
                      {resource.note ? <p className="mt-0.5 text-sm text-muted">{resource.note}</p> : null}
                      {resource.costNote ? <p className="mt-0.5 text-xs text-faint">{resource.costNote}</p> : null}
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          We don&rsquo;t store book or course prices, because a stale price presented as current is
          worse than no price. Check the seller before ordering.
        </p>
      </section>

      {/* Application */}
      <section className="mt-10" aria-labelledby="apply">
        <SectionHeading title="How to apply" id="apply" />
        <Card>
          <p className="text-sm">{exam.applicationProcess}</p>
          <div className="mt-4">
            <ButtonLink href={exam.officialWebsite} target="_blank" rel="noopener noreferrer" size="sm">
              Go to the official site ↗
            </ButtonLink>
          </div>
        </Card>
      </section>

      {exam.competitionNote ? (
        <section className="mt-10" aria-labelledby="competition">
          <SectionHeading title="What you're up against" id="competition" />
          <Callout tone="warn">
            <p>{exam.competitionNote}</p>
          </Callout>
        </section>
      ) : null}

      <footer className="mt-10 border-t pt-4">
        <SourceNote
          sourceName={source?.name}
          sourceUrl={source?.url}
          lastVerifiedAt={exam.lastVerifiedAt}
          fallback="This exam guide has not yet been verified against a primary source."
        />
        <p className="mt-2 text-xs text-faint">
          Eligibility, age limits, fees and dates change every cycle. This page is a planning aid,
          not the notification. Confirm everything with {organisation.name} before applying.
        </p>
      </footer>
    </article>
  );
}
