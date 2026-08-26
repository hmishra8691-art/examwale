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
 * Primary navigation, and the overflow.
 *
 * Seven top-level destinations do not fit beside a search box that is worth
 * using, and shrinking the search box to make them fit was the previous
 * answer. The four people actually navigate to stay inline; the rest move into
 * an Explore menu, which is also where the guidance tools live.
 */
const NAV = [
  { href: "/careers", label: "Careers" },
  { href: "/exams", label: "Exams" },
  { href: "/jobs", label: "Jobs" },
  { href: "/courses", label: "Courses" },
];

const MORE = [
  { href: "/mentors", label: "Mentors", blurb: "Talk to someone who has done it" },
  { href: "/services", label: "Services", blurb: "Résumé reviews, coaching, consulting" },
  { href: "/business", label: "Business ideas", blurb: "Costs, licences, break-even" },
  { href: "/pathways", label: "After school", blurb: "Streams and routes after Class 10 and 12" },
  { href: "/assessment", label: "Career assessment", blurb: "Ranked shortlist from your answers" },
  { href: "/pricing", label: "Plans", blurb: "What's free and what isn't" },
];

const GUIDANCE = [
  { href: "/guidance", label: "All guidance", blurb: "What the tools measure, and what they don't" },
  { href: "/mentors", label: "Find a mentor", blurb: "Verified people who have done the job" },
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
  const [menu, setMenu] = useState<"more" | "guidance" | null>(null);
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
        Three-zone grid rather than a flex row with two `ml-auto` children.
        The old layout let the nav's width decide where the search box started,
        so the box moved as the active-page pill changed size and was squeezed
        to `max-w-xs` to stop it colliding with the account controls. A grid
        with a fixed-width centre column keeps the search box the same size and
        in the same place on every page.
      */}
      <div className="mx-auto grid h-16 max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <div className="flex items-center gap-1">
          <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold">
            <span
              aria-hidden
              className="grid size-8 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white"
            >
              E
            </span>
            <span className="font-[family-name:var(--font-display)] text-lg tracking-tight">
              ExamWale
            </span>
          </Link>

          <nav aria-label="Main" className="ml-2 hidden items-center gap-0.5 xl:flex">
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
        </div>

        <div className="hidden justify-self-center md:block md:w-full md:max-w-lg">
          <GlobalSearch />
        </div>

        <div ref={menuRef} className="flex items-center justify-end gap-1.5">
          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setMenu((value) => (value === "guidance" ? null : "guidance"))}
              aria-expanded={menu === "guidance"}
              aria-haspopup="menu"
              className={cx(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                pathname.startsWith("/guidance")
                  ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
                  : "text-muted hover:bg-[var(--surface-raised)] hover:text-[var(--text)]",
              )}
            >
              <svg viewBox="0 0 20 20" fill="none" className="size-4" aria-hidden>
                <path
                  d="M7 3.5h7.5a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H7a2.5 2.5 0 0 1-2.5-2.5v-8A2.5 2.5 0 0 1 7 3.5Zm0 0v13M8.5 7.5h4.5M8.5 10h4.5"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              Guidance
            </button>
            {menu === "guidance" ? <Dropdown items={GUIDANCE} onPick={() => setMenu(null)} /> : null}
          </div>

          <div className="relative hidden lg:block">
            <button
              type="button"
              onClick={() => setMenu((value) => (value === "more" ? null : "more"))}
              aria-expanded={menu === "more"}
              aria-haspopup="menu"
              className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text)]"
            >
              Explore
              <svg viewBox="0 0 20 20" fill="none" className="size-3.5" aria-hidden>
                <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {menu === "more" ? (
              <Dropdown items={MORE} onPick={() => setMenu(null)}>
                {/*
                  Country and language live here below xl. They are wide native
                  selects, and keeping them permanently in the bar squeezed the
                  account controls until "Sign in" wrapped onto two lines at
                  1280px — a width plenty of people browse at.
                */}
                <div className="mt-1 flex flex-wrap items-center gap-2 border-t px-3 pb-1 pt-3 2xl:hidden">
                  <CountrySwitcher current={countryIso} countries={countries} />
                  <LocaleSwitcher current={locale} />
                </div>
              </Dropdown>
            ) : null}
          </div>

          <span className="mx-1 hidden h-6 w-px bg-[var(--border)] lg:block" aria-hidden />
          <span className="hidden shrink-0 items-center gap-2 2xl:flex">
            <CountrySwitcher current={countryIso} countries={countries} />
            <LocaleSwitcher current={locale} />
          </span>

          {session ? (
            <>
              <Link
                href="/dashboard/notifications"
                aria-label={
                  unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"
                }
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
                  <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold leading-4 text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </Link>
              <Link
                href="/messages"
                className="relative hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] sm:block"
              >
                Messages
                {unreadMessages > 0 ? (
                  <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
                    {unreadMessages > 9 ? "9+" : unreadMessages}
                  </span>
                ) : null}
              </Link>
              {isProvider ? (
                <Link
                  href="/provider"
                  className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] lg:block"
                >
                  Provider
                </Link>
              ) : null}
              <Link
                href="/dashboard"
                className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] sm:block"
              >
                Dashboard
              </Link>
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] lg:block"
                >
                  Admin
                </Link>
              ) : null}
              <button
                onClick={signOut}
                className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] sm:block"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-muted hover:text-[var(--text)] sm:block"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="shrink-0 whitespace-nowrap rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Get started
              </Link>
            </>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            className="grid size-10 place-items-center rounded-lg text-muted hover:bg-[var(--surface-raised)] lg:hidden"
          >
            <span className="sr-only">{open ? "Close menu" : "Open menu"}</span>
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
          <div className="mx-auto max-w-7xl space-y-1 px-4 py-3">
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
            {MORE.map((item) => (
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
