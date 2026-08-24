"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Button, Callout, Card, cx, ProgressBar } from "@/components/ui";
import { formatMoneyRange } from "@/modules/shared/format";
import type { AssessmentResult } from "@/db/schema";

type Defaults = {
  budget: number | null;
  hoursPerDay: number | null;
  yearsExperience: number | null;
  riskTolerance: "low" | "medium" | "high";
  currentSkills: string[];
};

const WORK_STYLES = [
  { value: "hands_on", label: "Hands-on", detail: "Building, fixing, working with physical things" },
  { value: "analytical", label: "Analytical", detail: "Numbers, systems, figuring out why something happens" },
  { value: "creative", label: "Creative", detail: "Designing, writing, making things people see" },
  { value: "people", label: "With people", detail: "Teaching, helping, advising, persuading" },
  { value: "organising", label: "Organising", detail: "Coordinating, planning, keeping things running" },
] as const;

const STUDY_APPETITE = [
  { value: "short", label: "Under 2 years", detail: "I need to start earning soon" },
  { value: "medium", label: "2–4 years", detail: "A degree-length commitment is fine" },
  { value: "long", label: "5 years or more", detail: "I'll take the long route for the right career" },
] as const;

const INCOME_PRIORITY = [
  { value: "stability", label: "Stability", detail: "Predictable income and job security matter most" },
  { value: "balanced", label: "Balanced", detail: "Reasonable pay without extreme risk or hours" },
  { value: "maximise", label: "Maximise earnings", detail: "I'll take pressure and risk for a higher ceiling" },
] as const;

const BUDGETS = [
  { label: "Almost nothing", value: 0 },
  { label: "Up to ₹50,000", value: 50_000 },
  { label: "Up to ₹2 lakh", value: 200_000 },
  { label: "Up to ₹10 lakh", value: 1_000_000 },
  { label: "Over ₹10 lakh", value: 3_000_000 },
];

const STEPS = ["Interests", "How you work", "Time & money", "Preferences", "Results"];

export function AssessmentWizard({
  interestOptions,
  signedIn,
  defaults,
}: {
  interestOptions: { value: string; label: string }[];
  signedIn: boolean;
  defaults: Defaults;
}) {
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [workStyle, setWorkStyle] = useState<string>("");
  const [studyAppetite, setStudyAppetite] = useState<string>("medium");
  const [budget, setBudget] = useState<number | null>(defaults.budget);
  const [incomePriority, setIncomePriority] = useState<string>("balanced");
  const [riskTolerance, setRiskTolerance] = useState(defaults.riskTolerance);
  const [wantsRemote, setWantsRemote] = useState(false);
  const [wantsSelfEmployment, setWantsSelfEmployment] = useState(false);
  const [wantsGovernment, setWantsGovernment] = useState(false);

  const [results, setResults] = useState<AssessmentResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(value: string) {
    setInterests((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    );
  }

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/ai/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interests,
          workStyle: workStyle || undefined,
          studyAppetite,
          budget,
          incomePriority,
          riskTolerance,
          wantsRemote,
          wantsSelfEmployment,
          wantsGovernment,
          currentSkills: defaults.currentSkills,
          yearsExperience: defaults.yearsExperience,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't run the assessment just now.");
        return;
      }
      setResults(body.data.results);
      setStep(4);
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const canAdvance = step === 0 ? interests.length > 0 : step === 1 ? Boolean(workStyle) : true;

  return (
    <div>
      <div className="mb-6">
        <ProgressBar percent={((step + (results ? 1 : 0)) / STEPS.length) * 100} label={STEPS[step]} />
        <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={cx(
                index === step ? "font-semibold text-brand-600" : "text-faint",
                index < step && "text-muted",
              )}
            >
              {index + 1}. {label}
            </li>
          ))}
        </ol>
      </div>

      {step === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">What actually interests you?</h2>
          <p className="mt-1 text-sm text-muted">
            Pick as many as apply. Choose what you find interesting, not what you think you should
            say — the whole point is to score against your real preferences.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {interestOptions.map((option) => {
              const active = interests.includes(option.value);
              return (
                <li key={option.value}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleInterest(option.value)}
                    className={cx(
                      "rounded-full border px-3.5 py-2 text-sm transition-colors",
                      active
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "hover:border-brand-400 hover:bg-[var(--surface-raised)]",
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <h2 className="text-lg font-semibold">What kind of work suits you?</h2>
          <p className="mt-1 text-sm text-muted">Pick the one that fits best.</p>
          <ul className="mt-4 space-y-2">
            {WORK_STYLES.map((style) => (
              <li key={style.value}>
                <label
                  className={cx(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                    workStyle === style.value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "hover:bg-[var(--surface-raised)]",
                  )}
                >
                  <input
                    type="radio"
                    name="workStyle"
                    value={style.value}
                    checked={workStyle === style.value}
                    onChange={() => setWorkStyle(style.value)}
                    className="mt-1 size-4 accent-brand-600"
                  />
                  <span>
                    <span className="block font-medium">{style.label}</span>
                    <span className="block text-sm text-muted">{style.detail}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {step === 2 ? (
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold">How long are you willing to study?</h2>
            <ul className="mt-3 space-y-2">
              {STUDY_APPETITE.map((option) => (
                <li key={option.value}>
                  <label
                    className={cx(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      studyAppetite === option.value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "hover:bg-[var(--surface-raised)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="studyAppetite"
                      checked={studyAppetite === option.value}
                      onChange={() => setStudyAppetite(option.value)}
                      className="mt-1 size-4 accent-brand-600"
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-sm text-muted">{option.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">What can you spend on education or training?</h2>
            <p className="mt-1 text-sm text-muted">
              Total, across the whole path. This is the single filter that changes recommendations
              most — an honest low number gets you better advice than an aspirational high one.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {BUDGETS.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    aria-pressed={budget === option.value}
                    onClick={() => setBudget(option.value)}
                    className={cx(
                      "rounded-full border px-3.5 py-2 text-sm transition-colors",
                      budget === option.value
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "hover:border-brand-400",
                    )}
                  >
                    {option.label}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="space-y-4">
          <Card>
            <h2 className="text-lg font-semibold">What matters most about the money?</h2>
            <ul className="mt-3 space-y-2">
              {INCOME_PRIORITY.map((option) => (
                <li key={option.value}>
                  <label
                    className={cx(
                      "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                      incomePriority === option.value ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20" : "hover:bg-[var(--surface-raised)]",
                    )}
                  >
                    <input
                      type="radio"
                      name="incomePriority"
                      checked={incomePriority === option.value}
                      onChange={() => setIncomePriority(option.value)}
                      className="mt-1 size-4 accent-brand-600"
                    />
                    <span>
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-sm text-muted">{option.detail}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">Anything else that matters?</h2>
            <div className="mt-3 space-y-3">
              {[
                { checked: wantsRemote, set: setWantsRemote, label: "I want to be able to work remotely" },
                { checked: wantsSelfEmployment, set: setWantsSelfEmployment, label: "I'd like to work for myself eventually" },
                { checked: wantsGovernment, set: setWantsGovernment, label: "I'm aiming for a government job" },
              ].map((option) => (
                <label key={option.label} className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    checked={option.checked}
                    onChange={(event) => option.set(event.target.checked)}
                    className="size-4 accent-brand-600"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>

            <div className="mt-4 border-t pt-3">
              <label htmlFor="risk" className="mb-1 block text-sm font-medium">
                How much risk are you comfortable with?
              </label>
              <select
                id="risk"
                value={riskTolerance}
                onChange={(event) => setRiskTolerance(event.target.value as "low" | "medium" | "high")}
                className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="low">Low — I want a safe, predictable path</option>
                <option value="medium">Medium — some uncertainty is fine</option>
                <option value="high">High — I'll take a competitive or uncertain route</option>
              </select>
            </div>
          </Card>
        </div>
      ) : null}

      {step === 4 && results ? (
        <div className="space-y-4">
          <Callout tone="info" title="How to read these">
            <p>
              The percentage is a fit score against your answers, not a prediction of success and
              not a psychological measurement. Read the reasons — they matter more than the number.
              A 72% with reasons you agree with beats an 88% built on something you don&rsquo;t care
              about.
            </p>
          </Callout>

          <ol className="space-y-3">
            {results.map((result, index) => (
              <Card as="li" key={result.careerSlug} className="relative">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-faint tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-semibold">
                        <Link href={`/careers/${result.careerSlug}`} className="hover:text-brand-600">
                          <span className="absolute inset-0" aria-hidden />
                          {result.name}
                        </Link>
                      </h3>
                    </div>
                    <p className="mt-0.5 text-xs text-faint">{result.groupName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold tabular-nums">{result.score}%</p>
                    <p className="text-xs text-faint">fit with your answers</p>
                  </div>
                </div>

                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${result.score}%` }} />
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-verified-700 dark:text-verified-100">
                      Why it&rsquo;s here
                    </h4>
                    <ul className="space-y-1 text-sm text-muted">
                      {result.reasons.map((reason) => (
                        <li key={reason} className="flex gap-2">
                          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-verified-600" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {result.gaps.length ? (
                    <div>
                      <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-estimate-700 dark:text-estimate-100">
                        What stands in the way
                      </h4>
                      <ul className="space-y-1 text-sm text-muted">
                        {result.gaps.map((gap) => (
                          <li key={gap} className="flex gap-2">
                            <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-estimate-600" />
                            {gap}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <p className="mt-3 border-t pt-2 text-sm tabular-nums text-muted">
                  Entry pay estimate:{" "}
                  <span className="font-medium text-[var(--text)]">
                    {formatMoneyRange(result.salaryEntryMin, result.salaryEntryMax, result.currencyCode)}
                  </span>
                </p>
              </Card>
            ))}
          </ol>

          {!signedIn ? (
            <Callout tone="info">
              <p>
                <Link href="/signup" className="font-medium underline">
                  Create a free account
                </Link>{" "}
                to save these results, build a roadmap from any of them, and get job matches scored
                against the same profile.
              </p>
            </Callout>
          ) : (
            <Callout tone="good">
              <p>
                Saved to your dashboard. Open any career above and choose &ldquo;Build my
                roadmap&rdquo; to turn it into a dated plan.
              </p>
            </Callout>
          )}

          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => { setResults(null); setStep(0); }}>
              Start over
            </Button>
            <Link
              href="/careers"
              className="inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-medium hover:bg-[var(--surface-raised)]"
            >
              Browse all careers
            </Link>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Callout tone="danger">
            <p>{error}</p>
          </Callout>
        </div>
      ) : null}

      {step < 4 ? (
        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0}>
            Back
          </Button>
          {step === 3 ? (
            <Button onClick={run} disabled={busy} size="lg">
              {busy ? "Scoring…" : "See my results"}
            </Button>
          ) : (
            <Button onClick={() => setStep((value) => value + 1)} disabled={!canAdvance} size="lg">
              Next
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
