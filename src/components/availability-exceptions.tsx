"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge, Button, Callout } from "@/components/ui";

const inputClass =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

type Exception = {
  id: string;
  kind: "UNAVAILABLE" | "EXTRA";
  onDate: string;
  startMinute: number | null;
  endMinute: number | null;
  note: string | null;
};

function timeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function toMinutes(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Dated exceptions to the weekly pattern.
 *
 * Two kinds, and the difference is worth spelling out on screen rather than
 * leaving to a dropdown label: blocking time out is the common case and works
 * for a whole day or part of one, while adding a one-off window is how a mentor
 * offers a Sunday morning they do not normally work.
 */
export function AvailabilityExceptions({
  initial,
  timezone,
}: {
  initial: Exception[];
  timezone: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [kind, setKind] = useState<"UNAVAILABLE" | "EXTRA">("UNAVAILABLE");
  const [wholeDay, setWholeDay] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "");

    try {
      const response = await fetch("/api/v1/mentors/me/exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          onDate: value("onDate"),
          // An EXTRA window always needs hours; blocking can be a whole day.
          startMinute: kind === "EXTRA" || !wholeDay ? toMinutes(value("start")) : null,
          endMinute: kind === "EXTRA" || !wholeDay ? toMinutes(value("end")) : null,
          note: value("note").trim() || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
      setRows([...rows, payload.data.exception].sort((a, b) => a.onDate.localeCompare(b.onDate)));
      event.currentTarget.reset();
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await fetch(`/api/v1/mentors/me/exceptions/${id}`, { method: "DELETE" });
      setRows(rows.filter((row) => row.id !== id));
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={row.kind === "UNAVAILABLE" ? "warn" : "good"}>
                    {row.kind === "UNAVAILABLE" ? "Away" : "Extra hours"}
                  </Badge>
                  <span className="text-sm tabular-nums">
                    {new Date(`${row.onDate}T12:00:00`).toDateString()}
                  </span>
                  <span className="text-sm text-muted">
                    {row.startMinute == null
                      ? "all day"
                      : `${timeLabel(row.startMinute)}–${timeLabel(row.endMinute ?? 0)}`}
                  </span>
                </div>
                {row.note ? <p className="mt-0.5 text-xs text-faint">{row.note}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => remove(row.id)}
                disabled={busy}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          Nothing scheduled. Your weekly hours apply to every date.
        </p>
      )}

      <form onSubmit={add} className="space-y-3 rounded-lg border p-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["UNAVAILABLE", "Block time out"],
              ["EXTRA", "Add one-off hours"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${
                kind === value
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-100"
                  : "hover:bg-[var(--surface-raised)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="text-xs font-medium">Date</span>
            <input type="date" name="onDate" required min={today} className={`mt-1 block ${inputClass}`} />
          </label>

          {kind === "UNAVAILABLE" ? (
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input
                type="checkbox"
                checked={wholeDay}
                onChange={(event) => setWholeDay(event.target.checked)}
              />
              All day
            </label>
          ) : null}

          {kind === "EXTRA" || !wholeDay ? (
            <>
              <label className="block">
                <span className="text-xs font-medium">From</span>
                <input type="time" name="start" required className={`mt-1 block ${inputClass}`} />
              </label>
              <label className="block">
                <span className="text-xs font-medium">To</span>
                <input type="time" name="end" required className={`mt-1 block ${inputClass}`} />
              </label>
            </>
          ) : null}

          <label className="block min-w-[10rem] flex-1">
            <span className="text-xs font-medium">Note (only you see this)</span>
            <input name="note" maxLength={200} className={`mt-1 block w-full ${inputClass}`} />
          </label>

          <Button type="submit" size="sm" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-faint">
          Dates are read in {timezone.replace(/_/g, " ")}. Blocking time out always wins over your
          weekly hours and over any extra window on the same day, so an old one-off cannot
          accidentally unblock a holiday.
        </p>
      </form>
    </div>
  );
}

/** Session length, the gap after each one, and how many a mentor will take. */
export function BookingRulesForm({
  initial,
}: {
  initial: { sessionMinutes: number; bufferMinutes: number; maxPerDay: number; maxPerWeek: number };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/v1/mentors/me/booking-rules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionMinutes: Number(form.get("sessionMinutes")),
          bufferMinutes: Number(form.get("bufferMinutes")),
          maxPerDay: Number(form.get("maxPerDay")),
          maxPerWeek: Number(form.get("maxPerWeek")),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't save.");
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {saved ? <Callout tone="good">Saved.</Callout> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="text-xs font-medium">Session length</span>
          <input
            type="number"
            name="sessionMinutes"
            min={15}
            max={180}
            step={5}
            defaultValue={initial.sessionMinutes}
            className={`mt-1 block w-full ${inputClass}`}
          />
          <span className="mt-1 block text-xs text-faint">minutes</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium">Gap after each</span>
          <input
            type="number"
            name="bufferMinutes"
            min={0}
            max={120}
            step={5}
            defaultValue={initial.bufferMinutes}
            className={`mt-1 block w-full ${inputClass}`}
          />
          <span className="mt-1 block text-xs text-faint">
            minutes — 0 for back-to-back
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium">Most per day</span>
          <input
            type="number"
            name="maxPerDay"
            min={0}
            max={100}
            defaultValue={initial.maxPerDay}
            className={`mt-1 block w-full ${inputClass}`}
          />
          <span className="mt-1 block text-xs text-faint">0 for no limit</span>
        </label>
        <label className="block">
          <span className="text-xs font-medium">Most per week</span>
          <input
            type="number"
            name="maxPerWeek"
            min={0}
            max={100}
            defaultValue={initial.maxPerWeek}
            className={`mt-1 block w-full ${inputClass}`}
          />
          <span className="mt-1 block text-xs text-faint">0 for no limit</span>
        </label>
      </div>

      <p className="text-xs leading-relaxed text-faint">
        Limits count what is <em>booked</em>, not what is offered. With three a day and two booked,
        every remaining slot that day is still offered — otherwise the third one would be
        unreachable unless a seeker happened to pick the right time.
      </p>

      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Saving…" : "Save booking rules"}
      </Button>
    </form>
  );
}
