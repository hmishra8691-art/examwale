"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, Callout } from "@/components/ui";

/**
 * Checkout button.
 *
 * The idempotency key is generated once per mount, not per click. That is the
 * whole trick: a double-click, or an impatient second press after a slow
 * response, sends the same key and the server replays the first result instead
 * of creating a second payment.
 */
export function CheckoutButton({
  planCode,
  planName,
  amount,
  canCharge,
  current,
}: {
  planCode: string;
  planName: string;
  amount: number;
  canCharge: boolean;
  current: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const idempotencyKey = useMemo(
    () => `${planCode}-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    [planCode],
  );

  if (current) {
    return (
      <Button variant="secondary" disabled full>
        Your current plan
      </Button>
    );
  }

  if (amount > 0 && !canCharge) {
    return (
      <div className="space-y-2">
        <Button variant="secondary" disabled full>
          Not available yet
        </Button>
        <p className="text-xs text-faint">
          Card payment isn&rsquo;t switched on for this deployment.
        </p>
      </div>
    );
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode, idempotencyKey }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Checkout failed.");

      if (payload?.data?.redirectUrl) {
        window.location.href = payload.data.redirectUrl;
        return;
      }
      router.push("/dashboard/billing");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <Button onClick={start} disabled={busy} full>
        {busy ? "Working…" : amount === 0 ? `Switch to ${planName}` : `Choose ${planName}`}
      </Button>
    </div>
  );
}

export function SubscriptionControls({
  cancelAtPeriodEnd,
  periodEnd,
}: {
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function act(action: "cancel" | "resume") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/billing/subscription", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "That didn't work.");
      }
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      {cancelAtPeriodEnd ? (
        <>
          <Callout tone="warn" title="Cancellation scheduled">
            You keep everything until {periodEnd ?? "the end of the period"}. Nothing more will be
            charged.
          </Callout>
          <Button size="sm" onClick={() => act("resume")} disabled={busy}>
            {busy ? "Working…" : "Resume plan"}
          </Button>
        </>
      ) : confirming ? (
        <div className="space-y-2">
          <p className="text-sm">
            You&rsquo;ll keep full access until {periodEnd ?? "the period ends"} — cancelling
            doesn&rsquo;t cut you off today.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" onClick={() => act("cancel")} disabled={busy}>
              Confirm cancellation
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep plan
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Cancel plan
        </Button>
      )}
    </div>
  );
}
