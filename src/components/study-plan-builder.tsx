"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Card } from "@/components/ui";
import type { Feasibility, StudyPlanShape } from "@/db/schema";

const VERDICT_TONE: Record<Feasibility["verdict"], "good" | "warn" | "danger"> = {
  ACHIEVABLE: "good",
  DIFFICULT: "warn",
  NEEDS_ADJUSTMENT: "warn",
  HIGHLY_UNLIKELY: "danger",
};

const VERDICT_LABEL: Record<Feasibility["verdict"], string> = {
  ACHIEVABLE: "This looks achievable",
  DIFFICULT: "Tight, but possible",
  NEEDS_ADJUSTMENT: "The numbers need adjusting",
  HIGHLY_UNLIKELY: "Not realistic on this timeline",
};

export function StudyPlanBuilder({
  examSlug,
  examName,
  signedIn,
}: {
  examSlug: string;
  examName: string;
  signedIn: boolean;
}) {
  const [hoursPerDay, setHoursPerDay] = useState("4");
  const [targetDate, setTargetDate] = useState(() => {
    const date = new Date();
    date.setMonth(date.getMonth() + 8);
    return date.toISOString().slice(0, 10);
  });
  const [result, setResult] = useState<{
    plan: StudyPlanShape;
    feasibility: Feasibility;
    guidanceNote?: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/exams/${examSlug}/study-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hoursPerDay: Number(hoursPerDay),
          targetDate,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't build a plan just now.");
        return;
      }
      setResult(body.data);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <form onSubmit={generate} className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="hours" className="mb-1 block text-xs font-medium text-muted">
              Hours you can study per day
            </label>
            <input
              id="hours"
              type="number"
              min="0.5"
              max="16"
              step="0.5"
              value={hoursPerDay}
              onChange={(event) => setHoursPerDay(event.target.value)}
              className="w-32 rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
              required
            />
          </div>
          <div>
            <label htmlFor="target" className="mb-1 block text-xs font-medium text-muted">
              Target exam date
            </label>
            <input
              id="target"
              type="date"
              value={targetDate}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setTargetDate(event.target.value)}
              className="rounded-lg border bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-brand-500"
              required
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Working it out…" : "Build my plan"}
          </Button>
        </form>

        

        <p className="mt-3 text-xs text-faint">
          We estimate the workload from the syllabus on this page, at roughly six focused hours per
          weight unit, plus 25% for revision and 15% for practice. It&rsquo;s an estimate — your
          existing knowledge changes it substantially.
        </p>
      </Card>

      {error ? (
        <Callout tone="danger">
          <p>{error}</p>
        </Callout>
      ) : null}

      {result ? (
        <div className="space-y-4">
          <Callout tone={VERDICT_TONE[result.feasibility.verdict]} title={VERDICT_LABEL[result.feasibility.verdict]}>
            <p>{result.feasibility.note}</p>
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-70">This syllabus needs</dt>
                <dd className="font-semibold tabular-nums">
                  ~{result.feasibility.impliedHoursPerWeek} hrs/week
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-70">You have</dt>
                <dd className="font-semibold tabular-nums">
                  ~{result.feasibility.availableHoursPerWeek} hrs/week
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide opacity-70">Total workload</dt>
                <dd className="font-semibold tabular-nums">
                  ~{result.plan.totalHours.toLocaleString("en-IN")} hrs
                </dd>
              </div>
            </dl>
          </Callout>

          {/*
            Only ever true for a plan saved before the written commentary was
            removed. Nothing produces a narrative now; this renders the ones
            already in the database rather than dropping them silently, and the
            badge says plainly where the text came from.
          */}
          {result.plan.narrative ? (
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">How to approach this</h3>
                <span className="rounded-md bg-judgement-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-judgement-700 dark:bg-judgement-600/15 dark:text-judgement-100">
                  AI judgement
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">{result.plan.narrative.approach}</p>
              {result.plan.narrative.pitfalls.length ? (
                <>
                  <h4 className="mt-4 text-sm font-medium">What usually goes wrong</h4>
                  <ul className="mt-1.5 space-y-1.5 text-sm text-muted">
                    {result.plan.narrative.pitfalls.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-estimate-600" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              <p className="mt-4 border-t pt-3 text-xs text-faint">
                The hours, the month split and the verdict above are calculated. This section is
                generated commentary over them and can be wrong — it cannot change any of the
                numbers.
              </p>
            </Card>
          ) : result.guidanceNote ? (
            <Callout tone="info">
              <p>{result.guidanceNote}</p>
            </Callout>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h3 className="mb-3 font-semibold">Month by month</h3>
              <ol className="space-y-3">
                {result.plan.months.map((month) => {
                  const note = result.plan.narrative?.months.find(
                    (entry) => entry.index === month.index,
                  );
                  return (
                    <li key={month.index} className="border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h4 className="text-sm font-medium">
                          Month {month.index} — {month.label}
                        </h4>
                        <span className="text-xs tabular-nums text-faint">~{month.hours} hrs</span>
                      </div>
                      <ul className="mt-1 flex flex-wrap gap-1.5">
                        {month.topics.slice(0, 8).map((topic) => (
                          <li
                            key={topic}
                            className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs"
                          >
                            {topic}
                          </li>
                        ))}
                        {month.topics.length > 8 ? (
                          <li className="px-2 py-0.5 text-xs text-faint">
                            +{month.topics.length - 8} more
                          </li>
                        ) : null}
                      </ul>
                      {note ? (
                        <div className="mt-2 rounded-lg bg-[var(--surface-raised)] px-3 py-2 text-[13px] leading-relaxed">
                          <p>{note.focus}</p>
                          <p className="mt-1 text-muted">
                            <span className="font-medium">Watch for: </span>
                            {note.watchFor}
                          </p>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </Card>

            <div className="space-y-4">
              <Card>
                <h3 className="mb-2 font-semibold">Weekly rhythm</h3>
                <ul className="space-y-2 text-sm">
                  {result.plan.weekly.map((day) => (
                    <li key={day.day}>
                      <p className="font-medium">{day.day}</p>
                      <p className="text-muted">
                        {day.focus} · {day.hours} hrs
                      </p>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h3 className="mb-2 font-semibold">Revision</h3>
                <ul className="space-y-1.5 text-sm text-muted">
                  {result.plan.revision.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <h3 className="mb-2 font-semibold">Mock tests</h3>
                <ul className="space-y-1.5 text-sm text-muted">
                  {result.plan.mocks.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-saffron-500" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>

          {!signedIn ? (
            <Callout tone="info">
              <p>
                <Link href="/signup" className="font-medium underline">
                  Create a free account
                </Link>{" "}
                to save this plan for {examName}, track your progress through it, and get reminders
                as the date approaches.
              </p>
            </Callout>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
