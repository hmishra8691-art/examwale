import type { Metadata } from "next";
import Link from "next/link";
import { adminOverview, aiUsageByDay, listAuditLog } from "@/modules/admin/service";
import { findStaleRecords } from "@/modules/admin/publish";
import { Badge, ButtonLink, Callout, Card, SectionHeading, Stat } from "@/components/ui";
import { relativeDays } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminPage() {
  const [overview, usage, audit, stale] = await Promise.all([
    adminOverview(),
    aiUsageByDay(14),
    listAuditLog({ limit: 10 }),
    findStaleRecords(),
  ]);

  const peakCalls = Math.max(1, ...usage.map((day) => day.calls));

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          Overview
        </h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Users" value={overview.users.total} hint={`+${overview.users.newThisWeek} this week`} />
        <Stat
          label="Published careers"
          value={overview.careers.published}
          hint={`${overview.careers.draft} in draft`}
        />
        <Stat
          label="Published exams"
          value={overview.exams.published}
          hint={`${overview.exams.draft} in draft`}
        />
        <Stat label="Active jobs" value={overview.jobs.active} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Orgs awaiting review"
          value={overview.organisations.pending}
          tone={overview.organisations.pending > 0 ? "warn" : undefined}
        />
        <Stat label="Documents uploaded" value={overview.documents.total} />
        <Stat label="AI calls (7 days)" value={overview.ai.callsThisWeek} />
        <Stat
          label="AI cost (7 days)"
          value={`$${overview.ai.costThisWeek.toFixed(2)}`}
          hint={`${overview.ai.tokensThisWeek.toLocaleString()} tokens`}
        />
      </div>

      {stale.length ? (
        <Callout tone="warn" title={`${stale.length} record${stale.length === 1 ? "" : "s"} past their verification window`}>
          <p>
            These were verified against a source that has since expired. They stay visible but need
            re-checking against the primary source.
          </p>
          <ul className="mt-2 space-y-1">
            {stale.slice(0, 5).map((record) => (
              <li key={`${record.entityType}-${record.entityId}`}>
                {record.entityType} · {record.sourceName}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      <section aria-labelledby="ai-usage">
        <SectionHeading title="AI usage, last 14 days" id="ai-usage" />
        <Card>
          {usage.length ? (
            <>
              <div className="flex h-32 items-end gap-1.5" role="img" aria-label="Daily AI call volume over the last 14 days">
                {usage.map((day) => (
                  <div key={day.day} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-brand-400 transition-all"
                      style={{ height: `${Math.max(4, (day.calls / peakCalls) * 100)}%` }}
                      title={`${day.day}: ${day.calls} calls, $${day.cost.toFixed(3)}`}
                    />
                    <span className="text-[10px] tabular-nums text-faint">{day.day.slice(8)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-faint">
                Cost is estimated from token counts at published per-million rates. Directionally
                right, not billing-grade.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">No AI usage recorded yet.</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="recent-activity">
        <SectionHeading
          title="Recent activity"
          id="recent-activity"
          action={
            <ButtonLink href="/admin/audit" variant="ghost" size="sm">
              Full audit log →
            </ButtonLink>
          }
        />
        <Card className="p-0">
          {audit.length ? (
            <ul className="divide-y">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{entry.actorType}</Badge>
                    <span className="font-medium">{entry.action}</span>
                    <span className="text-muted">{entry.entityType}</span>
                  </div>
                  <span className="text-xs text-faint">{relativeDays(entry.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted">No activity recorded yet.</p>
          )}
        </Card>
      </section>

      <section aria-labelledby="quick-links">
        <SectionHeading title="Content management" id="quick-links" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/admin/careers", label: "Careers", detail: "Publish, unpublish, check verification" },
            { href: "/admin/exams", label: "Exams", detail: "Structure, editions and sources" },
            { href: "/admin/organisations", label: "Verification queue", detail: "Approve or reject organisations" },
            { href: "/admin/users", label: "Users", detail: "Search accounts and roles" },
          ].map((link) => (
            <Link key={link.href} href={link.href} className="card p-4 transition-colors hover:border-brand-400">
              <p className="font-medium">{link.label}</p>
              <p className="mt-0.5 text-sm text-muted">{link.detail}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
