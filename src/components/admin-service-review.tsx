"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";

/** Approve, request changes, refuse or suspend one service listing. */
export function ServiceReview({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: string) {
    if (decision !== "approve" && decision !== "start_review" && reason.trim().length < 5) {
      setError("Say why. The provider sees this, and cannot fix what they were not told.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/services/${serviceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reason.trim() || undefined }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <textarea
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Reason — required for anything but approval. The provider sees this."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => decide("approve")} disabled={busy}>
          Approve
        </Button>
        <Button size="sm" variant="secondary" onClick={() => decide("request_changes")} disabled={busy}>
          Ask for changes
        </Button>
        <Button size="sm" variant="secondary" onClick={() => decide("reject")} disabled={busy}>
          Refuse
        </Button>
        <Button size="sm" variant="ghost" onClick={() => decide("start_review")} disabled={busy}>
          Mark as mine
        </Button>
      </div>
    </div>
  );
}
