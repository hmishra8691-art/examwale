"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

export function MarkAllRead({ label }: { label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await fetch("/api/v1/notifications/read-all", { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={run} disabled={busy}>
      {busy ? "Working…" : label}
    </Button>
  );
}

type Preference = {
  type: string;
  label: string;
  channels: { channel: string; enabled: boolean; available: boolean; isDefault: boolean }[];
};

const CHANNEL_LABELS: Record<string, string> = {
  IN_APP: "In app",
  EMAIL: "Email",
  PUSH: "Push",
};

/**
 * Preference grid.
 *
 * A channel with no provider configured renders disabled with an explanation
 * rather than being hidden. Hiding it would leave someone wondering why they
 * never get emails; showing it switched on when nothing can send would be a
 * lie the interface tells on the deployment's behalf.
 */
export function PreferenceToggles({
  preferences,
  unavailableLabel,
}: {
  preferences: Preference[];
  unavailableLabel: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [state, setState] = useState(preferences);

  async function toggle(type: string, channel: string, enabled: boolean) {
    const key = `${type}:${channel}`;
    setPending(key);

    setState((current) =>
      current.map((entry) =>
        entry.type === type
          ? {
              ...entry,
              channels: entry.channels.map((c) => (c.channel === channel ? { ...c, enabled } : c)),
            }
          : entry,
      ),
    );

    try {
      await fetch("/api/v1/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, channel, enabled }),
      });
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  const box = (entry: (typeof state)[number], channel: (typeof state)[number]["channels"][number]) => {
    const key = `${entry.type}:${channel.channel}`;
    return (
      <input
        type="checkbox"
        checked={channel.enabled && channel.available}
        disabled={!channel.available || pending === key}
        onChange={(event) => toggle(entry.type, channel.channel, event.target.checked)}
        aria-label={`${entry.label} — ${CHANNEL_LABELS[channel.channel]}`}
        title={channel.available ? undefined : unavailableLabel}
        className="size-4 accent-brand-600"
      />
    );
  };

  return (
    <>
      {/*
        Two renderings of the same controls rather than one that scrolls.

        A three-column grid of checkboxes needs about 32rem before the headers
        stop colliding, and forcing that width on a phone produced a settings
        table you had to drag sideways to reach the "Push" column — with no clue
        the column was there. Below `sm` each notification becomes its own row of
        labelled toggles; from `sm` the table returns, because scanning a column
        is the faster way to answer "what emails am I getting?" once it fits.
      */}
      <ul className="divide-y sm:hidden">
        {state.map((entry) => (
          <li key={entry.type} className="py-3">
            <p className="text-sm font-medium">{entry.label}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
              {entry.channels.map((channel) => (
                <label
                  key={channel.channel}
                  className="flex items-center gap-2 text-[13px] text-muted"
                >
                  {box(entry, channel)}
                  {CHANNEL_LABELS[channel.channel]}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-muted">
            <th className="pb-2 pr-4 font-medium">Notification</th>
            {["IN_APP", "EMAIL", "PUSH"].map((channel) => (
              <th key={channel} className="pb-2 pr-4 text-center font-medium">
                {CHANNEL_LABELS[channel]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {state.map((entry) => (
            <tr key={entry.type} className="border-b border-[var(--border)]">
              <td className="py-3 pr-4">{entry.label}</td>
              {entry.channels.map((channel) => (
                <td key={channel.channel} className="py-3 pr-4 text-center">
                  {box(entry, channel)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
