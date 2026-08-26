"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Card, cx } from "@/components/ui";
import { PriorityTag, RulebookNote, ScoreDial, ScoreRow } from "@/components/guidance-ui";
import type { ResumeReviewShape } from "@/db/schema";

type StoredDocument = { id: string; filename: string; uploadedAt: string };
type TargetOption = { slug: string; label: string };

type ReviewResponse = {
  review: ResumeReviewShape;
  provider: string;
  target: { kind: string; slug: string | null; label: string };
};

export function ResumeReviewWorkspace({
  storedResume,
  targets,
}: {
  storedResume: StoredDocument | null;
  targets: TargetOption[];
}) {
  const [source, setSource] = useState<"stored" | "paste">(storedResume ? "stored" : "paste");
  const [text, setText] = useState("");
  const [targetSlug, setTargetSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResponse | null>(null);

  const pastedWords = text.trim() ? text.trim().split(/\s+/).length : 0;
  const canSubmit = source === "stored" ? Boolean(storedResume) : text.trim().length >= 120;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/guidance/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(source === "stored"
            ? { documentId: storedResume?.id }
            : { text: text.trim() }),
          targetSlug: targetSlug || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't review that just now.");
        return;
      }
      setResult(body.data);
      // Bring the result into view on a phone, where the form fills the screen.
      requestAnimationFrame(() => {
        document.getElementById("review-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={submit} className="space-y-5">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Which résumé?</legend>
            <div className="flex flex-wrap gap-2">
              <SourceButton
                active={source === "stored"}
                disabled={!storedResume}
                onClick={() => setSource("stored")}
                title={storedResume ? storedResume.filename : "No résumé uploaded yet"}
                subtitle={
                  storedResume
                    ? `Uploaded ${new Date(storedResume.uploadedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                    : "Upload one from your documents"
                }
              />
              <SourceButton
                active={source === "paste"}
                onClick={() => setSource("paste")}
                title="Paste the text"
                subtitle="Nothing is stored as a file"
              />
            </div>
            {!storedResume ? (
              <p className="mt-2 text-xs text-faint">
                You can{" "}
                <Link href="/dashboard/documents" className="underline">
                  upload a résumé
                </Link>{" "}
                to reuse it later, or just paste the text below.
              </p>
            ) : null}
          </fieldset>

          {source === "paste" ? (
            <div>
              <label htmlFor="resume-text" className="mb-1.5 block text-sm font-medium">
                Résumé text
              </label>
              <textarea
                id="resume-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                rows={12}
                placeholder="Paste the whole thing — headings, bullets and all. The structure is part of what's being reviewed."
                className="w-full resize-y rounded-md border bg-[var(--surface)] px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
              />
              <p className="mt-1.5 text-xs text-faint">
                {pastedWords} words
                {pastedWords > 0 && pastedWords < 60
                  ? " — too short to review usefully yet."
                  : ""}
              </p>
            </div>
          ) : null}

          <div>
            <label htmlFor="target" className="mb-1.5 block text-sm font-medium">
              Role you&rsquo;re aiming at
            </label>
            <select
              id="target"
              value={targetSlug}
              onChange={(event) => setTargetSlug(event.target.value)}
              className="w-full max-w-md rounded-md border bg-[var(--surface)] px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            >
              <option value="">No specific role — general review</option>
              {targets.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-faint">
              Picking a role adds a relevance score against the skills that role&rsquo;s guide
              lists. Without one, relevance is left out of the total rather than counted as zero.
            </p>
          </div>

          {error ? (
            <Callout tone="danger" title="That didn't work">
              <p>{error}</p>
            </Callout>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy || !canSubmit}>
              {busy ? "Reviewing…" : result ? "Review again" : "Review my résumé"}
            </Button>
            {busy ? (
              <span className="text-sm text-muted">
                Scoring the structure, then writing the notes.
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      {result ? <ReviewResult data={result} /> : null}
    </div>
  );
}

function SourceButton({
  active,
  disabled,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cx(
        "min-w-[13rem] flex-1 rounded-md border px-3.5 py-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-brand-500 bg-brand-50 dark:bg-brand-900/25"
          : "hover:bg-[var(--surface-raised)]",
      )}
    >
      <span className="block truncate text-sm font-medium">{title}</span>
      <span className="mt-0.5 block truncate text-xs text-muted">{subtitle}</span>
    </button>
  );
}

function ReviewResult({ data }: { data: ReviewResponse }) {
  const { review } = data;
  const highPriority = review.fixes.filter((fix) => fix.priority === "HIGH");

  return (
    <div id="review-result" className="space-y-4 scroll-mt-24">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <ScoreDial
            score={review.overall}
            label={`Overall: ${verdictWord(review.overall)}`}
            caption={
              data.target.slug
                ? `Scored against ${data.target.label}.`
                : "Scored generally — no target role was chosen."
            }
          />
          {highPriority.length ? (
            <div className="min-w-[14rem] flex-1 rounded-md border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-900/15">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
                Fix first
              </p>
              <ul className="mt-1.5 space-y-1 text-[13px]">
                {highPriority.slice(0, 3).map((fix) => (
                  <li key={fix.issue}>{fix.issue}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <ul className="mt-6 divide-y">
          {review.sections.map((section) => (
            <ScoreRow
              key={section.key}
              label={section.label}
              score={section.score}
              comment={section.verdict}
            />
          ))}
        </ul>

        <RulebookNote />
      </Card>

      {review.fixes.length ? (
        <Card>
          <h2 className="mb-3 font-medium">What to change</h2>
          <ul className="space-y-3">
            {review.fixes.map((fix) => (
              <li key={fix.issue} className="flex gap-3">
                <PriorityTag priority={fix.priority} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{fix.issue}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{fix.action}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {review.rewrites.length ? (
        <Card>
          <h2 className="mb-1 font-medium">Line rewrites</h2>
          <p className="mb-4 text-sm text-muted">
            These quote your own lines. Anything with a bracketed placeholder needs a real number
            from you — do not ship it as written.
          </p>
          <ul className="space-y-4">
            {review.rewrites.map((rewrite, index) => (
              <li key={index} className="rounded-md border p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">Before</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted line-through decoration-red-400/60">
                  {rewrite.before}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-verified-700 dark:text-verified-200">
                  After
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed">{rewrite.after}</p>
                <p className="mt-2 text-xs text-faint">{rewrite.why}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {data.target.slug ? (
        <Card>
          <h2 className="mb-3 font-medium">Against {data.target.label}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-verified-700 dark:text-verified-200">
                Already there ({review.matchedForTarget.length})
              </p>
              {review.matchedForTarget.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {review.matchedForTarget.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-verified-50 px-2.5 py-1 text-xs text-verified-700 dark:bg-verified-700/15 dark:text-verified-100"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">None of the listed skills appear.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-estimate-700 dark:text-estimate-200">
                Not mentioned ({review.missingForTarget.length})
              </p>
              {review.missingForTarget.length ? (
                <ul className="flex flex-wrap gap-1.5">
                  {review.missingForTarget.map((skill) => (
                    <li
                      key={skill}
                      className="rounded-full bg-ink-100 px-2.5 py-1 text-xs text-ink-700 dark:bg-ink-800 dark:text-ink-200"
                    >
                      {skill}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Everything the guide lists is covered.</p>
              )}
            </div>
          </div>
          <p className="mt-4 text-xs text-faint">
            A missing skill is not automatically a problem — if you have it, name it. If you do not,
            this is the gap to close, and the{" "}
            <Link href={`/careers/${data.target.slug}`} className="underline">
              {data.target.label} guide
            </Link>{" "}
            sets out the route.
          </p>
        </Card>
      ) : null}

      {review.strengths.length ? (
        <Card>
          <h2 className="mb-2 font-medium">Worth keeping</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
            {review.strengths.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Callout tone="info" title="What this review is not">
        <ul className="list-disc space-y-1 pl-4">
          {review.limitations.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      </Callout>
    </div>
  );
}

function verdictWord(score: number): string {
  if (score >= 80) return "strong";
  if (score >= 65) return "solid, with gaps";
  if (score >= 45) return "needs work";
  return "needs a rewrite";
}
