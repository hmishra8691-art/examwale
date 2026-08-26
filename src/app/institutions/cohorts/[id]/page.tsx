import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { cohortAnalytics, listCohortMembers, MIN_COHORT_SIZE } from "@/modules/b2b/service";
import { getMessages } from "@/modules/i18n/service";
import { InviteStudentsForm } from "@/components/cohort-controls";
import { Badge, ButtonLink, Callout, Card, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Cohort" };

type Props = { params: Promise<{ id: string }> };

function BreakdownList({
  title,
  breakdown,
}: {
  title: string;
  breakdown: { suppressed: boolean; reason?: string; rows?: { label: string; value: number }[] };
}) {
  return (
    <Card>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {breakdown.suppressed ? (
        <p className="mt-3 text-sm text-muted">{breakdown.reason}</p>
      ) : breakdown.rows?.length ? (
        <ul className="mt-3 space-y-2">
          {breakdown.rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{row.label}</span>
              <span className="font-medium tabular-nums">{row.value}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Nothing reaches the {MIN_COHORT_SIZE}-student threshold yet. Smaller groups are hidden
          rather than shown, because a count of one or two identifies people.
        </p>
      )}
    </Card>
  );
}

export default async function CohortPage({ params }: Props) {
  const { id } = await params;
  const session = await requirePage(`/institutions/cohorts/${id}`);

  let analytics;
  let members;
  try {
    [analytics, members] = await Promise.all([
      cohortAnalytics(id, session.sub),
      listCohortMembers(id, session.sub),
    ]);
  } catch {
    notFound();
  }

  const t = await getMessages();

  return (
    <div className="page page-measure py-10">
      <Link href="/institutions" className="text-sm text-muted hover:underline">
        ← All cohorts
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {analytics.cohort.name}
          </h1>
          {analytics.cohort.academicYear ? (
            <p className="mt-1 text-sm text-muted">{analytics.cohort.academicYear}</p>
          ) : null}
        </div>
        {analytics.consented >= MIN_COHORT_SIZE ? (
          <ButtonLink
            href={`/api/v1/b2b/cohorts/${id}/export`}
            variant="secondary"
            size="sm"
            prefetch={false}
          >
            Export CSV
          </ButtonLink>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Students joined" value={analytics.consented} />
        <Stat label="Invited" value={analytics.invitedTotal} />
        <Stat label="Privacy floor" value={MIN_COHORT_SIZE} hint="Minimum before figures show" />
      </div>

      {analytics.consented < MIN_COHORT_SIZE ? (
        <div className="mt-6">
          <Callout tone="warn" title="Figures hidden">
            {t.b2b.privacyFloor} {analytics.consented} of {analytics.invitedTotal} invited students
            have joined so far.
          </Callout>
        </div>
      ) : null}

      <section className="mt-10">
        <SectionHeading
          title={t.b2b.analytics}
          description="Counts across the cohort. Nothing here is attributable to an individual."
        />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <Stat label="Assessments taken" value={analytics.engagement.assessmentsTaken} />
          <Stat label="Roadmaps started" value={analytics.engagement.roadmapsStarted} />
          <Stat label="Goals set" value={analytics.engagement.goalsSet} />
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <BreakdownList title="Popular careers" breakdown={analytics.topCareers} />
          <BreakdownList title="Education background" breakdown={analytics.educationStages} />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          title={t.b2b.members}
          description="Membership only. This screen deliberately shows no activity per student."
        />
        {members.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4 font-medium">Student</th>
                  <th className="pb-2 pr-4 font-medium">Email</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((row) => (
                  <tr key={row.member.id} className="border-b border-[var(--border)]">
                    <td className="py-3 pr-4">{row.name ?? "—"}</td>
                    <td className="py-3 pr-4">{row.email ?? row.member.inviteEmail}</td>
                    <td className="py-3">
                      <Badge tone={row.member.consentedAt ? "good" : "neutral"}>
                        {row.member.consentedAt ? "Joined" : "Invited"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">Nobody invited yet.</p>
        )}
      </section>

      <section className="mt-10">
        <SectionHeading title={t.b2b.invite} />
        <Card className="mt-4">
          <InviteStudentsForm cohortId={id} />
        </Card>
      </section>
    </div>
  );
}
