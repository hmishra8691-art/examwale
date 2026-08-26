"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
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
 * The slots arrive already generated, from the same server function the booking
 * endpoint validates against. This component used to build them itself, walking
 * the weekly pattern with `date.getDay()` and `start.setHours()` — the
 * *visitor's* clock — while the API checked the result against the server's. A
 * seeker in one zone and a mentor in another could therefore be shown a time
 * the API would then refuse, which reads as the site being broken.
 *
 * Each slot carries a label in the mentor's zone and one in the viewer's, both
 * naming the zone, because "10:00" between Kolkata and Dubai is the most
 * expensive ambiguity this product could ship.
 */
export function SessionRequestForm({
  mentorId,
  slots,
  signedIn,
  holdMinutes,
}: {
  mentorId: string;
  slots: {
    startUtc: string;
    mentorLabel: string;
    viewerLabel: string;
    sameZone: boolean;
    status: "AVAILABLE" | "PENDING" | "BOOKED";
  }[];
  signedIn: boolean;
  holdMinutes: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  /*
   * The slot is reserved while the form is being filled in.
   *
   * Without this, two people can be typing into this form about the same Tuesday
   * and the second one loses at the end — having written a topic and a question
   * for a session they were never going to get. The hold is taken as soon as a
   * time is chosen and given back if they change their mind.
   */
  const [hold, setHold] = useState<{ id: string; startUtc: string; expiresAt: number } | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!hold) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((hold.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [hold]);

  async function takeHold(startUtc: string) {
    setHoldError(null);
    // Give back the previous one rather than sitting on two slots.
    if (hold && hold.startUtc !== startUtc) void release(hold.id);
    try {
      const response = await fetch(`/api/v1/mentors/${mentorId}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledAt: startUtc }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "Couldn't reserve that slot.");
      setHold({
        id: payload.data.holdId,
        startUtc,
        expiresAt: new Date(payload.data.expiresAt).getTime(),
      });
    } catch (caught) {
      setHold(null);
      setHoldError((caught as Error).message);
      router.refresh();
    }
  }

  async function release(holdId: string) {
    await fetch(`/api/v1/mentors/${mentorId}/hold`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdId }),
    }).catch(() => {
      // The scheduler releases it anyway; this is only a courtesy to the next
      // person, so a failure here is not worth telling anybody about.
    });
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
        // Converts this seeker's own reservation rather than competing with it.
        fromHoldId: hold?.id ?? null,
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
        <select
          name="scheduledAt"
          required
          defaultValue=""
          onChange={(event) => {
            if (event.target.value) void takeHold(event.target.value);
          }}
          className={`mt-1.5 ${inputClass}`}
        >
          <option value="" disabled>
            Choose a time…
          </option>
          {slots.map((slot) => (
            <option
              key={slot.startUtc}
              value={slot.startUtc}
              // A slot somebody else is mid-way through booking is shown, and
              // shown as unavailable. Silently omitting it looks like the
              // mentor's hours changed while you were reading them.
              disabled={slot.status === "PENDING" && slot.startUtc !== hold?.startUtc}
            >
              {slot.sameZone
                ? slot.viewerLabel
                : `${slot.viewerLabel} — ${slot.mentorLabel} for the mentor`}
              {slot.status === "PENDING" && slot.startUtc !== hold?.startUtc
                ? " (being booked)"
                : ""}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-faint">
          {slots[0]?.sameZone
            ? "Shown in your timezone."
            : "Shown in your timezone first, then the mentor's — you are in different zones."}
        </span>
        {holdError ? (
          <span className="mt-1.5 block text-xs text-red-700 dark:text-red-300">{holdError}</span>
        ) : null}
        {hold && secondsLeft != null ? (
          <span className="mt-1.5 block text-xs text-faint tabular-nums">
            {secondsLeft > 0
              ? `Held for you for another ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")} — nobody else can take it while you finish.`
              : `Your ${holdMinutes}-minute hold has run out. Pick a time again.`}
          </span>
        ) : null}
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

      <div className="rounded-md border border-[var(--border)] p-4">
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

/**
 * Weekly availability editor.
 *
 * The timezone is part of the record, not an assumption. Every window used to be
 * stored against a default of Asia/Kolkata with no way to change it, so a mentor
 * anywhere else published hours that meant something other than what they typed.
 * One selector at the top governs all windows, because a mentor keeping
 * different windows in different zones is a complication nobody has asked for.
 */
export function AvailabilityEditor({
  initial,
  initialTimezone,
}: {
  initial: { weekday: number; startMinute: number; endMinute: number }[];
  initialTimezone: string;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState(initial);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Offered zones: everywhere the platform operates, plus whatever the mentor's
  // own browser reports, so somebody living outside those markets is not stuck.
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zoneOptions = Array.from(
    new Set([initialTimezone, browserZone, "Asia/Kolkata", "Asia/Dubai", "UTC"].filter(Boolean)),
  );

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
      await send(
        "/api/v1/mentors/me/availability",
        { slots: slots.map((slot) => ({ ...slot, timezone })) },
        "PUT",
      );
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

      <label className="block">
        <span className="text-sm font-medium">Your timezone</span>
        <select
          value={timezone}
          onChange={(event) => {
            setTimezone(event.target.value);
            setSaved(false);
          }}
          className="mt-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm"
        >
          {zoneOptions.map((zone) => (
            <option key={zone} value={zone}>
              {zone.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-faint">
          The hours below are read in this zone. Seekers see them converted to theirs.
          {browserZone && browserZone !== timezone ? (
            <> Your device says you are in {browserZone.replace(/_/g, " ")}.</>
          ) : null}
        </span>
      </label>

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
              value <= rating ? "text-lg text-rating" : "text-lg text-ink-300 dark:text-ink-600"
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
