import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { RateLimitError } from "@/modules/shared/errors";

/**
 * Fixed-window rate limiter, shared across instances.
 *
 * Two layers, in this order:
 *
 *  1. A Postgres counter. Authoritative, because it is the only layer that sees
 *     every instance's traffic — and the only one an operator can inspect or
 *     reset.
 *  2. An in-process map, used only when the database is unreachable, so an
 *     outage degrades the limit rather than removing it.
 *
 * This replaces a limiter that was only layer 1. Its own comment said to swap in
 * a shared implementation "before running more than one app instance", and then
 * the app was deployed to a serverless host, where every cold start gets an
 * empty map and concurrent invocations share nothing. Thirty-odd routes were
 * relying on limits that had quietly become per-instance-per-lifetime, which on
 * a platform that scales to zero between requests is close to no limit at all.
 *
 * On a database error the Postgres layer is skipped rather than raised. A
 * limiter that takes the site down when its bookkeeping is unavailable has
 * turned a defence into an outage; degrading to per-instance limiting is worse
 * than the intended behaviour but much better than either extreme.
 *
 * The window is fixed rather than sliding, so a caller can send up to 2×limit
 * across a boundary. That is a known property of the cheap algorithm and it is
 * fine for what these limits are for — abuse and runaway loops, not metering.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
function sweepLocal(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function rateLimitError(resetAtMs: number): RateLimitError {
  const retryAfter = Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000));
  return new RateLimitError(
    `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
    retryAfter,
  );
}

/**
 * The fallback layer. Reached only when Postgres could not be consulted, so it
 * limits per instance rather than per platform.
 */
function consumeLocal(key: string, limit: number, windowSeconds: number): Bucket {
  const now = Date.now();
  sweepLocal(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const fresh = { count: 1, resetAt: now + windowSeconds * 1000 };
    buckets.set(key, fresh);
    return fresh;
  }

  existing.count += 1;
  return existing;
}

/**
 * The authoritative layer. One statement, so the read-modify-write cannot
 * interleave — two concurrent requests for the same key are serialised by the
 * row lock rather than racing between a SELECT and an UPDATE.
 *
 * The CASE arms handle an expired window in the same round trip as an increment:
 * a bucket whose `reset_at` has passed is reset to 1 rather than continuing to
 * accumulate, which is what makes this a window rather than a lifetime total.
 *
 * A rejected request still increments. Someone hammering a limit keeps their
 * counter above it for the rest of the window instead of getting one free
 * request per expiry tick. It also means the cost of a flood is one indexed
 * upsert per request, which is the price of a limit that actually holds across
 * instances.
 */
async function consumeShared(
  key: string,
  windowSeconds: number,
): Promise<{ count: number; resetAt: number } | null> {
  try {
    const result = await db.execute<{ count: number; reset_at: Date }>(sql`
      INSERT INTO rate_limit_buckets (key, count, reset_at)
      VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
      ON CONFLICT (key) DO UPDATE SET
        count = CASE
          WHEN rate_limit_buckets.reset_at <= now() THEN 1
          ELSE rate_limit_buckets.count + 1
        END,
        reset_at = CASE
          WHEN rate_limit_buckets.reset_at <= now()
            THEN now() + make_interval(secs => ${windowSeconds})
          ELSE rate_limit_buckets.reset_at
        END
      RETURNING count, reset_at
    `);

    const row = result.rows?.[0];
    if (!row) return null;
    return { count: Number(row.count), resetAt: new Date(row.reset_at).getTime() };
  } catch {
    // Bookkeeping unavailable. Returning null hands the decision to the
    // in-process fallback rather than failing the request; see the note above.
    return null;
  }
}

export async function consume(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  // Shared layer first, and it decides. An earlier version checked the local
  // map first and returned on its verdict, which quietly made the in-process
  // count authoritative: a long-lived process accumulated state that no
  // operator could see or clear, and the shared counter fell behind because a
  // locally-rejected request never reached it. Postgres being the single source
  // of truth is the property that makes the limit mean the same thing to every
  // instance — and makes it resettable.
  const shared = await consumeShared(key, windowSeconds);
  if (shared) {
    if (shared.count > limit) throw rateLimitError(shared.resetAt);
    return;
  }

  // Only here when the shared counter is unreachable. Per-instance limiting is
  // a poor substitute, but it is a great deal better than none.
  const local = consumeLocal(key, limit, windowSeconds);
  if (local.count > limit) throw rateLimitError(local.resetAt);
}

/**
 * Rate-limits a request when the client's IP may not be knowable.
 *
 * With no trusted proxy configured, `clientIp` returns undefined — and keying
 * every caller to one bucket would mean a strict per-IP limit silently becomes
 * a strict *global* limit, blocking legitimate users the moment a handful of
 * requests arrive. So:
 *
 *  - IP known  → the tight per-IP limit, which is what we actually want.
 *  - IP unknown → a deliberately loose global ceiling that still stops a
 *    runaway loop, plus whatever per-subject limit the caller adds (per email
 *    for signup, per account for login), which is the meaningful one anyway.
 */
export async function consumeByClient(
  name: string,
  ip: string | undefined,
  limits: { perIp: number; globalFallback: number },
  windowSeconds: number,
): Promise<void> {
  if (ip) {
    await consume(`${name}:ip:${ip}`, limits.perIp, windowSeconds);
    return;
  }
  await consume(`${name}:global`, limits.globalFallback, windowSeconds);
}

/**
 * Drop expired buckets. Called by the scheduled-task runner.
 *
 * Nothing depends on this for correctness — an expired row is reset on its next
 * use — but without it the table grows one row per distinct key forever.
 */
export async function purgeExpiredBuckets(): Promise<number> {
  const result = await db.execute(
    sql`DELETE FROM rate_limit_buckets WHERE reset_at <= now() - interval '1 hour'`,
  );
  return result.rowCount ?? 0;
}

/** Test seam: current local state for a key, without consuming. */
export function peekLocal(key: string): Bucket | undefined {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return undefined;
  return { ...bucket };
}
