/**
 * Manual trigger for one scheduled task.
 *
 * Session-authenticated and admin-only, unlike `/api/cron/tick` which uses a
 * shared secret — different callers, different mechanisms. This one is for a
 * person clicking a button, so it goes through the same admin gate and the same
 * audit log as every other administrative action.
 *
 * `force: true`, because a task that is not due is exactly the one an operator
 * wants to test.
 */
import { ok, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { NotFoundError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { runTask } from "@/modules/scheduler/runner";
import { isTaskName } from "@/modules/scheduler/tasks";

type Context = { params: Promise<{ task: string }> };

export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireAdmin();
  const { task } = await context.params;

  if (!isTaskName(task)) throw new NotFoundError("No such scheduled task.");

  // These sweeps send email. A stuck finger on the button should not mean a
  // hundred ticks, even from an admin.
  await consume(`admin:scheduler:${session.sub}`, 30, 60 * 60);

  const outcome = await runTask(task, { force: true, trigger: session.sub });

  await recordAudit({
    actorType: "admin",
    actorId: session.sub,
    action: "scheduler.run",
    entityType: "scheduled_task",
    entityId: task,
    after: { status: outcome.status, processed: outcome.processed, detail: outcome.detail },
  });

  return ok(outcome);
});
