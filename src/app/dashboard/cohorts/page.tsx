import type { Metadata } from "next";
import { requirePage } from "@/modules/auth/session";
import { cohortDisclosureForUser } from "@/modules/b2b/service";
import { CohortMembershipControl } from "@/components/cohort-controls";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Your institutions" };

/**
 * The student's side of B2B.
 *
 * The two lists below are generated from `cohortDisclosureForUser`, not typed
 * out as marketing copy, so they cannot quietly become untrue if the analytics
 * change. Someone deciding whether to join their college's cohort is entitled
 * to an exact answer, not a reassuring one.
 */
export default async function StudentCohortsPage() {
  const session = await requirePage("/dashboard/cohorts");
  const { memberships, shared, notShared } = await cohortDisclosureForUser(session.sub);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Your institutions"
        description="Cohorts you've been invited to, and exactly what joining shares."
      />

      {memberships.length ? (
        <ul className="mt-6 grid gap-4">
          {memberships.map((row) => (
            <Card as="li" key={row.member.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{row.cohort.name}</h3>
                  <p className="mt-0.5 text-sm text-muted">{row.organisationName}</p>
                  {row.cohort.description ? (
                    <p className="mt-2 text-sm text-muted">{row.cohort.description}</p>
                  ) : null}
                </div>
                <Badge tone={row.member.consentedAt ? "good" : "warn"}>
                  {row.member.consentedAt ? "Joined" : "Invitation pending"}
                </Badge>
              </div>

              <div className="mt-4">
                <CohortMembershipControl
                  cohortId={row.cohort.id}
                  status={row.member.status}
                />
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No invitations"
            description="If your college or school uses ExamWale, an invitation will appear here. You choose whether to accept."
          />
        </div>
      )}

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            What your institution sees
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {shared.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="text-verified-600">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            What it never sees
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {notShared.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="text-red-500">
                  ✕
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <div className="mt-6">
        <Callout tone="info" title="You can leave whenever you want">
          Leaving removes you from every figure immediately. Your institution is not told, and
          nothing you have done on ExamWale is deleted or changed — it simply stops being counted.
        </Callout>
      </div>
    </div>
  );
}
