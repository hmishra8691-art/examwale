"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

async function send(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
  return payload?.data;
}

export function CreateCohortForm({ organisationId }: { organisationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const el = event.currentTarget;

    try {
      const data = await send("/api/v1/b2b/cohorts", {
        organisationId,
        name: String(form.get("name") ?? "").trim(),
        academicYear: String(form.get("academicYear") ?? "").trim() || null,
        description: String(form.get("description") ?? "").trim() || null,
      });
      setJoinCode(data.joinCode);
      el.reset();
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {joinCode ? (
        <Callout tone="good" title="Cohort created">
          Join code: <code className="font-mono font-semibold">{joinCode}</code> — save it now, it
          isn&rsquo;t shown again.
        </Callout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required placeholder="Cohort name" className={inputClass} />
        <input name="academicYear" placeholder="Academic year (optional)" className={inputClass} />
      </div>
      <input name="description" placeholder="Description (optional)" className={inputClass} />

      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Creating…" : "Create cohort"}
      </Button>
    </form>
  );
}

export function InviteStudentsForm({ cohortId }: { cohortId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ invited: number; alreadyMembers: number } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    const emails = String(form.get("emails") ?? "")
      .split(/[\s,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    try {
      const data = await send(`/api/v1/b2b/cohorts/${cohortId}/members`, { emails });
      setResult({ invited: data.invited, alreadyMembers: data.alreadyMembers });
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {result ? (
        <Callout tone="good">
          {result.invited} invited
          {result.alreadyMembers ? `, ${result.alreadyMembers} already in the cohort` : ""}. Nobody
          appears in your figures until they accept.
        </Callout>
      ) : null}

      <label className="block">
        <span className="text-sm font-medium">Student emails</span>
        <textarea
          name="emails"
          rows={4}
          required
          placeholder="One per line, or comma separated"
          className={`mt-1.5 ${inputClass}`}
        />
      </label>

      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Inviting…" : "Send invitations"}
      </Button>
    </form>
  );
}

/** Student-side accept / leave. */
export function CohortMembershipControl({
  cohortId,
  status,
}: {
  cohortId: string;
  status: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function act(action: "accept" | "leave") {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/v1/b2b/cohorts/${cohortId}`, { action });
      setConfirming(false);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {status === "INVITED" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => act("accept")} disabled={busy}>
            {busy ? "Working…" : "Join cohort"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => act("leave")} disabled={busy}>
            Decline
          </Button>
        </div>
      ) : confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="danger" onClick={() => act("leave")} disabled={busy}>
            Confirm leave
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Stay
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="secondary" onClick={() => setConfirming(true)}>
          Leave cohort
        </Button>
      )}
    </div>
  );
}
