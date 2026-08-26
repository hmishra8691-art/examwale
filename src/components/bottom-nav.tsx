"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

/**
 * Mobile bottom navigation.
 *
 * On a phone the top of the screen is the furthest point from the thumb, and
 * it is where the header scrolls away to. Discovery has to live where the hand
 * already is.
 *
 * Five destinations, chosen by what somebody does rather than by mirroring the
 * desktop menu:
 *
 *   Home     — the discovery feed, the reason to open the app
 *   Explore  — careers, exams, jobs, courses behind one browse entry
 *   Search   — the single most-used control, given its own slot
 *   Saved    — the things you already decided you cared about
 *   You      — profile, or sign in
 *
 * Deliberately NOT one tab per content type. Four browse tabs plus search
 * leaves no room for saved items or the account, and forces the labels down to
 * a size nobody reads. "Explore" costs one tap and buys two slots.
 *
 * Hidden from `lg` up, where the header does this job with more room.
 */

type Item = {
  href: string;
  label: string;
  /** Matched with startsWith unless `exact`. */
  exact?: boolean;
  /** Any path under these prefixes also lights this tab. */
  also?: string[];
  icon: (active: boolean) => React.ReactNode;
  badge?: number;
};

/*
 * Inline SVG rather than an icon package.
 *
 * Five icons do not justify a dependency and the download it costs on a
 * mid-range phone on patchy data — which is exactly the device this bar exists
 * for. They are drawn on a 24px grid with a 1.75 stroke so they sit at the same
 * visual weight as the label beneath them.
 *
 * `active` switches fill rather than swapping to a second icon set: the shape
 * stays constant so the eye tracks position, and only the weight changes.
 */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const ITEMS: Item[] = [
  {
    href: "/",
    label: "Home",
    exact: true,
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <path
          {...stroke}
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.15 : 0}
          d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"
        />
      </svg>
    ),
  },
  {
    href: "/careers",
    label: "Explore",
    also: ["/exams", "/jobs", "/courses", "/business", "/pathways", "/services", "/mentors"],
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle {...stroke} cx="12" cy="12" r="9" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
        <path {...stroke} d="m15.5 8.5-2 5-5 2 2-5z" fill={active ? "currentColor" : "none"} />
      </svg>
    ),
  },
  {
    href: "/search",
    label: "Search",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle {...stroke} cx="11" cy="11" r="7" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
        <path {...stroke} d="m16.5 16.5 4 4" />
      </svg>
    ),
  },
  {
    href: "/dashboard/saved",
    label: "Saved",
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <path
          {...stroke}
          fill={active ? "currentColor" : "none"}
          fillOpacity={active ? 0.15 : 0}
          d="M6 4h12a1 1 0 0 1 1 1v15l-7-4.5L5 20V5a1 1 0 0 1 1-1z"
        />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "You",
    also: ["/provider", "/messages", "/login", "/signup"],
    icon: (active) => (
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <circle {...stroke} cx="12" cy="8.5" r="3.75" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
        <path {...stroke} d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </svg>
    ),
  },
];

export function BottomNav({
  signedIn,
  unread = 0,
}: {
  signedIn: boolean;
  /** Unread messages + notifications, shown on "You". */
  unread?: number;
}) {
  const pathname = usePathname();

  function isActive(item: Item): boolean {
    if (item.exact) return pathname === item.href;
    if (pathname.startsWith(item.href)) return true;
    return (item.also ?? []).some((p) => pathname.startsWith(p));
  }

  return (
    /*
      `pb` from the safe-area inset, not a fixed value: on a phone with a home
      indicator a flat 8px puts the labels under the system gesture bar, where
      they are both unreadable and untappable.
    */
    <nav
      aria-label="Primary"
      className={cx(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "border-t border-[var(--border)] bg-[var(--surface)]/95 backdrop-blur",
        "pb-[max(0.25rem,env(safe-area-inset-bottom))]",
      )}
    >
      <ul className="grid grid-cols-5">
        {ITEMS.map((item) => {
          const active = isActive(item);
          // Signed-out users get sent to the door rather than to a page that
          // will bounce them there and lose what they were doing.
          const href =
            !signedIn && (item.href === "/dashboard" || item.href === "/dashboard/saved")
              ? `/login?next=${encodeURIComponent(item.href)}`
              : item.href;
          const showBadge = item.label === "You" && unread > 0;

          return (
            <li key={item.label} className="stack-safe">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  // min-h-14 keeps the whole cell a comfortable target even
                  // though the icon itself is 24px.
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-1.5",
                  "transition-colors",
                  active ? "text-brand-ink" : "text-[var(--text-muted)]",
                )}
              >
                <span className="relative">
                  {item.icon(active)}
                  {showBadge ? (
                    <span
                      aria-hidden
                      className="absolute -right-1.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-alert-600 px-1 text-[10px] font-bold leading-4 text-white"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  ) : null}
                </span>
                <span
                  className={cx(
                    "truncate text-[11px] leading-none",
                    active ? "font-semibold" : "font-medium",
                  )}
                >
                  {item.label}
                </span>
                {showBadge ? <span className="sr-only">{unread} unread</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
