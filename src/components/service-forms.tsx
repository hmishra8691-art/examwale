"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const KINDS: [string, string][] = [
  ["RESUME_REVIEW", "Résumé review"],
  ["INTERVIEW_COACHING", "Interview coaching"],
  ["CAREER_COACHING", "Career coaching"],
  ["CONSULTING", "Consulting"],
  ["TRAINING", "Training"],
  ["PORTFOLIO_REVIEW", "Portfolio review"],
  ["OTHER", "Something else"],
];

const DELIVERY: [string, string][] = [
  ["LIVE_SESSION", "A live call at a booked time"],
  ["ASYNC_REVIEW", "You send something, they send it back"],
  ["WRITTEN_DELIVERABLE", "A written report or plan"],
  ["PROGRAMME", "Several sessions over a period"],
];

export type ServiceValues = {
  id?: string;
  kind: string;
  title: string;
  summary: string;
  description: string;
  deliverables: string[];
  delivery: string;
  price: number | null;
  priceOnRequest: boolean;
  durationMinutes: number | null;
  turnaroundDays: number | null;
};

/**
 * Write or edit a service listing.
 *
 * Two things the form insists on, because a directory without them is one nobody
 * can shop in: a concrete price *or* an explicit "priced per engagement", and at
 * least a sentence about what the buyer ends up with. Both are the kind of thing
 * a provider leaves blank when a form lets them, and both are the first thing a
 * buyer looks for.
 */
export function ServiceForm({ initial }: { initial: ServiceValues }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onRequest, setOnRequest] = useState(initial.priceOnRequest);
  const [deliverables, setDeliverables] = useState<string[]>(
    initial.deliverables.length ? initial.deliverables : [""],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? "").trim();
    const number = (name: string) => (value(name) ? Number(value(name)) : null);

    const payload = {
      kind: value("kind"),
      title: value("title"),
      summary: value("summary"),
      description: value("description"),
      deliverables: deliverables.filter((d) => d.trim()),
      delivery: value("delivery"),
      priceOnRequest: onRequest,
      price: onRequest ? null : Number(value("price") || 0),
      durationMinutes: number("durationMinutes"),
      turnaroundDays: number("turnaroundDays"),
    };

    try {
      const response = await fetch(
        initial.id ? `/api/v1/services/${initial.id}` : "/api/v1/services",
        {
          method: initial.id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? "That didn't save.");

      if (!initial.id) {
        router.push(`/provider/services/${result.data.service.id}`);
      } else {
        setNotice(
          result.data.returnedToDraft
            ? "Saved, and moved back to draft — an edited listing goes through review again, because what was approved is not what would now be public."
            : "Saved.",
        );
        router.refresh();
      }
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {notice ? <Callout tone="good">{notice}</Callout> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">What kind of service?</span>
          <select name="kind" defaultValue={initial.kind} className={`mt-1.5 ${inputClass}`}>
            {KINDS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium">How is it delivered?</span>
          <select name="delivery" defaultValue={initial.delivery} className={`mt-1.5 ${inputClass}`}>
            {DELIVERY.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium">Title</span>
        <input
          name="title"
          defaultValue={initial.title}
          required
          minLength={6}
          maxLength={140}
          className={`mt-1.5 ${inputClass}`}
          placeholder="Résumé review for commerce graduates"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">One-line summary</span>
        <input
          name="summary"
          defaultValue={initial.summary}
          required
          minLength={20}
          maxLength={300}
          className={`mt-1.5 ${inputClass}`}
        />
        <span className="mt-1 block text-xs text-faint">
          The line people read in a list. Say what they get, not what you are.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">What actually happens</span>
        <textarea
          name="description"
          defaultValue={initial.description}
          required
          minLength={100}
          rows={7}
          maxLength={8000}
          className={`mt-1.5 ${inputClass}`}
        />
        <span className="mt-1 block text-xs text-faint">
          How it runs, what you need from them, and what they have at the end.
        </span>
      </label>

      <fieldset>
        <legend className="text-sm font-medium">What they end up with</legend>
        <p className="mt-1 text-xs text-faint">
          Concrete deliverables. &ldquo;Coaching&rdquo; on its own is not something anybody can
          judge.
        </p>
        <div className="mt-2 space-y-2">
          {deliverables.map((entry, index) => (
            <div key={index} className="flex gap-2">
              <input
                value={entry}
                onChange={(event) =>
                  setDeliverables(deliverables.map((d, i) => (i === index ? event.target.value : d)))
                }
                maxLength={200}
                className={inputClass}
                placeholder="A marked-up copy of your CV with comments on every bullet"
              />
              <button
                type="button"
                onClick={() => setDeliverables(deliverables.filter((_, i) => i !== index))}
                className="shrink-0 text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        {deliverables.length < 12 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="mt-2"
            onClick={() => setDeliverables([...deliverables, ""])}
          >
            Add one
          </Button>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-sm font-medium">Price</span>
          <input
            name="price"
            type="number"
            min={0}
            defaultValue={initial.price ?? 0}
            disabled={onRequest}
            className={`mt-1.5 ${inputClass} disabled:opacity-50`}
          />
          <span className="mt-1 block text-xs text-faint">0 for free</span>
        </label>
        <label className="block">
          <span className="text-sm font-medium">Duration (minutes)</span>
          <input
            name="durationMinutes"
            type="number"
            min={5}
            max={2400}
            defaultValue={initial.durationMinutes ?? ""}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Turnaround (days)</span>
          <input
            name="turnaroundDays"
            type="number"
            min={0}
            max={180}
            defaultValue={initial.turnaroundDays ?? ""}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      <label className="flex items-start gap-2 text-[13.5px]">
        <input
          type="checkbox"
          checked={onRequest}
          onChange={(event) => setOnRequest(event.target.checked)}
          className="mt-0.5"
        />
        <span>
          Priced per engagement — it genuinely depends on the work.{" "}
          <span className="text-faint">
            Use this only when it is true. A directory of listings whose price you can only learn by
            asking wastes everybody&rsquo;s time.
          </span>
        </span>
      </label>

      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : initial.id ? "Save changes" : "Create as draft"}
      </Button>
    </form>
  );
}

/** Submit, pause, resume, archive — whatever is legal from the current state. */
export function ServiceActions({
  serviceId,
  status,
  acceptingRequests,
}: {
  serviceId: string;
  status: string;
  acceptingRequests: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flags, setFlags] = useState<string[]>([]);

  async function act(action: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/services/${serviceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
      if (action === "submit") setFlags(payload.data.flags ?? []);
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
      {flags.length ? (
        <Callout tone="warn" title="Our automated screen flagged this for a reviewer">
          <ul className="list-inside list-disc">
            {flags.map((flag) => (
              <li key={flag}>{SERVICE_FLAG_LABELS[flag] ?? flag}</li>
            ))}
          </ul>
          <p className="mt-2">
            A flag is not a rejection — a person decides. If any were unintentional, editing now
            saves a round trip.
          </p>
        </Callout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" || status === "REJECTED" ? (
          <Button size="sm" onClick={() => act("submit")} disabled={busy}>
            {busy ? "Submitting…" : "Submit for review"}
          </Button>
        ) : null}
        {status === "ACTIVE" ? (
          <Button size="sm" variant="secondary" onClick={() => act("pause")} disabled={busy}>
            Pause listing
          </Button>
        ) : null}
        {status === "PAUSED" ? (
          <Button size="sm" onClick={() => act("resume")} disabled={busy}>
            List it again
          </Button>
        ) : null}
        {status === "ARCHIVED" ? (
          <Button size="sm" onClick={() => act("restore")} disabled={busy}>
            Restore to draft
          </Button>
        ) : null}
        {status !== "ARCHIVED" && status !== "SUSPENDED" ? (
          <Button size="sm" variant="secondary" onClick={() => act("archive")} disabled={busy}>
            Archive
          </Button>
        ) : null}
        {status === "ACTIVE" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => act(acceptingRequests ? "not_accepting" : "accepting")}
            disabled={busy}
          >
            {acceptingRequests ? "Stop taking requests" : "Start taking requests"}
          </Button>
        ) : null}
      </div>

      {status === "PAUSED" ? (
        <p className="text-xs leading-relaxed text-faint">
          Listing it again does not need re-approval — it is the same listing a moderator already
          read. Editing it does, because a changed listing is a different one.
        </p>
      ) : null}
    </div>
  );
}

const SERVICE_FLAG_LABELS: Record<string, string> = {
  guarantees_outcome: "Guarantees a job, a score or a result",
  directs_off_platform: "Pushes contact to a personal number or address",
  asks_for_payment_upfront: "Asks for payment before any conversation",
  vague_deliverables: "No concrete deliverable — what the buyer gets is unclear",
};

/** Ask a provider for a service. Opens a conversation, not a checkout. */
export function RequestServiceForm({ serviceId }: { serviceId: string }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/services/${serviceId}/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim() || null }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't send.");
      router.push(`/messages/${payload.data.conversationId}`);
    } catch (caught) {
      setError((caught as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <Callout tone="danger">{error}</Callout> : null}
      <label className="block">
        <span className="text-sm font-medium">What do you need?</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          maxLength={2000}
          className={`mt-1.5 ${inputClass}`}
          placeholder="A sentence or two about your situation helps them say whether they can actually help."
        />
      </label>
      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Ask about this"}
      </Button>
      <p className="text-xs leading-relaxed text-faint">
        This opens a conversation — it is not a purchase and no money changes hands here. What you
        agree, and how you pay for it, is between the two of you.
      </p>
    </form>
  );
}
