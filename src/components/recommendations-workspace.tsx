"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Card, cx } from "@/components/ui";
import { ProviderNote } from "@/components/ai-ui";

type Recommendation = {
  careerSlug: string;
  name: string;
  score: number;
  reasons: string[];
  gaps: string[];
  groupName: string;
  salaryEntryMin: number | null;
  salaryEntryMax: number | null;
  currencyCode: string;
  fit: string | null;
  against: string | null;
  firstStep: string | null;
  movedBy: number;
};

type Result = {
  recommendations: Recommendation[];
  overview: string | null;
  provider: string;
  rulesOnly: boolean;
  caveats: string[];
  saved: boolean;
};

const WORK_STYLES = [
  { value: "hands_on", label: "Hands-on / practical" },
  { value: "analytical", label: "Analytical / problem-solving" },
  { value: "creative", label: "Creative" },
  { value: "people", label: "Working with people" },
  { value: "organising", label: "Organising and coordinating" },
] as const;

const STUDY_APPETITE = [
  { value: "short", label: "Under a year" },
  { value: "medium", label: "One to three years" },
  { value: "long", label: "Three years or more" },
] as const;

const INCOME_PRIORITY = [
  { value: "stability", label: "Stability" },
  { value: "balanced", label: "Balanced" },
  { value: "maximise", label: "Maximise earnings" },
] as const;

export function RecommendationsWorkspace({
  interests,
  signedIn,
  currencyCode,
  budgetBands,
}: {
  interests: { value: string; label: string }[];
  signedIn: boolean;
  currencyCode: string;
  budgetBands: { label: string; value: number }[];
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [workStyle, setWorkStyle] = useState("");
  const [studyAppetite, setStudyAppetite] = useState("");
  const [incomePriority, setIncomePriority] = useState("");
  const [budget, setBudget] = useState("");
  const [wantsGovernment, setWantsGovernment] = useState(false);
  const [wantsRemote, setWantsRemote] = useState(false);
  const [wantsSelfEmployment, setWantsSelfEmployment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function toggle(value: string) {
    setPicked((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/ai/recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests: picked,
          workStyle: workStyle || undefined,
          studyAppetite: studyAppetite || undefined,
          incomePriority: incomePriority || undefined,
          budget: budget ? Number(budget) : null,
          wantsGovernment,
          wantsRemote,
          wantsSelfEmployment,
          limit: 8,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't build a shortlist just now.");
        return;
      }
      setResult(body.data);
      requestAnimationFrame(() => {
        document.getElementById("recommendation-result")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
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
        <form onSubmit={submit} className="space-y-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              What interests you? <span className="font-normal text-muted">Pick any number.</span>
            </legend>
            <ul className="flex flex-wrap gap-2">
              {interests.map((option) => {
                const active = picked.includes(option.value);
                return (
                  <li key={option.value}>
                    <button
                      type="button"
                      onClick={() => toggle(option.value)}
                      aria-pressed={active}
                      className={cx(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                        active
                          ? "border-brand-500 bg-brand-500 text-white"
                          : "hover:bg-[var(--surface-raised)]",
                      )}
                    >
                      {option.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Select
              id="work-style"
              label="How you like to work"
              value={workStyle}
              onChange={setWorkStyle}
              options={WORK_STYLES}
            />
            <Select
              id="study-appetite"
              label="Time you'd give to training"
              value={studyAppetite}
              onChange={setStudyAppetite}
              options={STUDY_APPETITE}
            />
            <Select
              id="income-priority"
              label="What matters more"
              value={incomePriority}
              onChange={setIncomePriority}
              options={INCOME_PRIORITY}
            />
            <div>
              <label htmlFor="budget" className="mb-1.5 block text-sm font-medium">
                Budget for training
              </label>
              <select
                id="budget"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className="w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-brand-500"
              >
                <option value="">Not sure yet</option>
                {budgetBands.map((band) => (
                  <option key={band.value} value={band.value}>
                    {band.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="flex flex-wrap gap-4">
            <legend className="mb-2 w-full text-sm font-medium">Anything you specifically want</legend>
            <Check label="Government work" checked={wantsGovernment} onChange={setWantsGovernment} />
            <Check label="Remote-friendly" checked={wantsRemote} onChange={setWantsRemote} />
            <Check
              label="Could be self-employed"
              checked={wantsSelfEmployment}
              onChange={setWantsSelfEmployment}
            />
          </fieldset>

          {error ? (
            <Callout tone="danger" title="That didn't work">
              <p>{error}</p>
            </Callout>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? "Working…" : result ? "Update the shortlist" : "Show me what fits"}
            </Button>
            {!signedIn ? (
              <span className="text-sm text-muted">
                Works signed out — the written explanations need an account.
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      {result ? (
        <ResultPanel result={result} currencyCode={currencyCode} signedIn={signedIn} />
      ) : null}
    </div>
  );
}

function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border bg-[var(--surface)] px-3 py-2.5 text-sm outline-none focus:border-brand-500"
      >
        <option value="">No preference</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-[var(--border)] accent-brand-600"
      />
      {label}
    </label>
  );
}

function ResultPanel({
  result,
  currencyCode,
  signedIn,
}: {
  result: Result;
  currencyCode: string;
  signedIn: boolean;
}) {
  if (!result.recommendations.length) {
    return (
      <Callout tone="warn" title="Nothing matched">
        <p>
          The answers you gave rule out everything in the catalogue for this country. Loosen one of
          them — the budget and the &ldquo;must be government&rdquo; filter are the two that usually
          do it.
        </p>
      </Callout>
    );
  }

  return (
    <div id="recommendation-result" className="space-y-4 scroll-mt-24">
      {result.overview ? (
        <Callout tone="info" title="Reading the shortlist">
          <p>{result.overview}</p>
        </Callout>
      ) : null}

      {result.rulesOnly && signedIn ? (
        <Callout tone="warn" title="Ranking only, no written explanation">
          <p>
            This ranking is the scorer&rsquo;s. The written &ldquo;why this fits you&rdquo; needs a
            language-model key, or you have used today&rsquo;s AI allowance.
          </p>
        </Callout>
      ) : null}

      <ol className="space-y-3">
        {result.recommendations.map((entry, index) => (
          <Card as="li" key={entry.careerSlug} className="relative">
            <div className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-sm font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-100">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h3 className="font-medium">
                    <Link href={`/careers/${entry.careerSlug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {entry.name}
                    </Link>
                  </h3>
                  <span className="text-xs text-faint">{entry.groupName}</span>
                  {entry.movedBy !== 0 ? (
                    <span
                      className="text-xs text-faint"
                      title="How far the written review moved this from the scorer's own order"
                    >
                      {entry.movedBy > 0 ? `▲ ${entry.movedBy}` : `▼ ${Math.abs(entry.movedBy)}`}
                    </span>
                  ) : null}
                </div>

                {entry.salaryEntryMin || entry.salaryEntryMax ? (
                  <p className="mt-0.5 text-sm text-muted">
                    Entry pay {formatRange(entry.salaryEntryMin, entry.salaryEntryMax, entry.currencyCode || currencyCode)}
                    <span className="text-faint"> · researched range, not an offer</span>
                  </p>
                ) : null}

                {entry.fit ? (
                  <p className="mt-2.5 text-[13.5px] leading-relaxed">
                    <span className="font-medium">Why it fits you: </span>
                    {entry.fit}
                  </p>
                ) : entry.reasons.length ? (
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
                    <span className="font-medium">Scored for: </span>
                    {entry.reasons.join("; ")}
                  </p>
                ) : null}

                {entry.against ? (
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                    <span className="font-medium">Where it might not: </span>
                    {entry.against}
                  </p>
                ) : entry.gaps.length ? (
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                    <span className="font-medium">Gaps and cautions: </span>
                    {entry.gaps.map(presentGap).join("; ")}
                  </p>
                ) : null}

                {entry.firstStep ? (
                  <p className="relative z-10 mt-3 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-[13px] leading-relaxed">
                    <span className="font-medium">This week: </span>
                    {entry.firstStep}
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </ol>

      <Card>
        <h2 className="mb-2 text-sm font-medium">What this ranking cannot see</h2>
        <ul className="list-disc space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
          {result.caveats.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
        <ProviderNote provider={result.rulesOnly ? "rules" : result.provider}>
          The order comes from a scorer over real career rows; the AI can adjust it by at most three
          places and cannot add a career the platform has no guide for.
        </ProviderNote>
      </Card>
    </div>
  );
}

/**
 * The scorer's `gaps` array mixes two kinds of entry: full sentences
 * ("Costs more than your stated budget…") and bare skill names taken from the
 * taxonomy, which are stored lowercase. Printed as-is the list read as
 * "network security; siem; incident response" — accurate but scruffy, and
 * indistinguishable from a warning. Short entries with no terminal
 * punctuation are treated as skill names and capitalised.
 */
function presentGap(value: string): string {
  const isSentence = value.length > 42 || /[.!?]$/.test(value);
  if (isSentence) return value;
  return value.replace(/\b([a-z])/g, (char) => char.toUpperCase());
}

function formatRange(min: number | null, max: number | null, code: string): string {
  const format = (value: number) =>
    new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      maximumFractionDigits: 0,
    }).format(value);
  if (min && max) return `${format(min)} – ${format(max)}`;
  if (min) return `from ${format(min)}`;
  if (max) return `up to ${format(max)}`;
  return "not recorded";
}
