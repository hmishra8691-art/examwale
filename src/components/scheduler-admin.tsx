"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

/**
 * "Run now" for one scheduled task.
 *
 * Bypasses the due check, which is the only way to exercise a task on demand
 * without editing its interval — and the fastest way to find out whether the
 * plumbing works at all on a fresh deployment.
 *
 * Reports the outcome inline rather than only refreshing the page, because the
 * useful answer is usually "0 rows, nothing was due" and a silent refresh looks
 * identical to a button that does nothing.
 */
export function RunTaskButton({ task }: { task: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(`/api/v1/admin/scheduler/${task}/run`, { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "That didn't work.");
      }
      const outcome = payload?.data;
      setResult({
        ok: outcome?.status !== "FAILED",
        text: `${outcome?.status}: ${outcome?.detail ?? ""}`.trim(),
      });
      router.refresh();
    } catch (caught) {
      setResult({ ok: false, text: (caught as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-right">
      <Button type="button" size="sm" variant="secondary" onClick={run} disabled={busy}>
        {busy ? "Running…" : "Run now"}
      </Button>
      {result ? (
        <p
          className={
            result.ok
              ? "mt-1.5 max-w-[16rem] text-left text-xs text-muted"
              : "mt-1.5 max-w-[16rem] text-left text-xs text-red-700 dark:text-red-300"
          }
        >
          {result.text}
        </p>
      ) : null}
    </div>
  );
}
