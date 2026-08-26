"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Message them" from wherever the relationship lives.
 *
 * Opens the thread for *this* session or application rather than a generic one,
 * so a mentor who is also hiring the same person keeps two separate histories
 * with the right context on each.
 */
export function MessageLink({
  withUserId,
  contextType,
  contextId,
  label = "Message",
  className,
}: {
  withUserId: string;
  contextType: "MENTORSHIP" | "JOB_APPLICATION" | "COURSE_ENQUIRY";
  contextId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ withUserId, contextType, contextId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't open that.");
      router.push(`/messages/${payload.data.id}`);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={
          className ??
          "text-sm font-medium text-brand-600 hover:underline disabled:opacity-60 dark:text-brand-300"
        }
      >
        {busy ? "Opening…" : label}
      </button>
      {error ? <span className="mt-1 text-xs text-red-700 dark:text-red-300">{error}</span> : null}
    </span>
  );
}
