"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Callout } from "@/components/ui";
import { COVERAGE_LABELS, SECTION_LABELS, type CoverageSection } from "@/modules/geo/config";

const STATES = ["COVERED", "PARTIAL", "PLANNED", "NOT_APPLICABLE"] as const;

async function post(countryId: string, body: unknown) {
  const response = await fetch(`/api/v1/admin/countries/${countryId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
  return payload?.data;
}

export function CoverageEditor({
  countryId,
  rows,
}: {
  countryId: string;
  rows: { section: CoverageSection; state: string; note: string | null; rows: number }[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(section: CoverageSection, state: string, note: string | null) {
    setPending(section);
    setError(null);
    try {
      await post(countryId, { action: "coverage", section, state, note });
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-4 font-medium">Section</th>
              <th className="pb-2 pr-4 font-medium">Published rows</th>
              <th className="pb-2 pr-4 font-medium">Declared state</th>
              <th className="pb-2 font-medium">Explanation shown to readers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.section} className="border-b border-[var(--border)]">
                <td className="py-3 pr-4 font-medium">{SECTION_LABELS[row.section]}</td>
                <td className="py-3 pr-4 tabular-nums">{row.rows}</td>
                <td className="py-3 pr-4">
                  <select
                    defaultValue={row.state}
                    disabled={pending === row.section}
                    onChange={(event) => update(row.section, event.target.value, row.note)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                  >
                    {STATES.map((state) => (
                      <option key={state} value={state}>
                        {COVERAGE_LABELS[state]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3">
                  <input
                    defaultValue={row.note ?? ""}
                    placeholder={
                      row.state === "NOT_APPLICABLE"
                        ? "Why it doesn't apply here"
                        : "Optional note"
                    }
                    disabled={pending === row.section}
                    onBlur={(event) => {
                      const value = event.target.value.trim() || null;
                      if (value !== row.note) update(row.section, row.state, value);
                    }}
                    className="w-full min-w-[14rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CountryActivation({
  countryId,
  isActive,
  ready,
}: {
  countryId: string;
  isActive: boolean;
  ready: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "activate" | "deactivate") {
    setBusy(true);
    setError(null);
    try {
      await post(countryId, { action });
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
      {isActive ? (
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => act("deactivate")}>
          {busy ? "Working…" : "Switch off"}
        </Button>
      ) : (
        <Button size="sm" disabled={busy || !ready} onClick={() => act("activate")}>
          {busy ? "Working…" : ready ? "Launch this country" : "Not ready to launch"}
        </Button>
      )}
    </div>
  );
}
