import type { Metadata } from "next";
import { requireAdminPage } from "@/modules/auth/session";
import { env } from "@/modules/shared/env";
import { recentRuns, taskOverview } from "@/modules/scheduler/runner";
import { RunTaskButton } from "@/components/scheduler-admin";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Scheduled tasks" };
export const dynamic = "force-dynamic";

function relative(from: Date | null | undefined): string {
  if (!from) return "never";
  const seconds = Math.round((Date.now() - from.getTime()) / 1000);
  if (seconds < 90) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function interval(minutes: number): string {
  if (minutes < 60) return `every ${minutes}m`;
  if (minutes < 24 * 60) return `every ${minutes / 60}h`;
  return minutes === 1440 ? "daily" : `every ${minutes / 1440}d`;
}

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  SUCCEEDED: "good",
  RUNNING: "warn",
  FAILED: "bad",
  SKIPPED: "neutral",
};

export default async function SchedulerAdminPage() {
  await requireAdminPage("/admin/scheduler");
  const [tasks, runs] = await Promise.all([taskOverview(), recentRuns(40)]);

  const configured = Boolean(env.cronSecret);
  const neverRun = tasks.filter((t) => !t.last);
  const failing = tasks.filter((t) => t.last?.status === "FAILED");
  // A task is overdue once it is past twice its interval — one missed window is
  // a slow tick, two is something to look at.
  const overdue = tasks.filter(
    (t) =>
      t.last &&
      t.last.status !== "RUNNING" &&
      Date.now() - new Date(t.last.startedAt).getTime() > t.everyMinutes * 60_000 * 2,
  );

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Scheduled tasks"
        description="Everything that happens without a user present. Cadence lives in the code; a task is due when its last successful run is older than its interval."
      />

      {!configured ? (
        <Callout tone="danger" title="CRON_SECRET is not set">
          <p>
            The tick endpoint refuses every request until it is, so nothing below can run. Generate
            one with <code>openssl rand -base64 32</code> and set <code>CRON_SECRET</code> on the
            deployment. Failing closed is deliberate: this endpoint sends email and writes rows, so
            an unset secret must not leave a public trigger behind.
          </p>
        </Callout>
      ) : null}

      {failing.length ? (
        <Callout tone="danger" title={`${failing.length} task${failing.length === 1 ? "" : "s"} failed on its last run`}>
          <ul className="list-disc pl-5">
            {failing.map((t) => (
              <li key={t.task}>
                <strong>{t.label}</strong> — {t.last?.detail ?? "no detail recorded"}
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {overdue.length ? (
        <Callout tone="warn" title={`${overdue.length} task${overdue.length === 1 ? "" : "s"} overdue`}>
          <p>
            Past twice their interval. Usually this means the tick is being called less often than
            the tasks expect — see <code>SCHEDULING.md</code> for the frequency ceiling.
          </p>
        </Callout>
      ) : null}

      {configured && neverRun.length === tasks.length ? (
        <Callout tone="warn" title="Nothing has run yet">
          <p>
            The secret is set but no tick has arrived. Either the schedule has not fired yet, or
            whatever should be calling <code>/api/cron/tick</code> is not. Use{" "}
            <strong>Run now</strong> on any task to check the plumbing.
          </p>
        </Callout>
      ) : null}

      <div className="space-y-3">
        {tasks.map((task) => {
          const last = task.last;
          return (
            <Card key={task.task}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{task.label}</h3>
                    <Badge tone="neutral">{interval(task.everyMinutes)}</Badge>
                    {last ? (
                      <Badge tone={STATUS_TONE[last.status] ?? "neutral"}>{last.status}</Badge>
                    ) : (
                      <Badge tone="warn">never run</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                    {task.description}
                  </p>
                  <p className="mt-2 font-mono text-xs text-faint">{task.task}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-faint">
                    {last ? `ran ${relative(new Date(last.startedAt))}` : "not yet run"}
                  </p>
                  <div className="mt-2">
                    <RunTaskButton task={task.task} />
                  </div>
                </div>
              </div>

              {last ? (
                <div className="mt-3 border-t pt-3 text-[13.5px]">
                  <p className={last.status === "FAILED" ? "text-red-700 dark:text-red-300" : "text-muted"}>
                    {last.detail ?? "No detail recorded."}
                  </p>
                  <p className="mt-1 text-xs text-faint tabular-nums">
                    {last.processed} row{last.processed === 1 ? "" : "s"} touched
                    {last.finishedAt
                      ? ` · took ${Math.max(
                          0,
                          Math.round(
                            (new Date(last.finishedAt).getTime() -
                              new Date(last.startedAt).getTime()) /
                              100,
                          ) / 10,
                        )}s`
                      : " · still running"}
                  </p>
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <SectionHeading
        title="Recent runs"
        description="Newest first. Trimmed to the last 90 days by the housekeeping task."
      />

      {runs.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No runs recorded yet.</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto scroll-slim">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-3 font-medium">Task</th>
                  <th className="pb-2 pr-3 font-medium">Status</th>
                  <th className="pb-2 pr-3 font-medium">Started</th>
                  <th className="pb-2 pr-3 font-medium text-right">Rows</th>
                  <th className="pb-2 pr-3 font-medium">By</th>
                  <th className="pb-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b last:border-0 align-top">
                    <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{run.task}</td>
                    <td className="py-2 pr-3">
                      <Badge tone={STATUS_TONE[run.status] ?? "neutral"}>{run.status}</Badge>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted">
                      {relative(run.startedAt)}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{run.processed}</td>
                    <td className="py-2 pr-3 text-xs text-muted whitespace-nowrap">
                      {run.trigger === "cron" ? "cron" : "admin"}
                    </td>
                    <td className="py-2 text-xs text-muted">{run.detail ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
