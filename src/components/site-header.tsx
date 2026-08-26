"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { GlobalSearch } from "@/components/global-search";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { CountrySwitcher, type SwitchableCountry } from "@/components/country-switcher";
import type { Locale } from "@/modules/i18n/config";
import type { SessionUser } from "@/modules/auth/session";

/**
 * Primary navigation.
 *
 * Destinations that stay visible on desktop (lg+). Remaining categories and
 * guidance tools move into "Explore" dropdown to keep the header compact.
 */
const NAV = [
  { href: "/careers", label: "Careers" },
  { href: "/exams", label: "Exams" },
  { href: "/jobs", label: "Jobs" },
];

const EXPLORE_MENU = [
  { href: "/courses", label: "Courses", blurb: "Books, providers and online learning" },
  { href: "/mentors", label: "Mentors", blurb: "Talk to someone who has done it" },
  { href: "/services", label: "Services", blurb: "Résumé reviews, coaching, consulting" },
  { href: "/business", label: "Business ideas", blurb: "Costs, licences, break-even" },
  { href: "/pathways", label: "After school", blurb: "Streams and routes after Class 10 and 12" },
  { href: "/assessment", label: "Career assessment", blurb: "Ranked shortlist from your answers" },
  { href: "/pricing", label: "Plans", blurb: "What's free and what isn't" },
];

const GUIDANCE = [
  { href: "/guidance", label: "All guidance", blurb: "What the tools measure, and what they don't" },
  { href: "/guidance/matches", label: "What suits me", blurb: "A shortlist, and why each one might not fit" },
  { href: "/guidance/resume", label: "Résumé report", blurb: "Scored against the role you want" },
  { href: "/guidance/interview", label: "Interview practice", blurb: "Questions from the role's own guide" },
];

export function SiteHeader({
  session,
  locale = "en",
  unreadCount = 0,
  countryIso = "IN",
  countries = [],
  isProvider = false,
  unreadMessages = 0,
}: {
  session: SessionUser | null;
  locale?: Locale;
  unreadCount?: number;
  countryIso?: string;
  /**
   * Shown only to people who actually offer something. A "Provider" link in
   * everybody's header is an advert; for somebody who mentors it is the way in
   * to their own work.
   */
  isProvider?: boolean;
  /** Unread messages, shown on the inbox link. */
  unreadMessages?: number;
  /** Active countries only. The switcher hides itself below two. */
  countries?: SwitchableCountry[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<"explore" | "guidance" | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setMenu(null);
  }, [pathname]);

  useEffect(() => {
    if (!menu) return;
    function onClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function signOut() {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }

  const isAdmin = session?.role === "ADMIN" || session?.role === "SUPER_ADMIN";

  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--surface)]/90 backdrop-blur">
      {/*
        Simplified layout: logo + search in the center, navigation in dropdowns,
        account items on the right. Everything fits on desktop without overflow,
        collapses to mobile menu on smaller screens.
      */}
      <div className="page flex h-16 items-center gap-2">
        {/* Logo & Home */}
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
          <span
            aria-hidden
            className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white"
          >
            E
          </span>
          <span className="font-[family-name:var(--font-display)] text-lg tracking-tight hidden sm:inline">
            ExamWale
          </span>
        </Link>

        {/* Search — hidden on small screens to preserve space */}
        <div className="hidden min-w-0 flex-1 md:block md:max-w-sm lg:max-w-md">
          <GlobalSearch />
        </div>

        {/* Navigation & Account — flex-1 to push right, grows to fill space */}
        <div ref={menuRef} className="ml-auto flex items-center justify-end gap-1">
          {/* Main nav — only on lg+ */}
          <nav aria-label="Main" className="hidden lg:flex items-center gap-0.5">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                      : "text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Explore dropdown */}
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setMenu((value) => (value === "explore" ? null : "explore"))}
              aria-expanded={menu === "explore"}
              aria-haspopup="menu"
              className="flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
            >
              Explore
              <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden>
                <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {menu === "explore" ? (
              <Dropdown items={EXPLORE_MENU} onPick={() => setMenu(null)}>
                <div className="mt-1 flex flex-wrap items-center gap-2 border-t px-3 pb-1 pt-3 2xl:hidden">
                  <CountrySwitcher current={countryIso} countries={countries} />
                  <LocaleSwitcher current={locale} />
                </div>
              </Dropdown>
            ) : null}
          </div>

          {/* Guidance dropdown */}
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setMenu((value) => (value === "guidance" ? null : "guidance"))}
              aria-expanded={menu === "guidance"}
              aria-haspopup="menu"
              aria-label="Guidance tools"
              title="Guidance tools"
              className={cx(
                "grid size-10 place-items-center rounded-lg transition-colors",
                pathname.startsWith("/guidance")
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                  : "text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
              )}
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
                <path
                  d="M7 3.5h7.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7a2.5 2.5 0 0 1-2.5-2.5v-8A2.5 2.5 0 0 1 7 3.5Zm0 0v13M8.5 7.5h4.5M8.5 10h4.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {menu === "guidance" ? <Dropdown items={GUIDANCE} onPick={() => setMenu(null)} /> : null}
          </div>

          {/*
            Country and language are two native selects, together 281px of the
            bar. Kept out of it until 2xl: below that they push the account
            controls off the right edge, where `overflow-x: clip` silently eats
            them — which is how Sign out went missing at 1280px. Below 2xl they
            live at the foot of the Explore menu.
          */}
          <div className="hidden items-center gap-1 2xl:flex">
            <CountrySwitcher current={countryIso} countries={countries} />
            <LocaleSwitcher current={locale} />
          </div>

          {/* Account items */}
          {session ? (
            <>
              <Link
                href="/dashboard/notifications"
                aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
                title={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
                className="relative grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
                  <path
                    d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1 4-1.5 4.5h12c-.5-.5-1.5-1.5-1.5-4.5A4.5 4.5 0 0 0 10 3ZM8.5 15a1.5 1.5 0 0 0 3 0"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {unreadCount ? (
                  <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-alert-600 px-1 text-[10px] font-semibold leading-4 text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/messages"
                aria-label={unreadMessages ? `Messages, ${unreadMessages} unread` : "Messages"}
                title={unreadMessages ? `${unreadMessages} unread messages` : "Messages"}
                className="relative grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
                  <path
                    d="M3 5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm0 0l7 4.5 7-4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                {unreadMessages > 0 ? (
                  <span className="absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-alert-600 px-1 text-[10px] font-semibold text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </Link>
              {isProvider ? (
                <Link
                  href="/provider"
                  aria-label="Provider dashboard"
                  title="Provider dashboard"
                  className="hidden size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)] lg:grid"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
                    <path
                      d="M10 2a3 3 0 0 0-3 3v2H3a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-4V5a3 3 0 0 0-3-3Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              ) : null}
              <Link
                href="/dashboard"
                aria-label="Dashboard"
                title="Dashboard"
                className="grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
              >
                {/*
                  Four squares on a 20-unit grid, inset 2.75 so the strokes sit
                  inside the box. Drawn as rects rather than one path because a
                  hand-written path is how the earlier version of this icon ran
                  past x=20 and lost its bottom-right square to the viewBox.
                */}
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="size-5"
                  aria-hidden
                >
                  <rect x="2.75" y="2.75" width="6" height="6" rx="1.5" />
                  <rect x="11.25" y="2.75" width="6" height="6" rx="1.5" />
                  <rect x="2.75" y="11.25" width="6" height="6" rx="1.5" />
                  <rect x="11.25" y="11.25" width="6" height="6" rx="1.5" />
                </svg>
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin"
                  aria-label="Admin panel"
                  title="Admin panel"
                  className="grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
                >
                  <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
                    <path
                      d="M10 2a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM2.5 16.5a7.5 7.5 0 0 1 15 0"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Link>
              ) : null}
              <button
                onClick={signOut}
                aria-label="Sign out"
                title="Sign out"
                className="grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
              >
                <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
                  <path
                    d="M13.5 3h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-2M8 15l4-4m-4-4l4 4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] sm:block"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Start
              </Link>
            </>
          )}

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            title={open ? "Close menu" : "Open menu"}
            className="grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] lg:hidden"
          >
            <svg viewBox="0 0 20 20" fill="none" className="size-5" aria-hidden>
              {open ? (
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open ? (
        <div
          id="mobile-nav"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t bg-[var(--surface)] lg:hidden"
        >
          <div className="page space-y-1 py-3">
            <div className="mb-3 md:hidden">
              <GlobalSearch id="mobile-search" />
            </div>

            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-raised)]"
              >
                {item.label}
              </Link>
            ))}

            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-faint">
              Guidance
            </p>
            {GUIDANCE.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-raised)]"
              >
                {item.label}
              </Link>
            ))}

            <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-faint">
              Explore
            </p>
            {EXPLORE_MENU.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-[var(--surface-raised)]"
              >
                {item.label}
              </Link>
            ))}

            <div className="mt-2 border-t pt-2">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                <CountrySwitcher current={countryIso} countries={countries} />
                <LocaleSwitcher current={locale} />
              </div>
              {session ? (
                <>
                  <Link href="/messages" className="block rounded-lg px-3 py-2.5 text-sm font-medium">
                    Messages{unreadMessages ? ` (${unreadMessages})` : ""}
                  </Link>
                  {isProvider ? (
                    <Link
                      href="/provider"
                      className="block rounded-lg px-3 py-2.5 text-sm font-medium"
                    >
                      Provider
                    </Link>
                  ) : null}
                  <Link href="/dashboard" className="block rounded-lg px-3 py-2.5 text-sm font-medium">
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/notifications"
                    className="block rounded-lg px-3 py-2.5 text-sm font-medium"
                  >
                    Notifications{unreadCount ? ` (${unreadCount})` : ""}
                  </Link>
                  {isAdmin ? (
                    <Link href="/admin" className="block rounded-lg px-3 py-2.5 text-sm font-medium">
                      Admin
                    </Link>
                  ) : null}
                  <button
                    onClick={signOut}
                    className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <Link href="/login" className="block rounded-lg px-3 py-2.5 text-sm font-medium">
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

/** Shared popover for the two header menus. */
function Dropdown({
  items,
  onPick,
  children,
}: {
  items: { href: string; label: string; blurb: string }[];
  onPick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      role="menu"
      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-72 overflow-hidden rounded-lg border bg-[var(--surface)] p-1.5 shadow-xl"
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          role="menuitem"
          onClick={onPick}
          className="block rounded-md px-3 py-2.5 hover:bg-[var(--surface-raised)]"
        >
          <span className="block text-sm font-medium">{item.label}</span>
          <span className="mt-0.5 block text-xs text-muted">{item.blurb}</span>
        </Link>
      ))}
      {children}
    </div>
  );
}
