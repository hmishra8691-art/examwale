"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { cx } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

type Step = {
  id: string;
  sequence: number;
  title: string;
  description: string;
  kind: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "DONE";
  targetDate: string | null;
  refType: string | null;
  refSlug: string | null;
};

const NEXT_STATUS: Record<Step["status"], Step["status"]> = {
  NOT_STARTED: "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE: "NOT_STARTED",
};

const STATUS_LABEL: Record<Step["status"], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

const KIND_CHIP: Record<string, string> = {
  education: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
  exam: "bg-saffron-50 text-saffron-800 dark:bg-saffron-900/40 dark:text-saffron-100",
  skill: "bg-judgement-50 text-judgement-700 dark:bg-judgement-600/25 dark:text-judgement-100",
  job: "bg-verified-50 text-verified-700 dark:bg-verified-700/25 dark:text-verified-100",
  finance: "bg-estimate-50 text-estimate-700 dark:bg-estimate-600/25 dark:text-estimate-100",
  milestone: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
};

export function RoadmapSteps({ steps: initialSteps }: { steps: Step[] }) {
  const router = useRouter();
  const [steps, setSteps] = useState(initialSteps);
  const [pending, setPending] = useState<string | null>(null);

  async function cycle(step: Step) {
    const next = NEXT_STATUS[step.status];
    setPending(step.id);
    setSteps((current) =>
      current.map((item) => (item.id === step.id ? { ...item, status: next } : item)),
    );

    try {
      const response = await fetch(`/api/v1/roadmaps/steps/${step.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!response.ok) {
        // Roll back the optimistic update rather than leaving the UI lying.
        setSteps((current) =>
          current.map((item) => (item.id === step.id ? { ...item, status: step.status } : item)),
        );
      } else {
        router.refresh();
      }
    } catch {
      setSteps((current) =>
        current.map((item) => (item.id === step.id ? { ...item, status: step.status } : item)),
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <ol className="relative space-y-3">
      <div aria-hidden className="absolute bottom-4 left-[15px] top-4 w-0.5 bg-[var(--border)]" />
      {steps.map((step) => (
        <li key={step.id} className="relative flex gap-4">
          <button
            type="button"
            onClick={() => cycle(step)}
            disabled={pending === step.id}
            aria-label={`${step.title} — currently ${STATUS_LABEL[step.status]}. Click to change.`}
            className={cx(
              "relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border-2 transition-colors",
              step.status === "DONE"
                ? "border-verified-700 bg-verified-700 text-white"
                : step.status === "IN_PROGRESS"
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                  : "border-[var(--border)] bg-[var(--surface)] text-faint hover:border-brand-400",
            )}
          >
            {step.status === "DONE" ? (
              <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden>
                <path d="M3 8.5l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <span className="text-xs font-bold">{step.sequence}</span>
            )}
          </button>

          <div
            className={cx(
              "card min-w-0 flex-1 p-4 transition-opacity",
              step.status === "DONE" && "opacity-65",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={cx("text-sm font-semibold", step.status === "DONE" && "line-through")}>
                {step.title}
              </h3>
              <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", KIND_CHIP[step.kind] ?? KIND_CHIP.milestone)}>
                {step.kind}
              </span>
              {step.targetDate ? (
                <span className="text-xs text-faint">by {formatDate(step.targetDate)}</span>
              ) : null}
            </div>
            {step.description ? <p className="mt-1 text-sm text-muted">{step.description}</p> : null}
            {step.refType === "exam" && step.refSlug ? (
              <Link href={`/exams/${step.refSlug}`} className="mt-2 inline-block text-sm text-brand-600 underline">
                Open the exam guide →
              </Link>
            ) : null}
            <p className="mt-2 text-xs text-faint">
              {STATUS_LABEL[step.status]} · click the circle to change
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
