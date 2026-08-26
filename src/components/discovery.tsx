/**
 * Discovery components.
 *
 * The product's job is to let somebody arrive without knowing what they want
 * and leave with three careers, an exam deadline and a saved job. These are the
 * pieces that do that work: the card you scan, the meter that tells you why it
 * was suggested, the countdown that makes a deadline feel real.
 *
 * Two rules run through all of them.
 *
 * Nothing here invents a number. A match percentage comes from `scoreCareers`,
 * a deadline from the exam row, a difficulty from the selection-step count. If
 * a value is an estimate it is labelled as one — the confidence colours exist
 * precisely so a computed figure and a planning figure cannot be confused, and
 * making the surface more exciting is not a reason to blur that.
 *
 * And every one of them is a *link to somewhere*, not an ornament. A card that
 * animates but does not lead anywhere is the thing that makes a product feel
 * like a demo.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";

/* ── Category identity ─────────────────────────────────────────────────── */

/**
 * One hue per content type, used everywhere that type appears.
 *
 * This is a mapping people learn without being told: after three screens, a
 * saffron chip means "exam" whether it turns up in search, on a roadmap or in
 * a saved list. That only works if it is defined once and never overridden
 * locally, so the accent classes live here rather than at the call sites.
 */
export type Category = "career" | "exam" | "job" | "course" | "mentor" | "service";

export const CATEGORY: Record<
  Category,
  { label: string; chip: string; dot: string; ring: string }
> = {
  career: {
    label: "Career",
    chip: "bg-brand-50 text-brand-700 dark:bg-brand-600/20 dark:text-brand-100",
    dot: "bg-brand-500",
    ring: "group-hover:border-brand-400/70",
  },
  exam: {
    label: "Exam",
    chip: "bg-saffron-50 text-saffron-800 dark:bg-saffron-600/20 dark:text-saffron-100",
    dot: "bg-saffron-500",
    ring: "group-hover:border-saffron-400/70",
  },
  job: {
    label: "Job",
    chip: "bg-accent-50 text-accent-800 dark:bg-accent-500/20 dark:text-accent-100",
    dot: "bg-accent-500",
    ring: "group-hover:border-accent-400/70",
  },
  course: {
    label: "Course",
    chip: "bg-judgement-50 text-judgement-700 dark:bg-judgement-600/20 dark:text-judgement-100",
    dot: "bg-judgement-600",
    ring: "group-hover:border-judgement-400/70",
  },
  mentor: {
    label: "Mentor",
    chip: "bg-verified-50 text-verified-700 dark:bg-verified-700/20 dark:text-verified-100",
    dot: "bg-verified-600",
    ring: "group-hover:border-verified-400/70",
  },
  service: {
    label: "Service",
    chip: "bg-ink-100 text-ink-700 dark:bg-ink-800 dark:text-ink-200",
    dot: "bg-ink-500",
    ring: "group-hover:border-ink-400/70",
  },
};

/* ── Chips and tags ────────────────────────────────────────────────────── */

/**
 * A chip is something you press. A tag is something you read.
 *
 * They are deliberately similar — same family, same rhythm — but only the chip
 * takes hover and pressed states, so nothing invites a click that does nothing.
 */
export function Chip({
  children,
  active,
  as: Tag = "span",
  className,
  ...rest
}: {
  children: ReactNode;
  active?: boolean;
  as?: "span" | "button";
  className?: string;
} & Record<string, unknown>) {
  return (
    <Tag
      {...rest}
      {...(Tag === "button" ? { type: "button", "aria-pressed": Boolean(active) } : {})}
      data-active={active ? "true" : undefined}
      className={cx("chip", className)}
    >
      {children}
    </Tag>
  );
}

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx("tag", className)}>{children}</span>;
}

/* ── Match meter ───────────────────────────────────────────────────────── */

/**
 * "78% match" — but only where a real score exists.
 *
 * `reason` is required, not optional. A bare percentage is the kind of number
 * that looks authoritative and explains nothing; if we cannot say *why* the
 * score is what it is, we should not be showing it. It renders as the
 * accessible name too, so a screen reader hears the explanation rather than a
 * naked figure.
 */
export function MatchMeter({
  percent,
  reason,
  compact,
}: {
  percent: number;
  reason: string;
  compact?: boolean;
}) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="stack-safe">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cx("numeric font-bold", compact ? "text-sm" : "text-base")}>
          {value}%
        </span>
        {!compact ? (
          <span className="truncate text-xs text-faint" title={reason}>
            {reason}
          </span>
        ) : null}
      </div>
      <div
        className={cx("meter-track mt-1", compact ? "h-1" : "h-1.5")}
        role="img"
        aria-label={`${value}% match — ${reason}`}
      >
        <div className="meter-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/* ── Deadlines ─────────────────────────────────────────────────────────── */

/**
 * Days remaining, with urgency that escalates.
 *
 * A date is information; "closes in 6 days" is a reason to act, and that
 * difference is most of why an exam listing gets used or ignored. The tone
 * steps at 7 and 21 days rather than shading continuously, because a gradient
 * of urgency is not something anyone can read at a glance.
 *
 * `null` when there is no date — an absent deadline renders nothing rather
 * than "no deadline", which reads as "no deadline exists" when the truth is
 * usually "not announced yet".
 */
export function Countdown({ deadline, now }: { deadline: Date | string | null; now?: Date }) {
  if (!deadline) return null;
  const end = typeof deadline === "string" ? new Date(deadline) : deadline;
  if (Number.isNaN(end.getTime())) return null;

  const today = now ?? new Date();

  /*
    Closed is decided by the timestamp, not by the day count.

    `Math.ceil` of a small negative is -0, so a window that shut an hour ago
    computed `days === 0` and rendered "Closes today" in urgent red — telling
    somebody to hurry up and apply to a closed application. Compare the
    instants first; only then round to whole days for display.
  */
  const closed = end.getTime() <= today.getTime();
  const days = Math.ceil((end.getTime() - today.getTime()) / 86_400_000);

  if (closed) {
    return (
      <span className="tag bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300">Closed</span>
    );
  }
  const tone =
    days <= 7
      ? "bg-alert-50 text-alert-700 dark:bg-alert-500/20 dark:text-alert-100"
      : days <= 21
        ? "bg-saffron-50 text-saffron-800 dark:bg-saffron-600/20 dark:text-saffron-100"
        : "bg-verified-50 text-verified-700 dark:bg-verified-700/20 dark:text-verified-100";
  const label =
    days === 0 ? "Closes today" : days === 1 ? "1 day left" : `${days} days left`;

  return (
    <span className={cx("tag font-semibold", tone)}>
      {days <= 7 ? (
        <span aria-hidden className="size-1.5 rounded-full bg-current animate-pulse-dot" />
      ) : null}
      {label}
    </span>
  );
}

/* ── Difficulty ────────────────────────────────────────────────────────── */

/**
 * Difficulty as four dots rather than a word.
 *
 * Scannable in a card, and honest about being a coarse scale — nobody reads
 * three-of-four dots as a precise measurement, whereas "Difficulty: 7.5/10"
 * implies an accuracy the underlying data does not have.
 */
export function Difficulty({ level }: { level: 1 | 2 | 3 | 4 }) {
  const names = { 1: "Foundational", 2: "Moderate", 3: "Hard", 4: "Advanced" } as const;
  return (
    <span className="inline-flex items-center gap-1.5" title={`Difficulty: ${names[level]}`}>
      <span aria-hidden className="flex gap-0.5">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cx(
              "size-1.5 rounded-full",
              i <= level ? "bg-[var(--text-muted)]" : "bg-[var(--surface-inset)]",
            )}
          />
        ))}
      </span>
      <span className="text-xs text-muted">{names[level]}</span>
    </span>
  );
}

/* ── Loading ───────────────────────────────────────────────────────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("skeleton", className)} />;
}

/**
 * A skeleton shaped like the card it replaces.
 *
 * Generic grey boxes are barely better than a spinner. Matching the real
 * card's proportions is what stops the layout jumping when content lands,
 * which is the actual complaint behind "the page feels slow".
 */
export function DiscoveryCardSkeleton() {
  return (
    <div className="card p-4">
      <Skeleton className="h-4 w-16" />
      <Skeleton className="mt-3 h-5 w-3/4" />
      <Skeleton className="mt-2 h-4 w-1/2" />
      <div className="mt-4 flex gap-1.5">
        <Skeleton className="h-5 w-14" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-12" />
      </div>
    </div>
  );
}

/* ── Rails ─────────────────────────────────────────────────────────────── */

/**
 * A horizontal snap rail — the one place sideways scrolling is correct.
 *
 * It works here because the row is visibly a row, the thumb expects to swipe
 * it, and a peeking next card advertises that more exists. It is never used
 * for navigation, and never for content with no other route to it: everything
 * in a rail also lives on the section's index page, so a keyboard or
 * screen-reader user who does not swipe loses nothing.
 */
/**
 * `size` is a fixed set rather than a free string because Tailwind generates
 * classes by scanning source text: a class assembled at runtime — `"[&>li]:" +
 * width` — is never emitted, and the rail silently collapses to content width.
 */
const RAIL_SIZES = {
  sm: "[&>li]:w-[13.5rem]",
  md: "[&>li]:w-[17rem]",
  lg: "[&>li]:w-[21rem]",
} as const;

export function Rail({
  children,
  label,
  size = "md",
}: {
  children: ReactNode;
  label: string;
  size?: keyof typeof RAIL_SIZES;
}) {
  return (
    <ul
      className={cx("rail stagger", RAIL_SIZES[size])}
      aria-label={label}
      // A rail is a scroll container, so it needs to be reachable and
      // scrollable by keyboard alone.
      tabIndex={0}
    >
      {children}
    </ul>
  );
}

/* ── Stat tile ─────────────────────────────────────────────────────────── */

export function StatTile({
  value,
  label,
  hint,
  tone = "default",
}: {
  value: ReactNode;
  label: string;
  hint?: string;
  tone?: "default" | "brand" | "accent";
}) {
  const tones = {
    default: "",
    brand: "text-brand-ink",
    accent: "text-accent-ink",
  };
  return (
    <div className="stack-safe rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
      <p className={cx("numeric text-xl font-bold sm:text-2xl", tones[tone])}>{value}</p>
      <p className="mt-0.5 truncate text-xs font-medium text-muted">{label}</p>
      {hint ? <p className="mt-1 text-[11px] text-faint">{hint}</p> : null}
    </div>
  );
}

/* ── The discovery card ────────────────────────────────────────────────── */

/**
 * The unit the whole product is built from.
 *
 * One card shape serves careers, exams, jobs, courses and mentors, varying by
 * category colour and by which optional slots are filled. That uniformity is
 * the point: a user learns to read one card and can then scan a mixed search
 * result without re-learning anything.
 *
 * The whole card is clickable via a stretched link on the title, which keeps
 * exactly one link in the tab order — a card wrapped in an anchor with more
 * links inside it produces nested interactive elements and a confusing
 * keyboard path. `relative` on the article is what scopes the stretched link;
 * without a positioned ancestor it covers the entire document, which is a bug
 * this codebase has already shipped once.
 */
export function DiscoveryCard({
  href,
  category,
  title,
  subtitle,
  meta,
  tags,
  footer,
  accessory,
}: {
  href: string;
  category: Category;
  title: string;
  subtitle?: ReactNode;
  /** Short facts — salary, location, provider. Rendered as a wrapping row. */
  meta?: ReactNode[];
  tags?: string[];
  footer?: ReactNode;
  /** Top-right slot: a countdown, a match meter, a saved star. */
  accessory?: ReactNode;
}) {
  const cat = CATEGORY[category];
  return (
    <article
      className={cx(
        "card-interactive group relative flex h-full flex-col p-4",
        cat.ring,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className={cx("tag font-semibold", cat.chip)}>{cat.label}</span>
        {accessory}
      </div>

      <h3 className="mt-2.5 font-display text-base font-bold leading-snug">
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          {title}
        </Link>
      </h3>

      {subtitle ? <p className="mt-1 line-clamp-2 text-sm text-muted">{subtitle}</p> : null}

      {meta?.length ? (
        <dl className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          {meta.map((m, i) => (
            <div key={i} className="flex items-center gap-1">
              {i > 0 ? <span aria-hidden className="text-faint">·</span> : null}
              {m}
            </div>
          ))}
        </dl>
      ) : null}

      {tags?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 4).map((t) => (
            <Tag key={t}>{t}</Tag>
          ))}
          {tags.length > 4 ? <Tag>+{tags.length - 4}</Tag> : null}
        </div>
      ) : null}

      {footer ? <div className="mt-auto pt-3">{footer}</div> : null}
    </article>
  );
}

/* ── Section shell ─────────────────────────────────────────────────────── */

/**
 * A titled discovery section with an optional "see all".
 *
 * The link is not decoration: a rail shows six of forty items, and without a
 * route to the other thirty-four the section is a dead end dressed as a
 * feature.
 */
export function DiscoverySection({
  title,
  eyebrow,
  description,
  seeAll,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  seeAll?: { href: string; label?: string };
  children: ReactNode;
}) {
  return (
    <section className="stack-safe">
      <div className="mb-3.5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="stack-safe">
          {eyebrow ? (
            <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-accent-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-current animate-pulse-dot" />
              {eyebrow}
            </p>
          ) : null}
          <h2 className="font-display text-xl font-bold sm:text-2xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
        </div>
        {seeAll ? (
          <Link
            href={seeAll.href}
            className="shrink-0 text-sm font-semibold text-brand-ink hover:underline"
          >
            {seeAll.label ?? "See all"} <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
