"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const GROUPS: { label: string; links: { href: string; label: string; exact?: boolean }[] }[] = [
  {
    label: "Your work",
    links: [
      { href: "/dashboard", label: "Overview", exact: true },
      { href: "/dashboard/profile", label: "Your profile" },
      { href: "/dashboard/roadmaps", label: "Roadmaps" },
      { href: "/dashboard/documents", label: "Documents" },
      { href: "/dashboard/saved", label: "Saved" },
      { href: "/dashboard/applications", label: "Applications" },
      { href: "/dashboard/exams", label: "Study plans" },
    ],
  },
  {
    label: "Guidance",
    links: [
      { href: "/guidance/matches", label: "What suits me" },
      { href: "/guidance/resume", label: "Résumé report" },
      { href: "/guidance/interview", label: "Interview practice" },
      { href: "/mentors", label: "Find a mentor" },
    ],
  },
];

export function DashboardNav() {
  const pathname = usePathname();

  function item(link: { href: string; label: string; exact?: boolean }) {
    const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
    return (
      <li key={link.href} className="shrink-0">
        <Link
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={cx(
            "block whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
            active
              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
              : "text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
          )}
        >
          {link.label}
        </Link>
      </li>
    );
  }

  return (
    /*
      `min-w-0` is load-bearing, not tidiness.

      On narrow screens the parent is a single-column grid, and a grid item's
      default `min-width: auto` means it refuses to be narrower than its own
      content. This nav's content is a row of nowrap links about 1200px wide, so
      the column became 1200px inside a 343px container and every dashboard page
      scrolled sideways by 850px. The inner `overflow-x-auto` could not help:
      the scroll container has to be the thing that is too narrow, and nothing
      here was ever too narrow.
    */
    <nav aria-label="Dashboard" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      {/*
        Wraps on narrow screens rather than scrolling sideways. A scroll strip
        hides links off the right edge with no indication they are there, and
        removing the assistant took this from eleven links to eight — few enough
        that they all fit in two or three tidy rows. Grouped and vertical from
        `lg`, where the headings earn their space.
      */}
      <ul className="flex flex-wrap gap-1 pb-2 lg:hidden">
        {GROUPS.flatMap((group) => group.links).map(item)}
      </ul>

      <div className="hidden lg:block">
        {GROUPS.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-faint">
              {group.label}
            </p>
            <ul className="flex flex-col gap-0.5">{group.links.map(item)}</ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
