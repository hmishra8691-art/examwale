import { cx } from "@/components/ui";

const KIND_STYLE: Record<string, { label: string; dot: string; chip: string }> = {
  education: {
    label: "Education",
    dot: "bg-brand-500",
    chip: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
  },
  exam: {
    label: "Exam",
    dot: "bg-saffron-500",
    chip: "bg-saffron-50 text-saffron-800 dark:bg-saffron-900/40 dark:text-saffron-100",
  },
  skill: {
    label: "Skill",
    dot: "bg-judgement-600",
    chip: "bg-judgement-50 text-judgement-700 dark:bg-judgement-600/25 dark:text-judgement-100",
  },
  job: {
    label: "Work",
    dot: "bg-verified-600",
    chip: "bg-verified-50 text-verified-700 dark:bg-verified-700/25 dark:text-verified-100",
  },
  finance: {
    label: "Money",
    dot: "bg-estimate-600",
    chip: "bg-estimate-50 text-estimate-700 dark:bg-estimate-600/25 dark:text-estimate-100",
  },
  milestone: {
    label: "Milestone",
    dot: "bg-ink-400",
    chip: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
  },
};

export type VisualStep = {
  title: string;
  description?: string;
  kind: string;
  meta?: string;
};

/**
 * Vertical stepper. Deliberately vertical rather than horizontal: these paths
 * run to eight or ten steps, and a horizontal flow forces sideways scrolling on
 * exactly the phone screens most of these readers are using.
 */
export function RoadmapVisual({ steps }: { steps: VisualStep[] }) {
  if (!steps.length) return null;

  return (
    <ol className="relative space-y-3">
      <div aria-hidden className="absolute bottom-4 left-[15px] top-4 w-0.5 bg-[var(--border)]" />
      {steps.map((step, index) => {
        const style = KIND_STYLE[step.kind] ?? KIND_STYLE.milestone;
        return (
          <li key={`${step.title}-${index}`} className="relative flex gap-4">
            <span
              aria-hidden
              className={cx(
                "relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white",
                style.dot,
              )}
            >
              {index + 1}
            </span>
            <div className="card min-w-0 flex-1 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">{step.title}</h3>
                <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", style.chip)}>
                  {style.label}
                </span>
                {step.meta ? <span className="text-xs text-faint">· {step.meta}</span> : null}
              </div>
              {step.description ? (
                <p className="mt-1 text-sm text-muted">{step.description}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
