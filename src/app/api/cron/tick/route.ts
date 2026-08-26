/**
 * The scheduler's only unauthenticated-by-session entry point.
 *
 * One route, called on a timer, that runs whatever is due. See
 * `modules/scheduler/runner.ts` for why the cadence lives in the code rather
 * than in the host's cron config — the short version is that Vercel's Hobby plan
 * allows a single daily entry, and a scheduler that only works on one host's
 * paid tier is not a scheduler.
 *
 * Authentication is a shared secret in a header, compared in constant time.
 * Notably it is *not* a session: there is no user here, and requiring one would
 * mean either giving the cron caller an account or carving a hole in the session
 * middleware, both of which are worse.
 *
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when the
 * variable is set on the project, so the same route works from Vercel Cron,
 * GitHub Actions, or anything else that can make an HTTP request on a timer.
 *
 * With no CRON_SECRET configured the route refuses everything. That is the
 * deliberate choice over running unauthenticated: this endpoint sends email and
 * writes to the database, so an unset variable must fail closed and say so,
 * rather than leaving a public trigger for anybody who guesses the path.
 */
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/modules/shared/env";
import { runDueTasks } from "@/modules/scheduler/runner";

/** Long enough for a full tick; the tasks are individually bounded. */
export const maxDuration = 60;
export const dynamic = "force-dynamic";

function presentedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7);
  // Some schedulers cannot set an Authorization header.
  return request.headers.get("x-cron-secret");
}

function authorised(request: Request): boolean {
  const expected = env.cronSecret;
  if (!expected) return false;

  const presented = presentedSecret(request);
  if (!presented) return false;

  // Constant time, and length-padded first: `timingSafeEqual` throws on a
  // length mismatch, which would itself leak the secret's length.
  const a = Buffer.from(presented.padEnd(128).slice(0, 128));
  const b = Buffer.from(expected.padEnd(128).slice(0, 128));
  return timingSafeEqual(a, b) && presented.length === expected.length;
}

async function handle(request: Request) {
  if (!env.cronSecret) {
    return NextResponse.json(
      {
        error: {
          code: "cron_not_configured",
          message:
            "CRON_SECRET is not set, so scheduled tasks cannot run. Set it on the deployment and on whatever calls this route.",
        },
      },
      { status: 503 },
    );
  }

  if (!authorised(request)) {
    // No detail: a caller who got the secret wrong learns only that they did.
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Not authorised." } },
      { status: 401 },
    );
  }

  const startedAt = Date.now();
  const { released, outcomes } = await runDueTasks({ trigger: "cron" });

  const ran = outcomes.filter((o) => o.status !== "SKIPPED");
  const failed = outcomes.filter((o) => o.status === "FAILED");

  /*
   * 200 even when a task failed, with the failures in the body.
   *
   * A non-2xx here would make the *tick* look broken to the caller — and most
   * cron providers respond to that by retrying, which is exactly wrong when one
   * sweep of eight has a bug: the seven healthy ones would run again. The run
   * history and the admin panel are where a failure is meant to surface, and it
   * is recorded there before this response is built.
   */
  return NextResponse.json({
    data: {
      ok: failed.length === 0,
      durationMs: Date.now() - startedAt,
      staleRunsReleased: released,
      ran: ran.length,
      skipped: outcomes.length - ran.length,
      failed: failed.length,
      outcomes,
    },
  });
}

// GET as well as POST: several cron providers only issue GETs, and the operation
// is idempotent by construction — a task that is not due is skipped.
export const GET = handle;
export const POST = handle;
