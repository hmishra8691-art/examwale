/**
 * What a plan actually buys.
 *
 * Entitlements are resolved from the subscription's *plan row*, not from the
 * `users.plan` column, because the column records what someone signed up for
 * and the row records what they are currently paying for. When a subscription
 * lapses the column is stale for as long as it takes a job to notice; the
 * resolver below is never stale, because it re-reads the period end.
 *
 * Every gate in the product calls `getEntitlements`. Nothing branches on a
 * plan name directly — that is how a "PREMIUM" string check ends up in six
 * places and disagrees with itself in two of them.
 */
import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { plans, subscriptions } from "@/db/schema";

export type Entitlements = {
  /** Mentorship bookings a seeker may hold per calendar month. */
  mentorSessionsPerMonth: number;
  /**
   * Résumé reports per calendar month.
   *
   * A cap on a rule-based report is not a compute cost any more — it is a
   * throttle on a free tier, and it is honest to keep it modest rather than
   * pretend the limit is technical.
   */
  resumeAnalysesPerMonth: number;
  /** Saved-search and comparison tools. */
  advancedFilters: boolean;
  /** Suppresses paid placements site-wide. */
  adFree: boolean;
  /** Institution seats — B2B only. */
  cohortSeats: number;
  /** CSV/JSON export of the account's own data and, for B2B, cohort reports. */
  dataExport: boolean;
};

export const PLAN_CODES = {
  free: "free",
  premiumMonthly: "premium-monthly",
  premiumYearly: "premium-yearly",
  b2bInstitution: "b2b-institution",
} as const;

/**
 * The floor. Used when someone has no subscription at all, and as the shape
 * every plan row is merged onto — so a plan row that forgets a key degrades to
 * the free allowance rather than to `undefined`, which would read as
 * "unlimited" at most call sites.
 */
export function freeEntitlements(): Entitlements {
  return {
    mentorSessionsPerMonth: 1,
    resumeAnalysesPerMonth: 2,
    advancedFilters: false,
    adFree: false,
    cohortSeats: 0,
    dataExport: false,
  };
}

export function premiumEntitlements(): Entitlements {
  return {
    mentorSessionsPerMonth: 8,
    resumeAnalysesPerMonth: 20,
    advancedFilters: true,
    adFree: true,
    cohortSeats: 0,
    dataExport: true,
  };
}

export function b2bEntitlements(): Entitlements {
  return {
    ...premiumEntitlements(),
    cohortSeats: 250,
  };
}

/** Merges a plan row's stored entitlements onto the free floor. */
export function mergeEntitlements(
  base: Entitlements,
  stored: Record<string, number | boolean> | null | undefined,
): Entitlements {
  if (!stored) return base;
  const out: Entitlements = { ...base };
  for (const key of Object.keys(base) as (keyof Entitlements)[]) {
    const value = stored[key];
    if (typeof value === typeof base[key]) {
      (out as Record<string, number | boolean>)[key] = value;
    }
  }
  return out;
}

export type ResolvedEntitlements = {
  entitlements: Entitlements;
  planCode: string;
  planName: string;
  status: "NONE" | "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED";
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * Resolves what this user may currently do.
 *
 * The `gt(currentPeriodEnd, now)` clause is the whole point: a CANCELLED
 * subscription still entitles its holder until the period they paid for runs
 * out, and an ACTIVE row whose period has quietly elapsed entitles nobody.
 * Both cases fall out of the query rather than needing a nightly job to be
 * correct.
 */
export async function getEntitlements(userId: string | null | undefined): Promise<ResolvedEntitlements> {
  const fallback: ResolvedEntitlements = {
    entitlements: freeEntitlements(),
    planCode: PLAN_CODES.free,
    planName: "Free",
    status: "NONE",
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  };
  if (!userId) return fallback;

  const [row] = await db
    .select({
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      planCode: plans.code,
      planName: plans.name,
      planKind: plans.plan,
      stored: plans.entitlements,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.planId, plans.id))
    .where(
      and(
        eq(subscriptions.userId, userId),
        gt(subscriptions.currentPeriodEnd, new Date()),
        // PAST_DUE keeps access during the dunning window; EXPIRED never does.
        // A cancelled-but-unexpired subscription is included on purpose.
        ne(subscriptions.status, "EXPIRED"),
      ),
    )
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);

  if (!row) return fallback;
  if (row.status === "EXPIRED") return fallback;

  const base =
    row.planKind === "B2B"
      ? b2bEntitlements()
      : row.planKind === "PREMIUM"
        ? premiumEntitlements()
        : freeEntitlements();

  return {
    entitlements: mergeEntitlements(base, row.stored),
    planCode: row.planCode,
    planName: row.planName,
    status: row.status,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}

/** Convenience for the many call sites that only need one number or flag. */
export async function entitlementFor<K extends keyof Entitlements>(
  userId: string | null | undefined,
  key: K,
): Promise<Entitlements[K]> {
  const { entitlements } = await getEntitlements(userId);
  return entitlements[key];
}
