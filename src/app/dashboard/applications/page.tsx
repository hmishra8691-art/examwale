import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { listApplications } from "@/modules/jobs/service";
import { Badge, ButtonLink, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Applications" };

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "brand"> = {
  SAVED: "neutral",
  APPLIED: "brand",
  IN_REVIEW: "warn",
  OFFER: "good",
  REJECTED: "bad",
  WITHDRAWN: "neutral",
};

export default async function ApplicationsPage() {
  const session = await requirePage("/dashboard/applications");
  const applications = await listApplications(session.sub);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Applications
        </h1>
        <p className="mt-1 text-muted">
          Every role you&rsquo;ve applied to through ExamWale, with the match estimate at the time.
        </p>
      </header>

      {applications.length === 0 ? (
        <EmptyState
          title="No applications yet"
          description="When you apply to a job here, it appears in this list so you can track where things stand."
          action={
            <ButtonLink href="/jobs" size="sm">
              Browse jobs
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {applications.map((application) => (
            <Card as="li" key={application.id} className="relative">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">
                    <Link href={`/jobs/${application.jobSlug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {application.jobTitle}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted">{application.companyName}</p>
                  <p className="mt-1 text-xs text-faint">
                    Applied {formatDate(application.appliedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {application.matchScore != null ? (
                    <span className="text-sm tabular-nums text-muted">
                      {application.matchScore}% match
                    </span>
                  ) : null}
                  <Badge tone={STATUS_TONE[application.status] ?? "neutral"}>
                    {application.status.toLowerCase().replace(/_/g, " ")}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
