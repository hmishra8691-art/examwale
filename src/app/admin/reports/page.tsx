import type { Metadata } from "next";
import { requireAdminPage } from "@/modules/auth/session";
import { REPORT_REASONS, openReports, reportDetail } from "@/modules/messaging/service";
import { formatDate } from "@/modules/shared/format";
import { ReportReview } from "@/components/admin-report-review";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requireAdminPage("/admin/reports");
  const reports = await openReports();

  // The conversation around each report, so a moderator can judge in context
  // rather than from one line taken out of it.
  const details = await Promise.all(reports.map((row) => reportDetail(row.report.id)));

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Reports"
        description="Nothing here was actioned automatically. An automatic suspension on report is a weapon for whoever reports the most."
      />

      {reports.length === 0 ? (
        <EmptyState title="Nothing waiting" description="Reports appear here as they arrive." />
      ) : (
        <div className="space-y-4">
          {reports.map((row, index) => {
            const detail = details[index];
            return (
              <Card key={row.report.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="bad">
                        {REPORT_REASONS[row.report.reason as keyof typeof REPORT_REASONS] ??
                          row.report.reason}
                      </Badge>
                      <Badge tone="neutral">{row.report.subjectType.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-1.5 text-sm">
                      Reported by <strong>{row.reporterName ?? "someone"}</strong>
                    </p>
                    {row.report.detail ? (
                      <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">
                        {row.report.detail}
                      </p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-xs text-faint">{formatDate(row.report.createdAt)}</p>
                </div>

                {detail.messages.length ? (
                  <div className="mt-3 rounded-lg border bg-[var(--surface-raised)] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                      The conversation
                    </p>
                    <ol className="space-y-1.5 text-[13.5px]">
                      {detail.messages.map((message) => (
                        <li
                          key={message.id}
                          className={
                            message.id === row.report.subjectId
                              ? "rounded border-l-2 border-red-500 bg-red-50 px-2 py-1 dark:bg-red-900/20"
                              : "px-2 py-1"
                          }
                        >
                          <span className="text-faint">
                            {formatDate(message.createdAt)}
                            {message.wasDeleted ? " · removed by sender" : ""}
                          </span>
                          <br />
                          <span className="whitespace-pre-wrap">{message.body}</span>
                        </li>
                      ))}
                    </ol>
                    <p className="mt-2 text-xs text-faint">
                      Messages the sender removed are shown here in full. That is the reason the
                      original text is kept — a deletion that destroys the evidence protects
                      whoever sent the abuse.
                    </p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <Callout tone="info">
                      <p>
                        This report is about a person rather than a message, so there is no
                        conversation attached.
                      </p>
                    </Callout>
                  </div>
                )}

                <ReportReview reportId={row.report.id} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
