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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
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
              {entry.channels.map((channel) => {
                const key = `${entry.type}:${channel.channel}`;
                return (
                  <td key={channel.channel} className="py-3 pr-4 text-center">
                    <input
                      type="checkbox"
                      checked={channel.enabled && channel.available}
                      disabled={!channel.available || pending === key}
                      onChange={(event) =>
                        toggle(entry.type, channel.channel, event.target.checked)
                      }
                      aria-label={`${entry.label} — ${CHANNEL_LABELS[channel.channel]}`}
                      title={channel.available ? undefined : unavailableLabel}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
