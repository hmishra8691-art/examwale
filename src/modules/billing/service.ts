/**
 * Subscription lifecycle.
 *
 * Two rules shape everything here:
 *
 *  1. Money operations are idempotent. `payments.idempotencyKey` is uniquely
 *     indexed, so a retried webhook or a double-clicked button inserts once
 *     and the second attempt reads back the first result instead of charging
 *     or crediting again.
 *  2. Access is never granted by a status string alone. A subscription grants
 *     access because its paid period has not ended — see
 *     `modules/billing/entitlements.ts`.
 */
import { and, desc, eq, lt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { payments, plans, subscriptions, users } from "@/db/schema";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";
import { getPaymentProvider } from "@/modules/billing/provider";
import { getEntitlements } from "@/modules/billing/entitlements";
import { notify } from "@/modules/notifications/service";

export type PlanRow = typeof plans.$inferSelect;

export async function listPlans(): Promise<PlanRow[]> {
  return db.select().from(plans).where(eq(plans.isActive, true)).orderBy(plans.sequence);
}

export async function getPlanByCode(code: string): Promise<PlanRow> {
  const [plan] = await db.select().from(plans).where(eq(plans.code, code)).limit(1);
  if (!plan) throw new NotFoundError("That plan doesn't exist.");
  if (!plan.isActive) throw new ValidationError("That plan is no longer available.");
  return plan;
}

export async function getActiveSubscription(userId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), ne(subscriptions.status, "EXPIRED")))
    .orderBy(desc(subscriptions.currentPeriodEnd))
    .limit(1);
  return row ?? null;
}

function addInterval(from: Date, interval: "MONTHLY" | "YEARLY"): Date {
  const next = new Date(from);
  if (interval === "YEARLY") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);
  return next;
}

/**
 * Starts checkout for a plan.
 *
 * Returns either a redirect for a real gateway, or a settled subscription when
 * the manual provider is in play. The caller does not need to know which.
 */
export async function startCheckout(input: {
  userId: string;
  planCode: string;
  idempotencyKey: string;
}) {
  const plan = await getPlanByCode(input.planCode);

  const existing = await getActiveSubscription(input.userId);
  if (existing && existing.planId === plan.id && existing.currentPeriodEnd > new Date()) {
    throw new ConflictError("You're already on that plan.");
  }

  // Replay of a completed purchase: hand back what happened the first time.
  const [priorPayment] = await db
    .select()
    .from(payments)
    .where(eq(payments.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (priorPayment) {
    return {
      replayed: true as const,
      paymentId: priorPayment.id,
      status: priorPayment.status,
      redirectUrl: null,
      subscription: await getActiveSubscription(input.userId),
    };
  }

  const provider = getPaymentProvider();

  if (plan.amount > 0 && !provider.canCharge) {
    throw new AppError(
      "Card payment isn't switched on for this deployment yet, so paid plans can't be bought here.",
      503,
      "payments_unavailable",
    );
  }

  const checkout = await provider.createCheckout({
    reference: input.idempotencyKey,
    amount: plan.amount,
    currencyCode: plan.currencyCode,
    description: `${plan.name} subscription`,
    userId: input.userId,
    planCode: plan.code,
  });

  const [payment] = await db
    .insert(payments)
    .values({
      userId: input.userId,
      amount: plan.amount,
      currencyCode: plan.currencyCode,
      status: checkout.settled ? "SUCCEEDED" : "PENDING",
      provider: checkout.provider,
      providerRef: checkout.providerRef,
      description: `${plan.name} subscription`,
      idempotencyKey: input.idempotencyKey,
    })
    .returning();

  if (!checkout.settled) {
    return {
      replayed: false as const,
      paymentId: payment.id,
      status: "PENDING" as const,
      redirectUrl: checkout.redirectUrl,
      subscription: null,
    };
  }

  const subscription = await activateSubscription({
    userId: input.userId,
    plan,
    provider: checkout.provider,
    providerRef: checkout.providerRef,
    paymentId: payment.id,
  });

  return {
    replayed: false as const,
    paymentId: payment.id,
    status: "SUCCEEDED" as const,
    redirectUrl: null,
    subscription,
  };
}

/**
 * Creates or extends the subscription and syncs the denormalised `users.plan`.
 *
 * The column is a convenience for listings and badges; `getEntitlements` is
 * the authority. Keeping them in the same function is what stops them drifting.
 */
export async function activateSubscription(input: {
  userId: string;
  plan: PlanRow;
  provider: string;
  providerRef: string | null;
  paymentId?: string;
}) {
  const now = new Date();
  const existing = await getActiveSubscription(input.userId);

  // Extend from the later of "now" and the end of what they already paid for,
  // so upgrading mid-period never silently discards remaining days.
  const start = existing && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
  const periodEnd = addInterval(start, input.plan.interval);

  /**
   * One atomic upsert keyed on the user, not a read followed by a branch.
   *
   * `getActiveSubscription` above excludes EXPIRED rows, so someone whose
   * subscription lapsed and who then resubscribes reads back as having no
   * subscription at all — the old code took the insert branch and, now that
   * `subscription_user_uq` exists, would collide on a returning customer. It is
   * also the obvious race: two checkout requests arriving together both see no
   * row and both insert.
   *
   * Conflicting on `userId` fixes both. The row is current state; the payment
   * history lives in `payments`, which is where it belongs.
   */
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      userId: input.userId,
      planId: input.plan.id,
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      provider: input.provider,
      providerRef: input.providerRef,
    })
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: {
        planId: input.plan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
        provider: input.provider,
        providerRef: input.providerRef,
        updatedAt: now,
      },
    })
    .returning();

  if (input.paymentId) {
    await db
      .update(payments)
      .set({ subscriptionId: subscription.id, status: "SUCCEEDED" })
      .where(eq(payments.id, input.paymentId));
  }

  await db.update(users).set({ plan: input.plan.plan }).where(eq(users.id, input.userId));

  await recordAudit({
    actorType: "user",
    actorId: input.userId,
    action: "subscription.activated",
    entityType: "subscription",
    entityId: subscription.id,
    after: { planCode: input.plan.code, periodEnd },
  });

  await notify({
    userId: input.userId,
    type: "billing.activated",
    title: `${input.plan.name} is active`,
    body: `Your plan runs until ${periodEnd.toLocaleDateString("en-IN", { dateStyle: "medium" })}.`,
    href: "/dashboard/billing",
    dedupeKey: `billing.activated:${subscription.id}:${periodEnd.toISOString()}`,
  });

  return subscription;
}

/**
 * Cancels at period end rather than immediately.
 *
 * Someone who paid for a month keeps the month. Cutting access at the moment
 * of cancellation would be taking money for time not given.
 */
export async function cancelSubscription(userId: string, reason?: string) {
  const existing = await getActiveSubscription(userId);
  if (!existing) throw new NotFoundError("You don't have a subscription to cancel.");
  if (existing.cancelAtPeriodEnd) return existing;

  const [updated] = await db
    .update(subscriptions)
    .set({
      status: "CANCELLED",
      cancelAtPeriodEnd: true,
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "subscription.cancelled",
    entityType: "subscription",
    entityId: existing.id,
    after: { reason, accessUntil: existing.currentPeriodEnd },
  });

  await notify({
    userId,
    type: "billing.cancelled",
    title: "Subscription cancelled",
    body: `You'll keep full access until ${existing.currentPeriodEnd.toLocaleDateString("en-IN", { dateStyle: "medium" })}.`,
    href: "/dashboard/billing",
    dedupeKey: `billing.cancelled:${existing.id}`,
  });

  return updated;
}

/** Undoes a pending cancellation while the period is still running. */
export async function resumeSubscription(userId: string) {
  const existing = await getActiveSubscription(userId);
  if (!existing) throw new NotFoundError("You don't have a subscription.");
  if (!existing.cancelAtPeriodEnd) return existing;
  if (existing.currentPeriodEnd <= new Date()) {
    throw new ValidationError("That subscription has already ended — start a new one instead.");
  }

  const [updated] = await db
    .update(subscriptions)
    .set({ status: "ACTIVE", cancelAtPeriodEnd: false, cancelledAt: null, updatedAt: new Date() })
    .where(eq(subscriptions.id, existing.id))
    .returning();

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "subscription.resumed",
    entityType: "subscription",
    entityId: existing.id,
  });

  return updated;
}

export async function listPayments(userId: string, limit = 50) {
  return db
    .select()
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(Math.min(200, Math.max(1, limit)));
}

export async function getBillingOverview(userId: string) {
  const [resolved, subscription, history, available] = await Promise.all([
    getEntitlements(userId),
    getActiveSubscription(userId),
    listPayments(userId, 20),
    listPlans(),
  ]);

  const plan = subscription
    ? ((await db.select().from(plans).where(eq(plans.id, subscription.planId)).limit(1))[0] ?? null)
    : null;

  return {
    ...resolved,
    subscription,
    plan,
    history,
    available,
    canCharge: getPaymentProvider().canCharge,
  };
}

/**
 * Marks lapsed subscriptions EXPIRED and drops the user's plan column back.
 *
 * Access has already ended by this point — entitlements key off the period end,
 * not this status — so this is bookkeeping, safe to run late or twice.
 */
export async function expireLapsedSubscriptions(): Promise<number> {
  const now = new Date();
  const lapsed = await db
    .select({ id: subscriptions.id, userId: subscriptions.userId })
    .from(subscriptions)
    .where(and(lt(subscriptions.currentPeriodEnd, now), ne(subscriptions.status, "EXPIRED")))
    .limit(500);

  for (const row of lapsed) {
    await db
      .update(subscriptions)
      .set({ status: "EXPIRED", updatedAt: now })
      .where(eq(subscriptions.id, row.id));
    await db.update(users).set({ plan: "FREE" }).where(eq(users.id, row.userId));
  }

  return lapsed.length;
}
