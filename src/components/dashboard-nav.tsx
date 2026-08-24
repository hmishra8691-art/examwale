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
    label: "AI tools",
    links: [
      { href: "/chat", label: "Assistant" },
      { href: "/ai/resume", label: "Résumé review" },
      { href: "/ai/interview", label: "Interview practice" },
      { href: "/ai/recommendations", label: "What suits me" },
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
    <nav aria-label="Dashboard" className="lg:sticky lg:top-20 lg:self-start">
      {/*
        Horizontal on narrow screens, where group headings would cost more
        space than they earn; grouped and vertical from `lg`, where eleven flat
        links had become a wall.
      */}
      <ul className="flex gap-1 overflow-x-auto scroll-slim pb-2 lg:hidden">
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
