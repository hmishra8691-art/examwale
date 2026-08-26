"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";

/**
 * Submit a capability application.
 *
 * `reapplying` exists because a refusal is usually "not with this evidence"
 * rather than "never" — the button should say so, instead of silently behaving
 * the same as a first application.
 */
export function CapabilityApplyButton({
  kind,
  reapplying,
}: {
  kind: string;
  reapplying?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/providers/me/capabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
      router.push("/provider");
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
      {reapplying ? (
        <p className="text-[13.5px] text-muted">
          This was refused before. Applying again reopens it — worth updating your profile first if
          the reason was something you can address.
        </p>
      ) : null}
      <Button type="button" onClick={apply} disabled={busy}>
        {busy ? "Sending…" : reapplying ? "Apply again" : "Apply"}
      </Button>
    </div>
  );
}
