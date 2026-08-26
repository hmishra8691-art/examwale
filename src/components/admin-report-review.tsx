"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";

/**
 * Decide one report.
 *
 * The note is required for both outcomes, not only for upholding. A dismissal
 * nobody recorded a reason for is indistinguishable from a report nobody read,
 * and the reporter is told the outcome either way.
 */
export function ReportReview({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [lock, setLock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(status: "UPHELD" | "DISMISSED") {
    if (note.trim().length < 5) {
      setError("Record why. A decision nobody can review is not moderation.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, note: note.trim(), lockConversation: lock }),
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
        maxLength={2000}
        placeholder="What you decided and why. Recorded against your account."
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
      />
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
        Close the conversation as well — neither party can send anything further.
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => decide("UPHELD")} disabled={busy}>
          Uphold
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => decide("DISMISSED")}
          disabled={busy}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}
