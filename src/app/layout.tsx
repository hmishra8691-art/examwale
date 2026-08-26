import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { BottomNav } from "@/components/bottom-nav";
import { getSession } from "@/modules/auth/session";
import { getLocale } from "@/modules/i18n/service";
import { unreadCount } from "@/modules/notifications/service";
import { getCountry, listActiveCountries } from "@/modules/geo/service";
import { isProviderAccount } from "@/modules/providers/service";
import { unreadMessageCount } from "@/modules/messaging/service";

export const metadata: Metadata = {
  title: {
    default: "ExamWale — Work out what to do next",
    template: "%s · ExamWale",
  },
  description:
    "Career, education, government exam, job and business guidance built around your situation — your education, budget, location and the time you actually have.",
  openGraph: {
    title: "ExamWale",
    description: "Work out what to do next — careers, exams, jobs and business, explained honestly.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#10131f" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  /**
   * Locale and the unread count are resolved here so every page gets them
   * without each one remembering to. The unread count is only fetched for a
   * signed-in visitor — an anonymous page render should not touch the
   * notifications table at all.
   */
  const [locale, unread, country, countries, isProvider, unreadMessages] = await Promise.all([
    getLocale(),
    session ? unreadCount(session.sub).catch(() => 0) : Promise.resolve(0),
    getCountry(),
    listActiveCountries(),
    // Not put in the session token deliberately: a profile created five minutes
    // ago must appear in the nav now, and a JWT claim would not until the access
    // token refreshed.
    session ? isProviderAccount(session.sub).catch(() => false) : Promise.resolve(false),
    session ? unreadMessageCount(session.sub).catch(() => 0) : Promise.resolve(0),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@500;600;700;800&family=Inter:wght@400;500;600;700&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <SiteHeader
          session={session}
          locale={locale}
          unreadCount={unread}
          countryIso={country.isoCode}
          countries={countries.map((entry) => ({ isoCode: entry.isoCode, name: entry.name }))}
          isProvider={isProvider}
          unreadMessages={unreadMessages}
        />
        <main id="main">{children}</main>
        <SiteFooter />
        {/*
          The bottom bar is fixed, so it sits over the end of the page. The
          spacer below reserves exactly its height on the breakpoints where it
          is visible, which is cheaper and more reliable than padding <main>:
          padding on main would also indent the footer's background, leaving a
          strip of page colour under it.
        */}
        <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] lg:hidden" />
        <BottomNav signedIn={Boolean(session)} unread={unread + unreadMessages} />
      </body>
    </html>
  );
}
