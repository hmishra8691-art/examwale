import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiUsageLogs } from "@/db/schema";
import { env } from "@/modules/shared/env";
import { RateLimitError } from "@/modules/shared/errors";
import { getEntitlements } from "@/modules/billing/entitlements";
import type { AiMode } from "@/modules/ai/types";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Env-based fallback, kept for callers with no user (and for the seed).
 *
 * Phase 2 note: this is no longer the authority. The plan claim in a session
 * token records what the account was on when the token was issued, which is
 * wrong the moment a subscription lapses or is upgraded mid-session — so the
 * functions below resolve the real allowance from the subscription instead,
 * and this only serves the anonymous case.
 */
export function dailyLimitFor(plan: "FREE" | "PREMIUM" | "B2B"): number {
  return plan === "FREE" ? env.aiFreeDailyLimit : env.aiPremiumDailyLimit;
}

export async function usageToday(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsageLogs)
    .where(and(eq(aiUsageLogs.userId, userId), gte(aiUsageLogs.createdAt, startOfToday())));
  return row?.count ?? 0;
}

export type UsageSnapshot = { used: number; limit: number; remaining: number };

/**
 * The `plan` argument is now advisory only.
 *
 * It stays in the signature because a dozen call sites pass `session.plan`,
 * and it is used when the entitlement lookup finds nothing. The number that
 * actually governs comes from the live subscription.
 */
export async function getUsageSnapshot(
  userId: string,
  plan: "FREE" | "PREMIUM" | "B2B" = "FREE",
): Promise<UsageSnapshot> {
  const [resolved, used] = await Promise.all([getEntitlements(userId), usageToday(userId)]);
  const limit = resolved.entitlements.aiDailyMessages || dailyLimitFor(plan);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/**
 * Checked before the provider is called — the freemium boundary must not cost
 * a token to enforce.
 */
export async function assertWithinQuota(
  userId: string,
  plan: "FREE" | "PREMIUM" | "B2B" = "FREE",
): Promise<UsageSnapshot> {
  const resolved = await getEntitlements(userId);
  const used = await usageToday(userId);
  const limit = resolved.entitlements.aiDailyMessages || dailyLimitFor(plan);
  const snapshot: UsageSnapshot = { used, limit, remaining: Math.max(0, limit - used) };

  if (snapshot.remaining <= 0) {
    const onFreePlan = resolved.planCode === "free" || resolved.status === "NONE";
    throw new RateLimitError(
      onFreePlan
        ? `You've used your ${snapshot.limit} free AI questions for today. They reset tomorrow, or a paid plan raises the limit.`
        : `You've reached today's limit of ${snapshot.limit} AI questions. It resets tomorrow.`,
      3600,
    );
  }
  return snapshot;
}

export async function logUsage(input: {
  userId?: string | null;
  mode: AiMode;
  provider: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
}): Promise<void> {
  // Rough Anthropic-tier pricing for cost visibility in the admin dashboard.
  // Not billing-grade; it exists so nobody discovers the spend from an invoice.
  const inputCost = ((input.inputTokens ?? 0) / 1_000_000) * 3;
  const outputCost = ((input.outputTokens ?? 0) / 1_000_000) * 15;

  try {
    await db.insert(aiUsageLogs).values({
      userId: input.userId ?? null,
      mode: input.mode,
      provider: input.provider,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      latencyMs: input.latencyMs ?? 0,
      costEstimate: Number((inputCost + outputCost).toFixed(6)),
    });
  } catch (error) {
    console.error("[ai] usage log failed", error);
  }
}
