import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getPrimaryOrganisation, listOrganisationJobs } from "@/modules/employers/service";
import { Badge, ButtonLink, Callout, Card, EmptyState, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Hiring dashboard" };

const STATUS_TONE = {
  ACTIVE: "good",
  DRAFT: "neutral",
  CLOSED: "warn",
} as const;

const MODERATION_LABEL: Record<string, { label: string; tone: "neutral" | "warn" | "good" | "bad" }> = {
  UNVERIFIED: { label: "Not submitted", tone: "neutral" },
  PENDING: { label: "In review", tone: "warn" },
  VERIFIED: { label: "Approved", tone: "good" },
  REJECTED: { label: "Changes needed", tone: "bad" },
};

export default async function EmployerDashboardPage() {
  const session = await requirePage("/employers/dashboard");
  const membership = await getPrimaryOrganisation(session.sub);
  if (!membership) redirect("/employers/register");

  const { organisation } = membership;
  const jobs = await listOrganisationJobs(organisation.id, session.sub);

  const live = jobs.filter((j) => j.posting.status === "ACTIVE").length;
  const inReview = jobs.filter((j) => j.posting.moderationStatus === "PENDING").length;
  const applicants = jobs.reduce((total, j) => total + j.applicantCount, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {organisation.name}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {organisation.type} · {membership.role}
          </p>
        </div>
        <ButtonLink href="/employers/dashboard/jobs/new">Post a job</ButtonLink>
      </div>

      {organisation.verificationStatus !== "VERIFIED" ? (
        <div className="mt-6">
          <Callout
            tone={organisation.verificationStatus === "REJECTED" ? "danger" : "warn"}
            title={
              organisation.verificationStatus === "REJECTED"
                ? "Verification was declined"
                : organisation.verificationStatus === "PENDING"
                  ? "Verification in progress"
                  : "Not verified yet"
            }
          >
            <p>
              {organisation.verificationStatus === "REJECTED" ? (
                <>
                  {organisation.reviewNote ??
                    "We couldn't confirm this organisation. Get in touch to sort it out."}
                </>
              ) : (
                <>
                  Your postings can be written and saved now, but they stay in draft until the
                  organisation is verified. This is what stops fake employers reaching job-seekers
                  here, so it applies to everyone.
                </>
              )}
            </p>
          </Callout>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Live postings" value={live} />
        <Stat label="Awaiting review" value={inReview} tone={inReview ? "warn" : undefined} />
        <Stat label="Applicants" value={applicants} />
      </div>

      <section className="mt-10">
        <SectionHeading title="Your postings" />
        {jobs.length ? (
          <ul className="mt-5 grid gap-4">
            {jobs.map(({ posting, applicantCount }) => {
              const moderation = MODERATION_LABEL[posting.moderationStatus] ?? MODERATION_LABEL.UNVERIFIED;
              return (
                <Card as="li" key={posting.id} className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium">
                        <Link
                          href={`/employers/dashboard/jobs/${posting.id}`}
                          className="hover:text-brand-600"
                        >
                          <span className="absolute inset-0" aria-hidden />
                          {posting.title}
                        </Link>
                      </h3>
                      <p className="mt-1 text-sm text-muted">
                        {posting.city ?? "Location not set"} ·{" "}
                        {posting.employmentType.toLowerCase().replace("_", " ")}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[posting.status]}>{posting.status}</Badge>
                      <Badge tone={moderation.tone}>{moderation.label}</Badge>
                    </div>
                  </div>
                  <p className="mt-3 text-sm">
                    <span className="font-medium tabular-nums">{applicantCount}</span>{" "}
                    <span className="text-muted">
                      {applicantCount === 1 ? "applicant" : "applicants"}
                    </span>
                  </p>
                </Card>
              );
            })}
          </ul>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No postings yet"
              description="Write your first one. It saves as a draft, so nothing is public until you submit it."
              action={<ButtonLink href="/employers/dashboard/jobs/new">Post a job</ButtonLink>}
            />
          </div>
        )}
      </section>
    </div>
  );
}
