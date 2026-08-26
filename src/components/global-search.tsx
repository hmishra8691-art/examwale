"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui";

type Suggestion = {
  kind: "career" | "exam" | "job" | "business";
  slug: string;
  title: string;
  meta: string;
};

const KIND_LABEL: Record<Suggestion["kind"], { label: string; href: string; tone: string }> = {
  career: { label: "Career", href: "/careers", tone: "bg-brand-50 text-brand-700 dark:bg-brand-900/50 dark:text-brand-100" },
  exam: { label: "Exam", href: "/exams", tone: "bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-100" },
  job: { label: "Job", href: "/jobs", tone: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-100" },
  business: { label: "Business", href: "/business", tone: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
};

const QUICK_LINKS = [
  { label: "Government exams", href: "/exams" },
  { label: "Careers", href: "/careers" },
  { label: "Find a mentor", href: "/mentors" },
  { label: "Résumé report", href: "/guidance/resume" },
];

/**
 * The header search box.
 *
 * Three things it has to do that a bare input does not: preview real records
 * as you type, stay reachable from the keyboard (⌘K or /), and offer the
 * mentor directory when what you typed is a question rather than a keyword. That last
 * one matters because this product answers both kinds of input, and the
 * difference is not obvious from a box that says "Search".
 */
export function GlobalSearch({
  className,
  autoFocus = false,
  size = "md",
  id: providedId,
  initialQuery = "",
}: {
  className?: string;
  autoFocus?: boolean;
  size?: "md" | "lg";
  id?: string;
  /** Prefills the box — used on the results page so the query is editable. */
  initialQuery?: string;
}) {
  const router = useRouter();
  const generatedId = useId();
  const id = providedId ?? `search-${generatedId}`;

  const [query, setQuery] = useState(initialQuery);
  const [hits, setHits] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  /** False until the user types or focuses — see the suggestion effect. */
  const [touched, setTouched] = useState(false);

  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  // A question gets routed to the assistant; a keyword goes to search.
  const looksLikeQuestion =
    /\?$/.test(query.trim()) ||
    /^(how|what|which|why|can i|should i|is it|am i|do i|where)\b/i.test(query.trim());

  const rows = [
    ...hits.map((hit) => ({ type: "hit" as const, hit })),
    ...(query.trim().length >= 2
      ? [{ type: "search" as const }, { type: "ask" as const }]
      : []),
  ];

  // --- fetch suggestions, debounced ----------------------------------------
  useEffect(() => {
    const trimmed = query.trim();
    // A prefilled box (the results page) must not fire a request on mount for
    // a query whose results are already rendered below it.
    if (!touched) return;
    if (trimmed.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/v1/search/suggest?q=${encodeURIComponent(trimmed)}&limit=6`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error("suggest failed");
        const payload = (await response.json()) as { data?: { hits?: Suggestion[] } };
        setHits(payload.data?.hits ?? []);
      } catch (error) {
        // An aborted request is the normal case while typing, not a failure.
        if ((error as Error).name !== "AbortError") setHits([]);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, touched]);

  // --- ⌘K / ctrl-K / "/" to focus ------------------------------------------
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --- click outside closes the panel --------------------------------------
  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      setActive(-1);
      router.push(href);
    },
    [router],
  );

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    if (active >= 0 && rows[active]) {
      const row = rows[active];
      if (row.type === "hit") return go(`${KIND_LABEL[row.hit.kind].href}/${row.hit.slug}`);
      if (row.type === "ask") return go("/mentors");
      return go(`/search?q=${encodeURIComponent(trimmed)}`);
    }

    go(
      looksLikeQuestion
        ? "/mentors"
        : `/search?q=${encodeURIComponent(trimmed)}`,
    );
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
      input.current?.blur();
      return;
    }
    if (!open || !rows.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => (value + 1) % rows.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => (value <= 0 ? rows.length - 1 : value - 1));
    }
  }

  const tall = size === "lg";

  return (
    <div ref={wrapper} className={cx("relative", className)}>
      <form onSubmit={submit} role="search">
        <label htmlFor={id} className="sr-only">
          Search careers, exams, jobs and courses
        </label>

        <div
          className={cx(
            "flex items-center gap-2 rounded-lg border bg-[var(--surface-raised)] transition-all",
            "focus-within:border-brand-500 focus-within:bg-[var(--surface)] focus-within:ring-4 focus-within:ring-brand-500/10",
            tall ? "px-4 py-3" : "px-3.5 py-2.5",
          )}
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden className={cx("shrink-0 text-faint", tall ? "size-5" : "size-4")}>
            <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>

          <input
            ref={input}
            id={id}
            type="search"
            autoComplete="off"
            autoFocus={autoFocus}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setTouched(true);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => {
              setTouched(true);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${id}-row-${active}` : undefined}
            placeholder="Search careers, exams, jobs — or ask a question"
            className={cx(
              "min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint",
              tall ? "text-base" : "text-sm",
              // The wrapper already draws a focus ring via focus-within, so the
              // global :focus-visible outline would draw a second box inside
              // the first. Suppressed here only — focus stays plainly visible.
              "focus-visible:outline-none",
              // Chrome's own clear button collides with our clear button.
              "[&::-webkit-search-cancel-button]:appearance-none",
            )}
          />

          {loading ? (
            <span
              aria-hidden
              className="size-4 shrink-0 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500"
            />
          ) : query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setHits([]);
                input.current?.focus();
              }}
              className="shrink-0 rounded-md p-1 text-faint hover:text-[var(--text)]"
            >
              <span className="sr-only">Clear search</span>
              <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
                <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          ) : (
            <kbd className="hidden shrink-0 rounded-md border px-1.5 py-0.5 font-sans text-[10px] font-medium text-faint lg:block">
              ⌘K
            </kbd>
          )}
        </div>
      </form>

      {open ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-50 overflow-hidden rounded-lg border bg-[var(--surface)] shadow-xl"
        >
          {query.trim().length < 2 ? (
            <div className="p-3">
              <p className="px-2 pb-2 text-xs font-medium uppercase tracking-wide text-faint">
                Jump to
              </p>
              <ul className="grid gap-0.5">
                {QUICK_LINKS.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-lg px-2 py-2 text-sm hover:bg-[var(--surface-raised)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="border-t px-2 pt-2 text-xs text-faint">
                Plain language works: &ldquo;government jobs for a 25-year-old commerce
                graduate&rdquo;.
              </p>
            </div>
          ) : (
            <ul className="max-h-[min(28rem,70vh)] overflow-y-auto py-1.5">
              {hits.map((hit, index) => {
                const meta = KIND_LABEL[hit.kind];
                return (
                  <li key={`${hit.kind}-${hit.slug}`}>
                    <Link
                      id={`${id}-row-${index}`}
                      role="option"
                      aria-selected={active === index}
                      href={`${meta.href}/${hit.slug}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => setOpen(false)}
                      className={cx(
                        "flex items-center gap-3 px-3 py-2.5 text-sm",
                        active === index ? "bg-[var(--surface-raised)]" : "",
                      )}
                    >
                      <span
                        className={cx(
                          "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          meta.tone,
                        )}
                      >
                        {meta.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{hit.title}</span>
                      <span className="hidden shrink-0 truncate text-xs text-faint sm:block">
                        {hit.meta}
                      </span>
                    </Link>
                  </li>
                );
              })}

              {!hits.length && !loading ? (
                <li className="px-3 py-3 text-sm text-muted">
                  No records match that. A mentor can answer a question the guides do not cover.
                </li>
              ) : null}

              <li className="mt-1 border-t pt-1">
                <button
                  id={`${id}-row-${hits.length}`}
                  role="option"
                  aria-selected={active === hits.length}
                  type="button"
                  onMouseEnter={() => setActive(hits.length)}
                  onClick={() => go(`/search?q=${encodeURIComponent(query.trim())}`)}
                  className={cx(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm",
                    active === hits.length ? "bg-[var(--surface-raised)]" : "",
                  )}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-faint" aria-hidden>
                    <circle cx="9" cy="9" r="5.5" stroke="currentColor" strokeWidth="1.6" />
                    <path d="m13.5 13.5 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">
                    See all results for <span className="font-medium">{query.trim()}</span>
                  </span>
                </button>
              </li>

              <li>
                <button
                  id={`${id}-row-${hits.length + 1}`}
                  role="option"
                  aria-selected={active === hits.length + 1}
                  type="button"
                  onMouseEnter={() => setActive(hits.length + 1)}
                  onClick={() => go("/mentors")}
                  className={cx(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm",
                    active === hits.length + 1 ? "bg-[var(--surface-raised)]" : "",
                  )}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-4 shrink-0 text-brand-600" aria-hidden>
                    <path
                      d="M4 5.5A1.5 1.5 0 0 1 5.5 4h9A1.5 1.5 0 0 1 16 5.5v6A1.5 1.5 0 0 1 14.5 13H8l-4 3v-3H5.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="min-w-0 flex-1 truncate">
                    Ask a mentor about{" "}
                    <span className="font-medium">{query.trim()}</span>
                  </span>
                  {looksLikeQuestion ? (
                    <span className="shrink-0 rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:bg-brand-900/50 dark:text-brand-100">
                      Enter
                    </span>
                  ) : null}
                </button>
              </li>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
