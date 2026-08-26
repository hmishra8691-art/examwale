import type { ReactNode } from "react";
import { cx } from "@/components/ui";

/**
 * Shared display pieces for the guidance tools.
 *
 * Both the résumé review and the interview grader report a computed headline
 * score broken into weighted components. Rendering them the same way is not
 * only tidier — it makes the shared claim legible: the number is a sum of
 * stated parts, and every part is shown alongside it.
 */

function bandColour(score: number): { ring: string; text: string; bar: string } {
  if (score >= 80) {
    return {
      ring: "stroke-verified-600",
      text: "text-verified-700 dark:text-verified-100",
      bar: "bg-verified-600",
    };
  }
  if (score >= 55) {
    return {
      ring: "stroke-estimate-600",
      text: "text-estimate-700 dark:text-estimate-100",
      bar: "bg-estimate-600",
    };
  }
  return { ring: "stroke-red-500", text: "text-red-700 dark:text-red-300", bar: "bg-red-500" };
}

export function ScoreDial({
  score,
  label,
  caption,
  size = 120,
}: {
  score: number;
  label: string;
  caption?: string;
  size?: number;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const colour = bandColour(clamped);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            className="stroke-ink-100 dark:stroke-ink-800"
          />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={cx(colour.ring, "transition-[stroke-dashoffset] duration-700")}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className={cx("text-2xl font-semibold tabular-nums", colour.text)}>{clamped}</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="font-medium">{label}</p>
        {caption ? <p className="mt-1 text-sm text-muted">{caption}</p> : null}
      </div>
    </div>
  );
}

export function ScoreRow({
  label,
  score,
  comment,
}: {
  label: string;
  score: number;
  comment: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const colour = bandColour(clamped);

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className={cx("text-sm font-semibold tabular-nums", colour.text)}>{clamped}</span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className={cx("h-full rounded-full transition-[width] duration-700", colour.bar)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{comment}</p>
    </li>
  );
}

const PRIORITY_STYLE = {
  HIGH: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200",
  MEDIUM: "bg-estimate-50 text-estimate-700 dark:bg-estimate-600/15 dark:text-estimate-100",
  LOW: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
} as const;

export function PriorityTag({ priority }: { priority: keyof typeof PRIORITY_STYLE }) {
  return (
    <span
      className={cx(
        "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        PRIORITY_STYLE[priority],
      )}
    >
      {priority}
    </span>
  );
}

/**
 * Says where an output came from.
 *
 * Shown on every generated panel, not only when something went wrong. A user
 * reading advice about their career deserves to know whether a model wrote it
 * or a rule did, without having to notice the absence of a badge.
 */
/**
 * What produced this, and what it cannot do.
 *
 * This used to say whether the commentary came from a model or from the
 * rulebook, because both were possible and the reader deserved to know which
 * they were looking at. Only one is possible now, so the note has a different
 * job: it states that the numbers are computed, and it points at the person who
 * can answer the question the numbers cannot.
 */
export function RulebookNote({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-4 border-t pt-3 text-xs text-faint">
      Every score and comment here is computed from your text by a stated
      rulebook — the same input always produces the same output, which is what
      makes two drafts worth comparing.
      {children ? <> {children}</> : null}
    </p>
  );
}

export function ToolShell({
  eyebrow,
  title,
  intro,
  children,
  aside,
  meta,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: ReactNode;
  aside?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="page page-measure py-10">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
          {eyebrow}
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {title}
        </h1>
        <p className="mt-3 text-muted">{intro}</p>
        {meta ? <div className="mt-3">{meta}</div> : null}
      </header>
      {aside ? <div className="mt-6">{aside}</div> : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}
