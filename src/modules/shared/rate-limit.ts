import { RateLimitError } from "@/modules/shared/errors";

/**
 * In-process fixed-window limiter.
 *
 * Deliberately simple: it protects a single node against bursts and abuse in
 * development and small deployments. Swap `consume` for a Redis INCR+EXPIRE
 * implementation before running more than one app instance — the call sites
 * don't change.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function consume(key: string, limit: number, windowSeconds: number): void {
  const now = Date.now();
  sweep(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return;
  }

  if (existing.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    throw new RateLimitError(
      `Too many attempts. Try again in ${retryAfter} second${retryAfter === 1 ? "" : "s"}.`,
      retryAfter,
    );
  }

  existing.count += 1;
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
export function consumeByClient(
  name: string,
  ip: string | undefined,
  limits: { perIp: number; globalFallback: number },
  windowSeconds: number,
): void {
  if (ip) {
    consume(`${name}:ip:${ip}`, limits.perIp, windowSeconds);
    return;
  }
  consume(`${name}:global`, limits.globalFallback, windowSeconds);
}

export function peek(key: string): { count: number; resetAt: number } | undefined {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= Date.now()) return undefined;
  return { ...bucket };
}
