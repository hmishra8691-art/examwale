"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";

async function send(url: string, body: unknown, method: "POST" | "PATCH" | "PUT" = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't work.");
  return payload?.data;
}

const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function minutesToTime(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Booking form.
 *
 * The datetime input is constrained to the mentor's declared windows by
 * offering concrete slots rather than a free-form picker. A free picker
 * produces requests that the server correctly rejects, which reads to the
 * person as the site being broken.
 */
export function SessionRequestForm({
  mentorId,
  availability,
  sessionMinutes,
  signedIn,
}: {
  mentorId: string;
  availability: { weekday: number; startMinute: number; endMinute: number }[];
  sessionMinutes: number;
  signedIn: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Build the next four weeks of concrete slots from the weekly pattern.
  const slots: { value: string; label: string }[] = [];
  const now = new Date();
  for (let dayOffset = 1; dayOffset <= 28 && slots.length < 60; dayOffset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + dayOffset);
    const windows = availability.filter((slot) => slot.weekday === date.getDay());

    for (const window of windows) {
      for (
        let minute = window.startMinute;
        minute + sessionMinutes <= window.endMinute;
        minute += sessionMinutes
      ) {
        const start = new Date(date);
        start.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
        if (start.getTime() <= Date.now()) continue;
        slots.push({
          value: start.toISOString(),
          label: `${start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })} · ${minutesToTime(minute)}`,
        });
      }
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      await send(`/api/v1/mentors/${mentorId}/sessions`, {
        topic: String(form.get("topic") ?? "").trim(),
        question: String(form.get("question") ?? "").trim() || null,
        scheduledAt: String(form.get("scheduledAt") ?? ""),
      });
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <Callout tone="info">
        <a href={`/login?next=/mentors/${mentorId}`} className="underline">
          Sign in
        </a>{" "}
        to request a session.
      </Callout>
    );
  }

  if (done) {
    return (
      <Callout tone="good" title="Request sent">
        The mentor will accept or decline. You&rsquo;ll get a notification either way — nothing is
        confirmed until they accept.
      </Callout>
    );
  }

  if (!slots.length) {
    return (
      <Callout tone="warn">
        This mentor hasn&rsquo;t published any available times in the next four weeks.
      </Callout>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <label className="block">
        <span className="text-sm font-medium">Pick a time</span>
        <select name="scheduledAt" required className={`mt-1.5 ${inputClass}`}>
          {slots.map((slot) => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-faint">
          {sessionMinutes} minutes. Times are IST.
        </span>
      </label>

      <label className="block">
        <span className="text-sm font-medium">What do you want to talk about?</span>
        <input name="topic" required maxLength={160} className={`mt-1.5 ${inputClass}`} />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Anything specific? (optional)</span>
        <textarea name="question" rows={4} maxLength={2000} className={`mt-1.5 ${inputClass}`} />
        <span className="mt-1 block text-xs text-faint">
          The more concrete you are, the more useful the session will be.
        </span>
      </label>

      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Request session"}
      </Button>
    </form>
  );
}

export function MentorApplyForm({ countryId }: { countryId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [free, setFree] = useState(true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const data = await send("/api/v1/mentors", {
        headline: String(form.get("headline") ?? "").trim(),
        bio: String(form.get("bio") ?? "").trim(),
        countryId,
        city: String(form.get("city") ?? "").trim() || null,
        languages: String(form.get("languages") ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        yearsExperience: Number(form.get("yearsExperience") ?? 0) || 0,
        currentRole: String(form.get("currentRole") ?? "").trim() || null,
        currentOrganisation: String(form.get("currentOrganisation") ?? "").trim() || null,
        sessionRate: free ? 0 : Number(form.get("sessionRate") ?? 0) || 0,
        sessionMinutes: Number(form.get("sessionMinutes") ?? 30) || 30,
      });
      setMessage(data.message);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (message) {
    return (
      <Callout tone="good" title="Application received">
        <p>{message}</p>
        <p className="mt-2">
          <a href="/dashboard/mentor" className="underline">
            Add your credentials
          </a>{" "}
          so a reviewer can check them.
        </p>
      </Callout>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      <label className="block">
        <span className="text-sm font-medium">Headline</span>
        <input
          name="headline"
          required
          minLength={10}
          maxLength={160}
          placeholder="Bank PO — IBPS and SBI preparation while working"
          className={`mt-1.5 ${inputClass}`}
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">About you</span>
        <textarea
          name="bio"
          required
          rows={6}
          minLength={60}
          maxLength={4000}
          className={`mt-1.5 ${inputClass}`}
        />
        <span className="mt-1 block text-xs text-faint">
          What you actually did, including the parts that went badly. That is what people find
          useful.
        </span>
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">City</span>
          <input name="city" maxLength={120} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Languages</span>
          <input
            name="languages"
            required
            placeholder="Hindi, English"
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Current role</span>
          <input name="currentRole" maxLength={160} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Organisation</span>
          <input name="currentOrganisation" maxLength={160} className={`mt-1.5 ${inputClass}`} />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Years of experience</span>
          <input
            name="yearsExperience"
            type="number"
            min={0}
            max={60}
            defaultValue={0}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Session length (minutes)</span>
          <select name="sessionMinutes" defaultValue="30" className={`mt-1.5 ${inputClass}`}>
            <option value="15">15</option>
            <option value="30">30</option>
            <option value="45">45</option>
            <option value="60">60</option>
          </select>
        </label>
      </div>

      <div className="rounded-xl border border-[var(--border)] p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={free}
            onChange={(event) => setFree(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            <span className="font-medium">Offer sessions free</span>
            <span className="mt-0.5 block text-xs text-muted">
              Many mentors here do. Free sessions get booked considerably faster.
            </span>
          </span>
        </label>
        {!free ? (
          <label className="mt-4 block">
            <span className="text-sm font-medium">Rate per session (₹)</span>
            <input
              name="sessionRate"
              type="number"
              min={0}
              max={100000}
              className={`mt-1.5 ${inputClass}`}
            />
          </label>
        ) : null}
      </div>

      <Button type="submit" disabled={busy}>
        {busy ? "Submitting…" : "Apply to mentor"}
      </Button>
    </form>
  );
}

/** Add-a-credential form on the mentor's own dashboard. */
export function CredentialForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const el = event.currentTarget;

    try {
      await send("/api/v1/mentors/me/credentials", {
        kind: String(form.get("kind") ?? "other"),
        title: String(form.get("title") ?? "").trim(),
        issuer: String(form.get("issuer") ?? "").trim() || null,
        evidenceUrl: String(form.get("evidenceUrl") ?? "").trim() || null,
      });
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
      <div className="grid gap-3 sm:grid-cols-2">
        <select name="kind" defaultValue="exam_result" className={inputClass}>
          <option value="exam_result">Exam result</option>
          <option value="employment">Employment</option>
          <option value="education">Education</option>
          <option value="licence">Licence or registration</option>
          <option value="other">Other</option>
        </select>
        <input name="title" required placeholder="What it is" className={inputClass} />
        <input name="issuer" placeholder="Who issued it" className={inputClass} />
        <input name="evidenceUrl" type="url" placeholder="Link to evidence" className={inputClass} />
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Adding…" : "Add credential"}
      </Button>
    </form>
  );
}

/** Weekly availability editor. */
export function AvailabilityEditor({
  initial,
}: {
  initial: { weekday: number; startMinute: number; endMinute: number }[];
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addSlot() {
    setSlots([...slots, { weekday: 6, startMinute: 10 * 60, endMinute: 13 * 60 }]);
    setSaved(false);
  }

  function update(index: number, patch: Partial<(typeof slots)[number]>) {
    setSlots(slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await send("/api/v1/mentors/me/availability", { slots }, "PUT");
      setSaved(true);
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
      {saved ? <Callout tone="good">Availability saved.</Callout> : null}

      {slots.length ? (
        <ul className="space-y-2">
          {slots.map((slot, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2">
              <select
                value={slot.weekday}
                onChange={(event) => update(index, { weekday: Number(event.target.value) })}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                aria-label="Day"
              >
                {WEEKDAYS.map((day, value) => (
                  <option key={day} value={value}>
                    {day}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={minutesToTime(slot.startMinute)}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(":").map(Number);
                  update(index, { startMinute: h * 60 + m });
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                aria-label="Start time"
              />
              <span className="text-sm text-muted">to</span>
              <input
                type="time"
                value={minutesToTime(slot.endMinute)}
                onChange={(event) => {
                  const [h, m] = event.target.value.split(":").map(Number);
                  update(index, { endMinute: h * 60 + m });
                }}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
                aria-label="End time"
              />
              <button
                type="button"
                onClick={() => {
                  setSlots(slots.filter((_, i) => i !== index));
                  setSaved(false);
                }}
                className="text-sm text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No hours set, so nobody can book you. Add at least one window.
        </p>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" onClick={addSlot}>
          Add a window
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save availability"}
        </Button>
      </div>
    </div>
  );
}

/** Accept / decline / complete / cancel controls. */
export function SessionActions({
  sessionId,
  status,
  asMentor,
}: {
  sessionId: string;
  status: string;
  asMentor: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await send(`/api/v1/mentors/sessions/${sessionId}`, body, "PATCH");
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
      <div className="flex flex-wrap gap-2">
        {asMentor && status === "REQUESTED" ? (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => act({ action: "respond", decision: "ACCEPTED" })}
            >
              Accept
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => act({ action: "respond", decision: "DECLINED" })}
            >
              Decline
            </Button>
          </>
        ) : null}
        {asMentor && status === "ACCEPTED" ? (
          <Button size="sm" disabled={busy} onClick={() => act({ action: "complete" })}>
            Mark complete
          </Button>
        ) : null}
        {status === "REQUESTED" || status === "ACCEPTED" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => act({ action: "cancel" })}
          >
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Review form, shown on a completed session the seeker attended. */
export function ReviewForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [done, setDone] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      await send(`/api/v1/mentors/sessions/${sessionId}/review`, {
        rating,
        comment: String(form.get("comment") ?? "").trim() || null,
      });
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <p className="text-sm text-muted">Thanks — your review is recorded.</p>;

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">Rating</span>
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setRating(value)}
            aria-label={`${value} out of 5`}
            className={
              value <= rating ? "text-lg text-saffron-500" : "text-lg text-ink-300 dark:text-ink-600"
            }
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        name="comment"
        rows={2}
        maxLength={2000}
        placeholder="What was useful, and what wasn't?"
        className={inputClass}
      />
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? "Sending…" : "Leave review"}
      </Button>
    </form>
  );
}
