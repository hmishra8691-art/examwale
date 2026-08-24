"use client";

import Link from "next/link";
import { useState } from "react";
import { Button, Callout, Card, cx } from "@/components/ui";
import { ProviderNote, ScoreDial, ScoreRow } from "@/components/ai-ui";
import type { Citation, InterviewFeedback, InterviewQuestion } from "@/db/schema";

type TargetOption = { slug: string; label: string };

const ROUNDS = [
  { value: "MIXED", label: "Full mock", blurb: "Everything, in panel order" },
  { value: "HR", label: "HR round", blurb: "Motivation, fit, gaps" },
  { value: "TECHNICAL", label: "Technical", blurb: "What the role actually uses" },
  { value: "BEHAVIOURAL", label: "Behavioural", blurb: "Past situations and conflict" },
] as const;

const CATEGORY_LABEL: Record<InterviewQuestion["category"], string> = {
  OPENER: "Opener",
  TECHNICAL: "Technical",
  BEHAVIOURAL: "Behavioural",
  SITUATIONAL: "Situational",
  MOTIVATION: "Motivation",
  CLOSING: "Closing",
};

const DIFFICULTY_STYLE: Record<InterviewQuestion["difficulty"], string> = {
  WARM_UP: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  STANDARD: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100",
  STRETCH: "bg-estimate-50 text-estimate-700 dark:bg-estimate-600/15 dark:text-estimate-100",
};

type Session = {
  id: string | null;
  label: string;
  questions: InterviewQuestion[];
  citations: Citation[];
  provider: string;
  grounded: boolean;
};

export function InterviewWorkspace({ targets }: { targets: TargetOption[] }) {
  const [targetSlug, setTargetSlug] = useState("");
  const [round, setRound] = useState<(typeof ROUNDS)[number]["value"]>("MIXED");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [answers, setAnswers] = useState<Record<number, InterviewFeedback>>({});

  async function start(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setAnswers({});
    try {
      const response = await fetch("/api/v1/ai/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetSlug: targetSlug || null, round, count: 6 }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't build a practice set just now.");
        return;
      }
      setSession(body.data);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const answered = Object.keys(answers).length;
  const averageScore = answered
    ? Math.round(
        Object.values(answers).reduce((sum, feedback) => sum + feedback.score, 0) / answered,
      )
    : null;

  return (
    <div className="space-y-6">
      <Card>
        <form onSubmit={start} className="space-y-5">
          <div>
            <label htmlFor="interview-target" className="mb-1.5 block text-sm font-medium">
              Role you&rsquo;re interviewing for
            </label>
            <select
              id="interview-target"
              value={targetSlug}
              onChange={(event) => setTargetSlug(event.target.value)}
              className="w-full max-w-md rounded-xl border bg-[var(--surface)] px-3.5 py-2.5 text-sm outline-none focus:border-brand-500"
            >
              <option value="">General interview — no specific role</option>
              {targets.map((option) => (
                <option key={option.slug} value={option.slug}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-faint">
              With a role selected, the questions are built from that role&rsquo;s guide — the
              day-to-day work, the licensing, the part people find hardest. Without one you get the
              general set.
            </p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Round</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {ROUNDS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRound(option.value)}
                  aria-pressed={round === option.value}
                  className={cx(
                    "rounded-xl border px-3.5 py-3 text-left transition-colors",
                    round === option.value
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-900/25"
                      : "hover:bg-[var(--surface-raised)]",
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-muted">{option.blurb}</span>
                </button>
              ))}
            </div>
          </fieldset>

          {error ? (
            <Callout tone="danger" title="That didn't work">
              <p>{error}</p>
            </Callout>
          ) : null}

          <Button type="submit" disabled={busy}>
            {busy ? "Building questions…" : session ? "New question set" : "Start practising"}
          </Button>
        </form>
      </Card>

      {session ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-[var(--surface-raised)] px-4 py-3">
            <div>
              <p className="text-sm font-medium">{session.label}</p>
              <p className="text-xs text-muted">
                {answered} of {session.questions.length} answered
                {averageScore !== null ? ` · average ${averageScore}/100` : ""}
              </p>
            </div>
            {!session.grounded ? (
              <p className="max-w-md text-xs text-faint">
                No published guide for that target, so these are general questions rather than
                role-specific ones.
              </p>
            ) : null}
          </div>

          <ol className="space-y-4">
            {session.questions.map((question) => (
              <QuestionCard
                key={question.index}
                sessionId={session.id}
                question={question}
                feedback={answers[question.index] ?? null}
                onGraded={(feedback) =>
                  setAnswers((current) => ({ ...current, [question.index]: feedback }))
                }
              />
            ))}
          </ol>

          {session.citations.length ? (
            <Card>
              <h2 className="mb-2 text-sm font-medium">Built from these guides</h2>
              <ul className="flex flex-wrap gap-2">
                {session.citations.map((citation) => (
                  <li key={citation.slug}>
                    <Link
                      href={`/careers/${citation.slug}`}
                      className="rounded-full border px-3 py-1 text-xs hover:border-brand-400"
                    >
                      {citation.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function QuestionCard({
  sessionId,
  question,
  feedback,
  onGraded,
}: {
  sessionId: string | null;
  question: InterviewQuestion;
  feedback: InterviewFeedback | null;
  onGraded: (feedback: InterviewFeedback) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>("");

  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const seconds = Math.round((words / 130) * 60);

  async function submit() {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/ai/interview/${sessionId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionIndex: question.index, answer: answer.trim() }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body?.error?.message ?? "Couldn't grade that just now.");
        return;
      }
      setProvider(body.data.provider);
      onGraded(body.data.feedback);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="li">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700 dark:bg-ink-800 dark:text-ink-200">
              Q{question.index + 1}
            </span>
            <span className="rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-700 dark:bg-ink-800 dark:text-ink-200">
              {CATEGORY_LABEL[question.category]}
            </span>
            <span
              className={cx(
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                DIFFICULTY_STYLE[question.difficulty],
              )}
            >
              {question.difficulty.replace("_", " ").toLowerCase()}
            </span>
            {feedback ? (
              <span className="rounded-md bg-verified-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-verified-700 dark:bg-verified-700/15 dark:text-verified-100">
                {feedback.score}/100
              </span>
            ) : null}
          </div>
          <p className="text-[15px] font-medium leading-relaxed">{question.question}</p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
            <span className="font-medium">What they&rsquo;re testing:</span> {question.probing}
          </p>
        </div>
      </div>

      <details className="mt-3 rounded-xl bg-[var(--surface-raised)] p-3">
        <summary className="cursor-pointer text-sm font-medium">
          Structure to hang your answer on
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-muted">
          {question.skeleton.map((beat, index) => (
            <li key={index}>{beat}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-faint">
          This is a shape, not a script. Memorised answers sound memorised.
        </p>
      </details>

      {!open && !feedback ? (
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Answer this one
        </Button>
      ) : null}

      {open || feedback ? (
        <div className="mt-4">
          <label htmlFor={`answer-${question.index}`} className="mb-1.5 block text-sm font-medium">
            Your answer
          </label>
          <textarea
            id={`answer-${question.index}`}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            rows={6}
            placeholder="Write it as you'd say it out loud. Rough is fine — that's what's being fixed."
            className="w-full resize-y rounded-xl border bg-[var(--surface)] px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-faint focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10"
          />
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-faint">
            <span>
              {words} words{words > 20 ? ` · about ${seconds}s spoken` : ""}
            </span>
            {words > 0 && words < 40 ? <span>Too short to grade meaningfully.</span> : null}
          </div>

          {error ? (
            <p className="mt-2 text-sm text-red-700 dark:text-red-300">{error}</p>
          ) : null}

          <Button
            size="sm"
            className="mt-3"
            onClick={submit}
            disabled={busy || words < 10 || !sessionId}
          >
            {busy ? "Grading…" : feedback ? "Grade again" : "Get feedback"}
          </Button>
        </div>
      ) : null}

      {feedback ? <Feedback feedback={feedback} provider={provider} /> : null}
    </Card>
  );
}

function Feedback({ feedback, provider }: { feedback: InterviewFeedback; provider: string }) {
  return (
    <div className="mt-5 rounded-xl border p-4">
      <ScoreDial
        score={feedback.score}
        label="Answer score"
        caption="Weighted from the five components below."
        size={92}
      />

      <ul className="mt-4 divide-y">
        {feedback.rubric.map((row) => (
          <ScoreRow key={row.key} label={row.label} score={row.score} comment={row.comment} />
        ))}
      </ul>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-verified-700 dark:text-verified-200">
            Working
          </p>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted">
            {feedback.strengths.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-estimate-700 dark:text-estimate-200">
            Not working
          </p>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted">
            {feedback.gaps.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
          Your answer, rewritten
        </p>
        <p className="whitespace-pre-wrap rounded-xl bg-[var(--surface-raised)] p-3 text-[13.5px] leading-relaxed">
          {feedback.improvedAnswer}
        </p>
      </div>

      {feedback.followUps.length ? (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
            They would follow up with
          </p>
          <ul className="list-disc space-y-1 pl-4 text-[13px] leading-relaxed text-muted">
            {feedback.followUps.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <ProviderNote provider={provider}>
        A score here is a measure of how the answer is built, not of whether you would be hired.
      </ProviderNote>
    </div>
  );
}
