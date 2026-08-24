"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";

/**
 * Approve / reject controls.
 *
 * A rejection requires a reason and the reason is sent to the employer, so the
 * field is required here rather than optional-with-a-default. "Rejected" with
 * no explanation produces a resubmission of the same posting.
 */
export function ModerationDecision({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function decide(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/job-moderation/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error?.message ?? "That didn't work.");
      }
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

      {rejecting ? (
        <div className="space-y-2">
          <label htmlFor={`reason-${jobId}`} className="text-sm font-medium">
            Why is this being rejected? The employer sees this.
          </label>
          <textarea
            id={`reason-${jobId}`}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={busy || reason.trim().length < 5}
              onClick={() => decide({ decision: "reject", reason: reason.trim() })}
            >
              Confirm rejection
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRejecting(false)} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => decide({ decision: "approve" })}>
            {busy ? "Working…" : "Approve and publish"}
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

/** Organisation verification control, used from the admin overview. */
export function OrganisationVerificationControl({
  organisationId,
  status,
}: {
  organisationId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(status);

  async function set(next: "VERIFIED" | "REJECTED" | "PENDING") {
    setBusy(true);
    try {
      await fetch(`/api/v1/admin/organisations/${organisationId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      setCurrent(next);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <select
      value={current}
      disabled={busy}
      onChange={(event) => set(event.target.value as "VERIFIED" | "REJECTED" | "PENDING")}
      className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-xs"
      aria-label="Organisation verification status"
    >
      <option value="UNVERIFIED">Unverified</option>
      <option value="PENDING">Pending</option>
      <option value="VERIFIED">Verified</option>
      <option value="REJECTED">Rejected</option>
    </select>
  );
}
