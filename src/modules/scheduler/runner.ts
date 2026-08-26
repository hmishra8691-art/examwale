/**
 * Scheduled-task runner.
 *
 * The design constraint that shapes this file: the host's cron cannot be
 * trusted to fire on a fine schedule. Vercel's Hobby plan allows a single daily
 * entry; an operator may hit the manual trigger at any moment; a deploy can miss
 * a window entirely. So there is exactly one HTTP entry point — a *tick* — and
 * it runs whichever tasks are due, where "due" means the last successful run is
 * older than the task's declared interval.
 *
 * That inverts the usual arrangement, and it is worth being explicit about why:
 * cadence lives in the code and in the run history, not in a platform config
 * file. One consequence is that the whole thing works behind any caller that can
 * make an authenticated request every few minutes — Vercel Cron, GitHub Actions,
 * a Raspberry Pi — and moving hosts does not mean rewriting the schedule.
 *
 * Three properties every task here must have, because a scheduler will
 * eventually run each of them twice:
 *
 *  - Idempotent. Notifications go out through `notify()` with a `dedupeKey`, and
 *    a unique index on (user_id, dedupe_key) means the second send is a no-op at
 *    the database rather than a decision in application code.
 *  - Bounded. Each task takes a row limit, so a first run against a large
 *    backlog cannot exceed the host's function timeout. What it does not finish,
 *    the next tick picks up.
 *  - Reportable. A task returns how many rows it touched and one line of what
 *    happened. Silence is indistinguishable from failure, so nothing is silent.
 */
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduledTaskRuns } from "@/db/schema";
import { createId } from "@/db/id";
import { isUniqueViolation } from "@/modules/shared/errors";
import { TASKS, type TaskName } from "@/modules/scheduler/tasks";

/** A RUNNING row older than this is assumed dead and released. */
const STALE_RUN_MINUTES = 15;

export type TaskResult = {
  processed: number;
  detail: string;
};

export type RunOutcome = {
  task: TaskName;
  status: "SUCCEEDED" | "FAILED" | "SKIPPED";
  processed: number;
  detail: string;
  durationMs: number;
};

/**
 * Release runs that were claimed and never finished.
 *
 * A function killed mid-task — timeout, deploy, crash — leaves a RUNNING row
 * holding the partial unique index, which would block that task forever. This
 * is why the index is on RUNNING rather than a boolean column: the stuck row
 * stays visible in the history as a FAILED run with a reason, instead of being
 * quietly overwritten.
 */
async function releaseStaleRuns(): Promise<number> {
  const result = await db
    .update(scheduledTaskRuns)
    .set({
      status: "FAILED",
      finishedAt: new Date(),
      detail: `Abandoned: still RUNNING after ${STALE_RUN_MINUTES} minutes. The process was probably killed mid-task.`,
    })
    .where(
      and(
        eq(scheduledTaskRuns.status, "RUNNING"),
        lt(scheduledTaskRuns.startedAt, new Date(Date.now() - STALE_RUN_MINUTES * 60_000)),
      ),
    )
    .returning({ id: scheduledTaskRuns.id });
  return result.length;
}

/** The most recent run of a task that actually did work. */
async function lastSuccess(task: TaskName): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: scheduledTaskRuns.startedAt })
    .from(scheduledTaskRuns)
    .where(and(eq(scheduledTaskRuns.task, task), eq(scheduledTaskRuns.status, "SUCCEEDED")))
    .orderBy(desc(scheduledTaskRuns.startedAt))
    .limit(1);
  return row?.startedAt ?? null;
}

/**
 * Whether a task would run right now.
 *
 * Informational only — `runTask` does its own due check inside the claiming
 * statement, because a check that happens before the write can be raced. Keep
 * this for display and diagnostics, not for gating.
 */
export async function isDue(task: TaskName, now = new Date()): Promise<boolean> {
  const definition = TASKS[task];
  const previous = await lastSuccess(task);
  // Never run: due immediately, so a fresh deployment catches up rather than
  // waiting a full interval before doing anything.
  if (!previous) return true;
  return now.getTime() - previous.getTime() >= definition.everyMinutes * 60_000;
}

/**
 * Run one task, recording the attempt either way.
 *
 * `force` skips the due check — that is what the admin "run now" button uses,
 * and it is the only way to exercise a task on demand without editing an
 * interval.
 */
export async function runTask(
  task: TaskName,
  options: { force?: boolean; trigger?: string } = {},
): Promise<RunOutcome> {
  const definition = TASKS[task];
  const startedAt = Date.now();
  const trigger = options.trigger ?? "cron";

  /*
   * Claim and due-check under a per-task lock.
   *
   * Getting here took three attempts, and the two rejected ones are worth
   * recording because both looked correct:
   *
   *  1. `isDue()` and then INSERT. Two ticks both read "not run yet" and both
   *     proceeded. Four concurrent ticks reproduced it immediately.
   *  2. A single `INSERT … SELECT … WHERE NOT EXISTS`, relying on the partial
   *     unique index on RUNNING to catch the overlap. Still raced, more subtly:
   *     under READ COMMITTED the subquery reads the snapshot from the *start* of
   *     the statement, while the index is checked when the row is actually
   *     written. A first run that finishes in between — these housekeeping
   *     sweeps take about five milliseconds — flips its row from RUNNING to
   *     SUCCEEDED, so the second tick's subquery sees no completed run and its
   *     index check finds nothing to collide with. Both conditions pass, at
   *     different instants, and the task runs twice.
   *
   * A transaction-scoped advisory lock closes it: everything between taking the
   * lock and committing is serialised per task name. Transaction-scoped
   * specifically, because it is released on commit or rollback without an
   * explicit unlock — a session-scoped lock leaks a held lock into a pooled
   * connection the moment a task throws.
   *
   * The observable consequence today is small: the purges are idempotent and
   * every notification carries a dedupe key, so nothing was actually sent twice.
   * It is fixed anyway because "runs every N minutes" is the contract this file
   * offers to whoever adds the next task, and that person will not have read
   * this comment.
   */
  const intervalMinutes = options.force ? 0 : definition.everyMinutes;
  const claimId = createId();

  let runId: string | null = null;
  try {
    runId = await db.transaction(async (tx) => {
      // hashtext collides across different task names occasionally; the cost of
      // a collision is that two unrelated tasks briefly serialise, which is
      // invisible at this scale.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`scheduler:${task}`}))`);

      const claimed = await tx.execute<{ id: string }>(sql`
        INSERT INTO scheduled_task_runs (id, task, status, trigger, started_at)
        SELECT ${claimId}, ${task}, 'RUNNING', ${trigger}, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM scheduled_task_runs
          WHERE task = ${task}
            AND status IN ('RUNNING', 'SUCCEEDED')
            AND started_at > now() - make_interval(mins => ${intervalMinutes})
        )
        RETURNING id
      `);

      return claimed.rows?.[0]?.id ?? null;
    });
  } catch (error) {
    // The partial unique index remains as a second line of defence, for a
    // caller that reaches this table without taking the lock.
    if (isUniqueViolation(error)) {
      return {
        task,
        status: "SKIPPED",
        processed: 0,
        detail: "Already running elsewhere.",
        durationMs: Date.now() - startedAt,
      };
    }
    throw error;
  }

  if (!runId) {
    return {
      task,
      status: "SKIPPED",
      processed: 0,
      detail: `Not due — runs every ${definition.everyMinutes} minutes.`,
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    const result = await definition.run({ limit: definition.limit });
    await db
      .update(scheduledTaskRuns)
      .set({
        status: "SUCCEEDED",
        finishedAt: new Date(),
        processed: result.processed,
        detail: result.detail,
      })
      .where(eq(scheduledTaskRuns.id, runId));

    return {
      task,
      status: "SUCCEEDED",
      processed: result.processed,
      detail: result.detail,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db
      .update(scheduledTaskRuns)
      .set({ status: "FAILED", finishedAt: new Date(), detail: message.slice(0, 2000) })
      .where(eq(scheduledTaskRuns.id, runId));

    // Recorded, not rethrown. One failing task must not stop the rest of the
    // tick — a broken exam-deadline sweep should not also silence session
    // reminders.
    return {
      task,
      status: "FAILED",
      processed: 0,
      detail: message,
      durationMs: Date.now() - startedAt,
    };
  }
}

/**
 * One tick: every task that is due, in declaration order.
 *
 * Sequential rather than parallel. These are small sweeps against one database,
 * and running them one at a time keeps a slow task from competing with the
 * others for connections on a host where the pool is a handful of sockets.
 */
export async function runDueTasks(
  options: { trigger?: string } = {},
): Promise<{ released: number; outcomes: RunOutcome[] }> {
  const released = await releaseStaleRuns();
  const outcomes: RunOutcome[] = [];

  for (const task of Object.keys(TASKS) as TaskName[]) {
    outcomes.push(await runTask(task, { trigger: options.trigger }));
  }

  return { released, outcomes };
}

/** Recent history for the admin panel, newest first. */
export async function recentRuns(limit = 50) {
  return db
    .select()
    .from(scheduledTaskRuns)
    .orderBy(desc(scheduledTaskRuns.startedAt))
    .limit(limit);
}

/**
 * One row per registered task: what it does, when it last ran, how it went.
 *
 * Built from the registry rather than from the history, so a task that has never
 * run appears with "never" instead of being absent — which is exactly the state
 * an operator most needs to see.
 */
export async function taskOverview() {
  const latest = await db
    .select({
      task: scheduledTaskRuns.task,
      status: scheduledTaskRuns.status,
      startedAt: scheduledTaskRuns.startedAt,
      finishedAt: scheduledTaskRuns.finishedAt,
      processed: scheduledTaskRuns.processed,
      detail: scheduledTaskRuns.detail,
      rank: sql<number>`row_number() over (
        partition by ${scheduledTaskRuns.task}
        order by ${scheduledTaskRuns.startedAt} desc
      )`.as("rank"),
    })
    .from(scheduledTaskRuns);

  const byTask = new Map(latest.filter((row) => Number(row.rank) === 1).map((r) => [r.task, r]));

  return (Object.keys(TASKS) as TaskName[]).map((task) => ({
    task,
    label: TASKS[task].label,
    description: TASKS[task].description,
    everyMinutes: TASKS[task].everyMinutes,
    last: byTask.get(task) ?? null,
  }));
}
