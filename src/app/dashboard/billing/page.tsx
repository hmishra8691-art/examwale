import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { getBillingOverview } from "@/modules/billing/service";
import { getMessages } from "@/modules/i18n/service";
import { formatDate, formatMoney } from "@/modules/shared/format";
import { SubscriptionControls } from "@/components/billing-controls";
import { Badge, ButtonLink, Callout, Card, EmptyState, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Billing" };

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  ACTIVE: "good",
  TRIALING: "good",
  PAST_DUE: "warn",
  CANCELLED: "warn",
  EXPIRED: "bad",
  NONE: "neutral",
};

export default async function BillingPage() {
  const session = await requirePage("/dashboard/billing");
  const [t, overview] = await Promise.all([getMessages(), getBillingOverview(session.sub)]);

  const { entitlements, planName, status, currentPeriodEnd, cancelAtPeriodEnd, history, subscription } =
    overview;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading title={t.billing.title} />
        <ButtonLink href="/pricing" variant="secondary">
          Compare plans
        </ButtonLink>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label={t.billing.currentPlan} value={planName} />
        <Stat
          label="Status"
          value={status === "NONE" ? "No subscription" : status.toLowerCase().replace("_", " ")}
          tone={STATUS_TONE[status] === "bad" ? "bad" : STATUS_TONE[status] === "warn" ? "warn" : undefined}
        />
        <Stat
          label={cancelAtPeriodEnd ? t.billing.accessUntil : t.billing.renewsOn}
          value={currentPeriodEnd ? formatDate(currentPeriodEnd) : "—"}
        />
      </div>

      {!overview.canCharge ? (
        <div className="mt-6">
          <Callout tone="info">{t.billing.paymentsUnavailable}</Callout>
        </div>
      ) : null}

      <section className="mt-10">
        <SectionHeading title="What your plan includes" />
        <Card className="mt-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Mentor sessions per month</dt>
              <dd className="font-medium tabular-nums">{entitlements.mentorSessionsPerMonth}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Résumé reports per month</dt>
              <dd className="font-medium tabular-nums">{entitlements.resumeAnalysesPerMonth}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Saved searches</dt>
              <dd className="font-medium">{entitlements.advancedFilters ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Paid placements hidden</dt>
              <dd className="font-medium">{entitlements.adFree ? "Yes" : "No"}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted">Data export</dt>
              <dd className="font-medium">{entitlements.dataExport ? "Yes" : "No"}</dd>
            </div>
          </dl>
        </Card>
      </section>

      {subscription ? (
        <section className="mt-8">
          <SectionHeading title="Manage" />
          <Card className="mt-4">
            <SubscriptionControls
              cancelAtPeriodEnd={cancelAtPeriodEnd}
              periodEnd={currentPeriodEnd ? formatDate(currentPeriodEnd) : null}
            />
          </Card>
        </section>
      ) : (
        <section className="mt-8">
          <Callout tone="info" title="You're on the free plan">
            That is a complete product, not a trial.{" "}
            <Link href="/pricing" className="underline">
              See what a paid plan adds
            </Link>{" "}
            if you hit the daily caps.
          </Callout>
        </section>
      )}

      <section className="mt-10">
        <SectionHeading title={t.billing.history} />
        {history.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted">
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium">Description</th>
                  <th className="pb-2 pr-4 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((payment) => (
                  <tr key={payment.id} className="border-b border-[var(--border)]">
                    <td className="py-3 pr-4">{formatDate(payment.createdAt)}</td>
                    <td className="py-3 pr-4">{payment.description ?? "—"}</td>
                    <td className="py-3 pr-4 tabular-nums">
                      {formatMoney(payment.amount, payment.currencyCode)}
                    </td>
                    <td className="py-3">
                      <Badge
                        tone={
                          payment.status === "SUCCEEDED"
                            ? "good"
                            : payment.status === "FAILED"
                              ? "bad"
                              : "neutral"
                        }
                      >
                        {payment.status.toLowerCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState title="Nothing yet" description="No payments have been recorded." />
          </div>
        )}
      </section>
    </div>
  );
}
