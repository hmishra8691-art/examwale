import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { getInstitutionForUser, listCohorts, MIN_COHORT_SIZE } from "@/modules/b2b/service";
import { getMessages } from "@/modules/i18n/service";
import { CreateCohortForm } from "@/components/cohort-controls";
import { ButtonLink, Callout, Card, EmptyState, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Institution dashboard" };

export default async function InstitutionsPage() {
  const session = await requirePage("/institutions");
  const [t, membership] = await Promise.all([getMessages(), getInstitutionForUser(session.sub)]);

  if (!membership) {
    return (
      <div className="page page-measure-sm py-12">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          {t.b2b.title}
        </h1>
        <p className="mt-2 text-muted">
          For colleges and schools who want to see how a year group is progressing — in aggregate,
          and only for students who agreed to it.
        </p>

        <div className="mt-6">
          <Callout tone="info" title="What an institution can and cannot see">
            <p>
              Counts, and popular careers across a cohort. Not one student&rsquo;s assessment
              answers, roadmap, job applications or assistant conversations — none of that is ever
              exposed, to anyone, at any plan level.
            </p>
            <p className="mt-2">
              Figures only appear once at least {MIN_COHORT_SIZE} students have joined, so a
              breakdown can never point at an individual.
            </p>
          </Callout>
        </div>

        <div className="mt-8">
          <ButtonLink href="/employers/register">Register your institution</ButtonLink>
          <p className="mt-2 text-xs text-faint">
            Registration is shared with employer accounts — pick &ldquo;College or
            university&rdquo; as the type.
          </p>
        </div>
      </div>
    );
  }

  const cohorts = await listCohorts(membership.organisation.id, session.sub);
  const totalConsented = cohorts.reduce((sum, row) => sum + row.consented, 0);
  const totalInvited = cohorts.reduce((sum, row) => sum + row.invited, 0);

  return (
    <div className="page page-measure py-10">
      <SectionHeading
        title={membership.organisation.name}
        description="Cohort reporting. Aggregates only, and only for students who joined."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t.b2b.cohorts} value={cohorts.length} />
        <Stat label="Students joined" value={totalConsented} />
        <Stat label="Invitations pending" value={totalInvited} />
      </div>

      <div className="mt-6">
        <Callout tone="info">{t.b2b.privacyFloor}</Callout>
      </div>

      <section className="mt-10">
        <SectionHeading title={t.b2b.cohorts} />
        {cohorts.length ? (
          <ul className="mt-5 grid gap-4 md:grid-cols-2">
            {cohorts.map((row) => (
              <Card as="li" key={row.cohort.id} className="relative">
                <h3 className="font-medium">
                  <Link
                    href={`/institutions/cohorts/${row.cohort.id}`}
                    className="hover:text-brand-600"
                  >
                    <span className="absolute inset-0" aria-hidden />
                    {row.cohort.name}
                  </Link>
                </h3>
                {row.cohort.academicYear ? (
                  <p className="mt-0.5 text-xs text-faint">{row.cohort.academicYear}</p>
                ) : null}
                <p className="mt-3 text-sm">
                  <span className="font-medium tabular-nums">{row.consented}</span>{" "}
                  <span className="text-muted">joined</span>
                  {row.invited ? (
                    <span className="text-faint"> · {row.invited} invited</span>
                  ) : null}
                </p>
                {row.consented < MIN_COHORT_SIZE ? (
                  <p className="mt-1 text-xs text-estimate-700 dark:text-estimate-100">
                    Below the {MIN_COHORT_SIZE}-student floor — figures hidden
                  </p>
                ) : null}
              </Card>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No cohorts yet"
              description="Create one for a year group or a department, then invite students to it."
            />
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionHeading title="Create a cohort" />
        <Card className="mt-4">
          <CreateCohortForm organisationId={membership.organisation.id} />
        </Card>
      </section>
    </div>
  );
}
