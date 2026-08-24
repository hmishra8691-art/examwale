import type { Metadata } from "next";
import { listAuditLog } from "@/modules/admin/service";
import { Badge, Callout, Card } from "@/components/ui";
import { one } from "@/modules/shared/params";

export const metadata: Metadata = { title: "Audit log · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const entityType = one(params.entityType);
  const entries = await listAuditLog({ entityType, limit: 200 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Audit log
        </h1>
        <p className="mt-1 text-muted">
          Append-only. Every admin mutation, auth event and content publish, with before and after
          state where it applies.
        </p>
      </header>

      <Callout tone="info">
        <p>
          Entries are never edited or deleted from the application. If you need to redact something
          for a data-subject request, do it through a documented database operation with its own
          record — not by quietly removing a row.
        </p>
      </Callout>

      <form action="/admin/audit" method="get" className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="entity" className="mb-1 block text-xs font-medium text-muted">
            Filter by entity type
          </label>
          <input
            id="entity"
            name="entityType"
            defaultValue={entityType}
            placeholder="e.g. career, user, job_posting"
            className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">
          Filter
        </button>
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted">
              <th className="p-3 font-medium">When</th>
              <th className="p-3 font-medium">Actor</th>
              <th className="p-3 font-medium">Action</th>
              <th className="p-3 font-medium">Entity</th>
              <th className="p-3 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b last:border-0 align-top">
                <td className="whitespace-nowrap p-3 tabular-nums text-muted">
                  {entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </td>
                <td className="p-3">
                  <Badge tone="neutral">{entry.actorType}</Badge>
                  {entry.actorId ? (
                    <span className="block text-xs text-faint">{entry.actorId.slice(0, 12)}…</span>
                  ) : null}
                </td>
                <td className="p-3 font-medium">{entry.action}</td>
                <td className="p-3">
                  {entry.entityType}
                  {entry.entityId ? (
                    <span className="block text-xs text-faint">{entry.entityId.slice(0, 12)}…</span>
                  ) : null}
                </td>
                <td className="max-w-xs p-3">
                  {entry.before || entry.after ? (
                    <details>
                      <summary className="cursor-pointer text-xs text-brand-600">View</summary>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted">
                        {JSON.stringify({ before: entry.before, after: entry.after }, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {entries.length === 0 ? <p className="text-sm text-muted">No entries yet.</p> : null}
    </div>
  );
}
