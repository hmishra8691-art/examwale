import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Confidence badge — the product's core honesty affordance.
// ---------------------------------------------------------------------------

const CONFIDENCE_STYLES = {
  VERIFIED: {
    label: "Verified",
    className:
      "bg-verified-50 text-verified-700 dark:bg-verified-700/15 dark:text-verified-100 ring-verified-600/25",
    hint: "Checked against an official source on the date shown.",
  },
  ESTIMATED: {
    label: "Estimate",
    className:
      "bg-estimate-50 text-estimate-700 dark:bg-estimate-600/15 dark:text-estimate-100 ring-estimate-600/25",
    hint: "A range gathered for planning, not a quoted figure.",
  },
  // The enum value stays because rows in the database still carry it. Nothing
  // new is ever labelled this way: the generated content it described is gone.
  AI_JUDGEMENT: {
    label: "Generated",
    className:
      "bg-judgement-50 text-judgement-700 dark:bg-judgement-600/15 dark:text-judgement-100 ring-judgement-600/25",
    hint: "Written by a model before that was removed. Never verified against a source — treat it as a claim, not a fact.",
  },
  UNVERIFIED: {
    label: "Unverified",
    className: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200 ring-ink-400/25",
    hint: "In the system but not yet reviewed against a source.",
  },
} as const;

export function ConfidenceBadge({
  level,
  size = "sm",
}: {
  level: keyof typeof CONFIDENCE_STYLES;
  size?: "xs" | "sm";
}) {
  const style = CONFIDENCE_STYLES[level] ?? CONFIDENCE_STYLES.UNVERIFIED;
  return (
    <span
      title={style.hint}
      className={cx(
        "inline-flex items-center gap-1 rounded-full font-medium ring-1 ring-inset whitespace-nowrap",
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        style.className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-70" />
      {style.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "brand" | "saffron" | "good" | "warn" | "bad";
  className?: string;
}) {
  const tones = {
    neutral: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100",
    saffron: "bg-saffron-50 text-saffron-800 dark:bg-saffron-600/20 dark:text-saffron-100",
    good: "bg-verified-50 text-verified-700 dark:bg-verified-700/20 dark:text-verified-100",
    warn: "bg-estimate-50 text-estimate-700 dark:bg-estimate-600/20 dark:text-estimate-100",
    bad: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type ButtonBase = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  full?: boolean;
};

function buttonClass({ variant = "primary", size = "md", full }: ButtonBase): string {
  /*
    The disabled primary used to be white text on `ink-300` — 2.0:1, which is
    below any legible threshold and read as a broken control rather than an
    inactive one. A disabled button still has to be readable: the user needs to
    know what it will do once they have filled the field in. It now keeps its
    shape and drops to muted text on a sunken ground, at 4.1:1.
  */
  const variants = {
    primary:
      "bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 " +
      "disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-faint)] disabled:border disabled:border-[var(--border)]",
    secondary:
      "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-raised)] hover:border-[var(--border-strong)]",
    ghost: "text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
    danger: "bg-alert-600 text-white hover:bg-alert-700",
  };
  /*
    Heights, not just padding. 44px is the touch target floor a thumb needs,
    and padding alone does not guarantee it once a button holds an icon and no
    label. `sm` is exempt because it only ever appears in dense desktop
    toolbars where a pointer is doing the work.

    Active scale is 0.98 rather than a colour change: on a phone the finger
    covers the button, so the feedback has to be visible at the edges.
  */
  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-lg gap-1.5",
    md: "min-h-11 px-4 py-2.5 text-sm rounded-xl gap-2",
    lg: "min-h-12 px-5 py-3 text-base rounded-xl gap-2",
  };
  return cx(
    "inline-flex items-center justify-center font-medium disabled:cursor-not-allowed",
    "transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]",
    variants[variant],
    sizes[size],
    full && "w-full",
  );
}

export function Button({
  variant,
  size,
  full,
  className,
  ...props
}: ButtonBase & ComponentProps<"button">) {
  return <button {...props} className={cx(buttonClass({ variant, size, full }), className)} />;
}

export function ButtonLink({
  variant,
  size,
  full,
  className,
  ...props
}: ButtonBase & ComponentProps<typeof Link>) {
  return <Link {...props} className={cx(buttonClass({ variant, size, full }), className)} />;
}

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return <Tag className={cx("card p-5", className)}>{children}</Tag>;
}

export function SectionHeading({
  title,
  description,
  action,
  id,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    /*
      The display face belongs here, not only on the pages that remembered to
      ask for it. Most section titles in the product come through this
      component, so setting it once is what makes the type feel like one
      decision rather than a per-page preference.
    */
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          className="font-display text-xl font-bold sm:text-[1.6rem]"
        >
          {title}
        </h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * Summary-first pattern: every complex page opens with the short version and
 * puts the detail below, per the product's UX requirement.
 */
export function SummaryPanel({
  eyebrow,
  title,
  points,
  footer,
}: {
  eyebrow?: string;
  title: string;
  points: { label: string; value: ReactNode }[];
  footer?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-brand-200 bg-brand-50/60 p-5 dark:border-brand-800 dark:bg-brand-900/20">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="mt-1 text-base font-semibold sm:text-lg">{title}</h2>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {points.map((point) => (
          <div key={point.label}>
            <dt className="text-xs uppercase tracking-wide text-muted">{point.label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{point.value}</dd>
          </div>
        ))}
      </dl>
      {footer ? <div className="mt-4 border-t border-brand-200 pt-3 text-sm dark:border-brand-800">{footer}</div> : null}
    </section>
  );
}

export function Meter({
  label,
  index,
  max = 4,
  tone = "brand",
}: {
  label: string;
  index: number;
  max?: number;
  tone?: "brand" | "warn" | "good";
}) {
  const tones = { brand: "bg-brand-500", warn: "bg-saffron-500", good: "bg-verified-600" };
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-0.5" role="img" aria-label={`${label}: ${index + 1} of ${max + 1}`}>
        {Array.from({ length: max + 1 }).map((_, position) => (
          <span
            key={position}
            className={cx(
              "h-1.5 w-4 rounded-full",
              position <= index ? tones[tone] : "bg-ink-200 dark:bg-ink-700",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div>
      {label ? (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{label}</span>
          <span className="tabular-nums font-medium">{clamped}%</span>
        </div>
      ) : null}
      <div
        className="h-2 overflow-hidden rounded-full bg-ink-100 dark:bg-ink-800"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? "Progress"}
      >
        <div
          className="h-full rounded-full bg-brand-500 transition-[width] duration-500"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-ink-400">{icon}</div> : null}
      <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "danger" | "good";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-brand-200 bg-brand-50/70 dark:border-brand-800 dark:bg-brand-900/20",
    warn: "border-estimate-600/30 bg-estimate-50 dark:border-estimate-600/40 dark:bg-estimate-600/10",
    danger: "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20",
    good: "border-verified-600/30 bg-verified-50 dark:border-verified-600/40 dark:bg-verified-700/10",
  };
  return (
    <div className={cx("rounded-md border p-4 text-sm", tones[tone])}>
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-[13.5px] leading-relaxed">{children}</div>
    </div>
  );
}

/** Provenance line shown under any sourced fact. */
export function SourceNote({
  sourceName,
  sourceUrl,
  lastVerifiedAt,
  fallback = "Not yet verified against a source.",
}: {
  sourceName?: string | null;
  sourceUrl?: string | null;
  lastVerifiedAt?: Date | string | null;
  fallback?: string;
}) {
  if (!sourceName) {
    return <p className="text-xs text-faint">{fallback}</p>;
  }
  const date = lastVerifiedAt
    ? new Date(lastVerifiedAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;
  return (
    <p className="text-xs text-faint">
      Source:{" "}
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">
          {sourceName}
        </a>
      ) : (
        sourceName
      )}
      {date ? ` · last checked ${date}` : null}
    </p>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const tones = {
    good: "text-verified-700 dark:text-verified-100",
    warn: "text-estimate-700 dark:text-estimate-100",
    bad: "text-red-700 dark:text-red-300",
  };
  return (
    <div className="card p-4">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className={cx("mt-1 text-xl font-semibold tabular-nums", tone && tones[tone])}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-faint">{hint}</p> : null}
    </div>
  );
}

export function Pill({ children, active }: { children: ReactNode; active?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-brand-500 bg-brand-500 text-white"
          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]",
      )}
    >
      {children}
    </span>
  );
}
