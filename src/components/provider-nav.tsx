"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

export type ProviderNavItem = {
  href: string;
  label: string;
  /** Shown as a count beside the label when non-zero. */
  badge?: number;
  /** True when the link leaves the provider area for an existing screen. */
  external?: boolean;
};

/**
 * The provider shell's navigation.
 *
 * Several of these links leave `/provider` for screens that already exist —
 * `/dashboard/mentor`, `/employers/dashboard`. That is deliberate. Those screens
 * work, they are covered by tests, and reimplementing them inside this shell to
 * make the URLs tidy would be a rewrite with a nav bar as its only visible
 * result. The shell's job is to make one person's several roles reachable from
 * one place, not to own every pixel of them.
 *
 * Items are passed in rather than declared here, because which of them exist
 * depends on what this provider has been approved for — and offering a link to
 * something they cannot use is how a dashboard becomes a list of disappointments.
 */
export function ProviderNav({ items }: { items: ProviderNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Provider" className="lg:sticky lg:top-20 lg:self-start">
      <ul className="flex gap-1 overflow-x-auto scroll-slim pb-2 lg:flex-col lg:overflow-visible lg:pb-0">
        {items.map((item) => {
          const active =
            item.href === "/provider"
              ? pathname === "/provider"
              : pathname.startsWith(item.href);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                    : "text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {item.label}
                  {item.external ? (
                    <span aria-hidden className="text-[10px] opacity-50">
                      ↗
                    </span>
                  ) : null}
                </span>
                {item.badge ? (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold tabular-nums text-white">
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
