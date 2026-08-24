import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { jobModerationReviews } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import { getOwnedPosting, listApplicants } from "@/modules/employers/service";
import { formatMoneyRange } from "@/modules/shared/format";
import {
  ApplicantStatusControl,
  FLAG_LABELS,
  PostingActions,
} from "@/components/employer-forms";
import { Badge, ButtonLink, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Posting" };

type Props = { params: Promise<{ id: string }> };

export default async function EmployerJobDetailPage({ params }: Props) {
  const { id } = await params;
  const session = await requirePage(`/employers/dashboard/jobs/${id}`);

  let posting;
  try {
    posting = await getOwnedPosting(id, session.sub);
  } catch {
    notFound();
  }

  const [applicants, reviews] = await Promise.all([
    listApplicants(id, session.sub),
    db
      .select()
      .from(jobModerationReviews)
      .where(eq(jobModerationReviews.jobPostingId, id))
      .orderBy(desc(jobModerationReviews.createdAt))
      .limit(10),
  ]);

  const latestRejection = reviews.find((review) => review.decision === "reject");
  const flags = reviews.find((review) => review.automatedFlags?.length)?.automatedFlags ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/employers/dashboard" className="text-sm text-muted hover:underline">
        ← Back to dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {posting.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={posting.status === "ACTIVE" ? "good" : "neutral"}>{posting.status}</Badge>
            <span className="text-sm text-muted">
              {posting.city ?? "No location"} ·{" "}
              {posting.employmentType.toLowerCase().replace("_", " ")}
            </span>
          </div>
        </div>
        {posting.status === "ACTIVE" ? (
          <ButtonLink href={`/jobs/${posting.slug}`} variant="secondary" size="sm">
            View public page
          </ButtonLink>
        ) : null}
      </div>

      {posting.moderationStatus === "REJECTED" && latestRejection ? (
        <div className="mt-6">
          <Callout tone="danger" title="Not approved">
            <p>{latestRejection.reason}</p>
            <p className="mt-2">Edit the posting and submit it again.</p>
          </Callout>
        </div>
      ) : null}

      {flags.length ? (
        <div className="mt-6">
          <Callout tone="warn" title="Flagged for a reviewer">
            <ul className="list-inside list-disc">
              {flags.map((flag) => (
                <li key={flag}>{FLAG_LABELS[flag] ?? flag}</li>
              ))}
            </ul>
            <p className="mt-2">
              These are automated pattern matches, not decisions. A person reads the posting and
              may well disagree with them.
            </p>
          </Callout>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Description</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed">{posting.description}</p>
          </Card>

          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Details</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted">Pay</dt>
                <dd className="font-medium">
                  {posting.isSalaryDisclosed
                    ? formatMoneyRange(posting.salaryMin, posting.salaryMax, posting.currencyCode)
                    : "Not disclosed"}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Experience</dt>
                <dd className="font-medium">
                  {posting.experienceMinYears}
                  {posting.experienceMaxYears ? `–${posting.experienceMaxYears}` : "+"} years
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted">Skills</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {posting.skillsRequired.map((skill) => (
                    <Badge key={skill}>{skill}</Badge>
                  ))}
                </dd>
              </div>
            </dl>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Actions</h2>
            <div className="mt-3">
              <PostingActions jobId={posting.id} status={posting.status} />
            </div>
            <div className="mt-4">
              <ButtonLink
                href={`/employers/dashboard/jobs/new?edit=${posting.id}`}
                variant="secondary"
                size="sm"
                full
              >
                Edit posting
              </ButtonLink>
            </div>
          </Card>
        </div>
      </div>

      <section className="mt-10">
        <SectionHeading
          title="Applicants"
          description="What each person chose to submit with their application, and nothing else from their account."
        />
        {applicants.length ? (
          <ul className="mt-5 grid gap-3">
            {applicants.map((row) => (
              <Card as="li" key={row.application.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{row.applicantName ?? "Applicant"}</p>
                    <p className="mt-0.5 text-sm text-muted">{row.applicantEmail}</p>
                    <p className="mt-1 text-xs text-faint">
                      {[
                        row.degree,
                        row.major,
                        row.city,
                        row.yearsExperience != null ? `${row.yearsExperience} yrs experience` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "No profile details shared"}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {row.application.matchScore != null ? (
                      <Badge tone="brand">{row.application.matchScore}% match</Badge>
                    ) : null}
                    <ApplicantStatusControl
                      applicationId={row.application.id}
                      status={row.application.status}
                    />
                  </div>
                </div>
                {row.application.coverLetter ? (
                  <p className="mt-3 border-t border-[var(--border)] pt-3 text-sm leading-relaxed">
                    {row.application.coverLetter}
                  </p>
                ) : null}
              </Card>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No applicants yet"
              description={
                posting.status === "ACTIVE"
                  ? "The posting is live. Applications will appear here."
                  : "This posting isn't live yet, so nobody can apply to it."
              }
            />
          </div>
        )}
      </section>
    </div>
  );
}
