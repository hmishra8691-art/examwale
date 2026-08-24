import type { Metadata } from "next";
import { getSession } from "@/modules/auth/session";
import { listPlans } from "@/modules/billing/service";
import { getEntitlements } from "@/modules/billing/entitlements";
import { getPaymentProvider } from "@/modules/billing/provider";
import { getMessages } from "@/modules/i18n/service";
import { formatMoney } from "@/modules/shared/format";
import { CheckoutButton } from "@/components/billing-controls";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Plans",
  description: "What the free plan includes, and what a paid one adds.",
};

const FEATURE_ROWS: { key: string; label: string; format: (value: unknown) => string }[] = [
  {
    key: "aiDailyMessages",
    label: "AI questions per day",
    format: (value) => String(value),
  },
  {
    key: "mentorSessionsPerMonth",
    label: "Mentor sessions per month",
    format: (value) => String(value),
  },
  {
    key: "resumeAnalysesPerMonth",
    label: "Résumé analyses per month",
    format: (value) => String(value),
  },
  {
    key: "advancedFilters",
    label: "Saved searches and comparison",
    format: (value) => (value ? "Yes" : "—"),
  },
  { key: "adFree", label: "No paid placements", format: (value) => (value ? "Yes" : "—") },
  {
    key: "cohortSeats",
    label: "Student seats",
    format: (value) => (Number(value) > 0 ? String(value) : "—"),
  },
  { key: "dataExport", label: "Export your data", format: (value) => (value ? "Yes" : "—") },
];

export default async function PricingPage() {
  const session = await getSession();
  const [t, plans, resolved] = await Promise.all([
    getMessages(),
    listPlans(),
    getEntitlements(session?.sub ?? null),
  ]);

  const canCharge = getPaymentProvider().canCharge;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading
        title="Plans"
        description="The free plan is the whole product with a daily cap on the expensive parts. It is not a trial."
      />

      {!canCharge ? (
        <div className="mt-6">
          <Callout tone="warn" title="Payments aren't switched on here">
            {t.billing.paymentsUnavailable} The plans below are shown so you can see what each one
            includes.
          </Callout>
        </div>
      ) : null}

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((plan) => {
          const isCurrent = resolved.planCode === plan.code;
          const entitlements = plan.entitlements as Record<string, number | boolean>;

          return (
            <Card key={plan.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-medium">{plan.name}</h2>
                {isCurrent ? <Badge tone="brand">Current</Badge> : null}
              </div>

              <p className="mt-3">
                <span className="text-2xl font-semibold tabular-nums">
                  {plan.amount === 0 ? "Free" : formatMoney(plan.amount, plan.currencyCode)}
                </span>
                {plan.amount > 0 ? (
                  <span className="text-sm text-muted">
                    {" "}
                    / {plan.interval === "YEARLY" ? "year" : "month"}
                  </span>
                ) : null}
              </p>

              {plan.description ? (
                <p className="mt-2 text-sm text-muted">{plan.description}</p>
              ) : null}

              <ul className="mt-4 flex-1 space-y-1.5 text-sm">
                {FEATURE_ROWS.map((row) => {
                  const value = entitlements?.[row.key];
                  if (value === undefined) return null;
                  const display = row.format(value);
                  if (display === "—") return null;
                  return (
                    <li key={row.key} className="flex justify-between gap-2">
                      <span className="text-muted">{row.label}</span>
                      <span className="font-medium tabular-nums">{display}</span>
                    </li>
                  );
                })}
              </ul>

              {plan.trialDays > 0 ? (
                <p className="mt-3 text-xs text-faint">{plan.trialDays}-day trial</p>
              ) : null}

              <div className="mt-5">
                {session ? (
                  <CheckoutButton
                    planCode={plan.code}
                    planName={plan.name}
                    amount={plan.amount}
                    canCharge={canCharge}
                    current={isCurrent}
                  />
                ) : (
                  <a
                    href={`/login?next=/pricing`}
                    className="inline-flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Sign in to choose
                  </a>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-10 max-w-2xl space-y-4">
        <Callout tone="info" title="What paying does and doesn't change">
          <p>
            Paying raises limits. It does not change what we tell you. The reality-check engine
            gives a premium subscriber the same verdict it gives everyone else, career data is
            identical on every plan, and no plan buys a better ranking for an employer or a
            coaching centre.
          </p>
          <p className="mt-2">
            The one thing a paid plan removes is paid placements — which exist on the free plan,
            are always labelled, and never affect what we say about anything.
          </p>
        </Callout>
      </div>
    </div>
  );
}
