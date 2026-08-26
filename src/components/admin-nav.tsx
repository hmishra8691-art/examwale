"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/*
 * Full labels, not abbreviations. The sidebar is a fixed 13rem, which fits the
 * longest of these with room to spare, and "Providers" / "Tasks" / "Ads" made
 * the reader open the page to find out which one it was. `truncate` on the link
 * stays as the backstop for a longer label added later.
 */
const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/careers", label: "Careers" },
  { href: "/admin/exams", label: "Exams" },
  { href: "/admin/organisations", label: "Verification" },
  { href: "/admin/job-moderation", label: "Job moderation" },
  { href: "/admin/mentors", label: "Mentors" },
  { href: "/admin/providers", label: "Providers" },
  { href: "/admin/services", label: "Services" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/advertising", label: "Advertising" },
  { href: "/admin/countries", label: "Countries" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/scheduler", label: "Scheduled tasks" },
  { href: "/admin/audit", label: "Audit log" },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    /*
      `min-w-0` is load-bearing. A grid item defaults to `min-width: auto`, so
      without it this column refuses to be narrower than its widest nowrap link
      and drags the whole document sideways on a phone. scripts/smoke.sh asserts
      it is still here for exactly that reason — it has regressed before.
    */
    <nav
      aria-label="Admin"
      className="min-w-0 lg:sticky lg:top-20 lg:self-start lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto"
    >
      <ul className="flex flex-wrap gap-1 pb-2 lg:flex-col lg:flex-nowrap lg:pb-0">
        {LINKS.map((link) => {
          const active = link.exact ? pathname === link.href : pathname.startsWith(link.href);
          return (
            <li key={link.href} className="shrink-0 lg:w-full">
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "block truncate rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                    : "text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
                )}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
