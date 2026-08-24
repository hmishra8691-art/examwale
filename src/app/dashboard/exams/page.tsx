import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { exams, studyPlans } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { Badge, ButtonLink, Callout, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Study plans" };

const VERDICT_TONE: Record<string, "good" | "warn" | "bad"> = {
  ACHIEVABLE: "good",
  DIFFICULT: "warn",
  NEEDS_ADJUSTMENT: "warn",
  HIGHLY_UNLIKELY: "bad",
};

export default async function StudyPlansPage() {
  const session = await requirePage("/dashboard/exams");

  const plans = await db
    .select({
      id: studyPlans.id,
      hoursPerDay: studyPlans.hoursPerDay,
      targetDate: studyPlans.targetDate,
      createdAt: studyPlans.createdAt,
      feasibility: studyPlans.feasibility,
      plan: studyPlans.plan,
      examSlug: exams.slug,
      examName: exams.name,
      examShort: exams.shortName,
    })
    .from(studyPlans)
    .innerJoin(exams, eq(studyPlans.examId, exams.id))
    .where(eq(studyPlans.userId, session.sub))
    .orderBy(desc(studyPlans.createdAt));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Study plans
        </h1>
        <p className="mt-1 text-muted">
          Plans you&rsquo;ve generated from exam syllabuses, with the feasibility verdict for each.
        </p>
      </header>

      {plans.length === 0 ? (
        <EmptyState
          title="No study plans yet"
          description="Open any exam guide and use the plan builder. It works out the workload from the actual syllabus and tells you honestly whether your timeline fits."
          action={
            <ButtonLink href="/exams" size="sm">
              Browse exams
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {plans.map((plan) => (
            <Card as="li" key={plan.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">
                    <Link href={`/exams/${plan.examSlug}`} className="hover:text-brand-600">
                      {plan.examShort}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted">{plan.examName}</p>
                </div>
                <Badge tone={VERDICT_TONE[plan.feasibility.verdict] ?? "neutral"}>
                  {plan.feasibility.verdict.toLowerCase().replace(/_/g, " ")}
                </Badge>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Target date</dt>
                  <dd className="font-medium">{formatDate(plan.targetDate)}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Your hours</dt>
                  <dd className="font-medium tabular-nums">{plan.hoursPerDay}/day</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Workload implies</dt>
                  <dd className="font-medium tabular-nums">
                    {plan.feasibility.impliedHoursPerWeek} hrs/week
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-muted">Total estimated</dt>
                  <dd className="font-medium tabular-nums">
                    {plan.plan.totalHours.toLocaleString("en-IN")} hrs
                  </dd>
                </div>
              </dl>

              <p className="mt-3 border-t pt-3 text-sm text-muted">{plan.feasibility.note}</p>

              <p className="mt-2 text-xs text-faint">Created {formatDate(plan.createdAt)}</p>
            </Card>
          ))}
        </ul>
      )}

      <Callout tone="info" title="Plans are estimates, not schedules to obey">
        <p>
          The workload model assumes roughly six focused hours per syllabus weight unit. Your
          existing knowledge changes that substantially — if a subject is already familiar, you
          will move much faster through it than the plan assumes.
        </p>
      </Callout>
    </div>
  );
}
