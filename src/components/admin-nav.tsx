"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const LINKS = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/careers", label: "Careers" },
  { href: "/admin/exams", label: "Exams" },
  { href: "/admin/organisations", label: "Verification" },
  { href: "/admin/job-moderation", label: "Job moderation" },
  { href: "/admin/mentors", label: "Mentors" },
  { href: "/admin/providers", label: "Provider applications" },
  { href: "/admin/services", label: "Service listings" },
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
    <nav aria-label="Admin" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
      <ul className="flex flex-wrap gap-1 pb-2 lg:flex-col lg:flex-nowrap lg:pb-0">
        {LINKS.map((link) => {
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
        })}
      </ul>
    </nav>
  );
}
