"use client";

import { useState, type FormEvent } from "react";
import { Button, Callout } from "@/components/ui";

/**
 * Enquiry form.
 *
 * The sharing controls are opt-in checkboxes, not pre-ticked ones, and the
 * form states in plain words what leaves with the enquiry. A coaching centre
 * receiving a phone number will call it, often for months; that should be a
 * decision the learner made, not a default they didn't notice.
 */
export function CourseEnquiryForm({
  courseId,
  batches,
  defaultName,
  defaultEmail,
}: {
  courseId: string;
  batches: { id: string; label: string }[];
  defaultName?: string | null;
  defaultEmail?: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharePhone, setSharePhone] = useState(false);
  const [shareMessage, setShareMessage] = useState(true);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const sharedFields = ["name", "email"];
    if (sharePhone) sharedFields.push("phone");
    if (shareMessage) sharedFields.push("message");

    try {
      const response = await fetch(`/api/v1/courses/${courseId}/enquiries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          batchId: String(form.get("batchId") ?? "") || null,
          name: String(form.get("name") ?? "").trim(),
          email: String(form.get("email") ?? "").trim(),
          phone: sharePhone ? String(form.get("phone") ?? "").trim() || null : null,
          message: shareMessage ? String(form.get("message") ?? "").trim() || null : null,
          sharedFields,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "That didn't send.");
      }
      setDone(true);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Callout tone="good" title="Enquiry sent">
        The provider has your name and email
        {sharePhone ? ", and your phone number" : ""}. If they don&rsquo;t reply, that is worth
        knowing about them too.
      </Callout>
    );
  }

  const inputClass =
    "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Callout tone="danger">{error}</Callout> : null}

      {batches.length ? (
        <label className="block">
          <span className="text-sm font-medium">Which batch?</span>
          <select name="batchId" className={`mt-1.5 ${inputClass}`} defaultValue="">
            <option value="">Not sure yet</option>
            {batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-sm font-medium">Your name</span>
          <input
            name="name"
            required
            maxLength={120}
            defaultValue={defaultName ?? ""}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium">Email</span>
          <input
            name="email"
            type="email"
            required
            defaultValue={defaultEmail ?? ""}
            className={`mt-1.5 ${inputClass}`}
          />
        </label>
      </div>

      <fieldset className="rounded-xl border border-[var(--border)] p-4">
        <legend className="px-1 text-sm font-medium">What to share</legend>
        <p className="text-xs text-muted">
          Your name and email go with every enquiry — the provider can&rsquo;t answer otherwise.
          The rest is up to you.
        </p>

        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            checked={sharePhone}
            onChange={(event) => setSharePhone(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">
            Share my phone number
            <span className="mt-0.5 block text-xs text-faint">
              Expect calls, and expect them to continue for a while.
            </span>
          </span>
        </label>

        {sharePhone ? (
          <input
            name="phone"
            type="tel"
            maxLength={30}
            placeholder="Phone number"
            className={`mt-2 ${inputClass}`}
          />
        ) : null}

        <label className="mt-3 flex items-start gap-3">
          <input
            type="checkbox"
            checked={shareMessage}
            onChange={(event) => setShareMessage(event.target.checked)}
            className="mt-1"
          />
          <span className="text-sm">Include a message</span>
        </label>

        {shareMessage ? (
          <textarea
            name="message"
            rows={3}
            maxLength={2000}
            placeholder="What do you want to know? Fees, batch timings, whether they have a demo class…"
            className={`mt-2 ${inputClass}`}
          />
        ) : null}
      </fieldset>

      <Button type="submit" disabled={busy}>
        {busy ? "Sending…" : "Send enquiry"}
      </Button>
    </form>
  );
}
