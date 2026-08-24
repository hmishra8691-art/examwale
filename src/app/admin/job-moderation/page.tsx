import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import { listPendingModeration } from "@/modules/employers/service";
import { ModerationDecision } from "@/components/admin-moderation";
import { FLAG_LABELS } from "@/components/employer-forms";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";
import { formatMoneyRange } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Job moderation" };

export default async function JobModerationPage() {
  await requireAdminPage("/admin/job-moderation");
  const queue = await listPendingModeration();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Job moderation"
        description="Employer-submitted postings waiting for a decision. Nothing here is visible to job-seekers."
      />

      <div className="mt-6">
        <Callout tone="info" title="What you're deciding">
          Approve only if the role is plausible, the organisation is verified, and nothing asks the
          candidate for money or for identity documents before an interview. The flags below are
          pattern matches — read the posting, not just the flags.
        </Callout>
      </div>

      {queue.length ? (
        <ul className="mt-6 grid gap-5">
          {queue.map(({ posting, organisation, flags }) => (
            <Card as="li" key={posting.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{posting.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    {organisation.name} ·{" "}
                    <Badge
                      tone={organisation.verificationStatus === "VERIFIED" ? "good" : "warn"}
                    >
                      {organisation.verificationStatus === "VERIFIED"
                        ? "Org verified"
                        : "Org not verified"}
                    </Badge>
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    {posting.city ?? "No location"} ·{" "}
                    {posting.isSalaryDisclosed
                      ? formatMoneyRange(posting.salaryMin, posting.salaryMax, posting.currencyCode)
                      : "Pay not disclosed"}
                    {organisation.website ? (
                      <>
                        {" · "}
                        <a
                          href={organisation.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          website
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              {flags.length ? (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {flags.map((flag) => (
                    <li key={flag}>
                      <Badge tone="bad">{FLAG_LABELS[flag] ?? flag}</Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-faint">No automated flags.</p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-medium">Read the posting</summary>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted">
                  {posting.description}
                </p>
              </details>

              {organisation.verificationStatus !== "VERIFIED" ? (
                <p className="mt-4 text-sm text-estimate-700 dark:text-estimate-100">
                  This organisation isn&rsquo;t verified, so approving will not publish the posting.{" "}
                  <Link href="/admin" className="underline">
                    Verify the organisation first
                  </Link>
                  .
                </p>
              ) : null}

              <div className="mt-4 border-t border-[var(--border)] pt-4">
                <ModerationDecision jobId={posting.id} />
              </div>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState title="Queue is empty" description="No postings are waiting for review." />
        </div>
      )}
    </div>
  );
}
