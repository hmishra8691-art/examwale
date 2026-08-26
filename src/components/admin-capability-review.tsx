"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";

/**
 * Approve, refuse or suspend one capability application.
 *
 * The note field is required for anything except approval, enforced on the
 * server as well. A refusal with no reason is the commonest complaint about
 * marketplace moderation and it is entirely avoidable — the applicant cannot
 * fix what they were not told.
 */
export function CapabilityReview({ capabilityId }: { capabilityId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "ACTIVE" | "REJECTED" | "SUSPENDED") {
    if (status !== "ACTIVE" && !note.trim()) {
      setError("Say why — the applicant cannot fix what they were not told.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/providers/capabilities/${capabilityId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim() || null }),
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
        value={note}
        onChange={(event) => setNote(event.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Reason — required unless approving. The applicant sees this."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide("ACTIVE")} disabled={busy}>
          Approve
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => decide("REJECTED")}
          disabled={busy}
        >
          Refuse
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => decide("SUSPENDED")}
          disabled={busy}
        >
          Suspend
        </Button>
      </div>
    </div>
  );
}
