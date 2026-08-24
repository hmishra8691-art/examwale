import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSession } from "@/modules/auth/session";
import { getLocale } from "@/modules/i18n/service";
import { unreadCount } from "@/modules/notifications/service";
import { getCountry, listActiveCountries } from "@/modules/geo/service";

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
  const [locale, unread, country, countries] = await Promise.all([
    getLocale(),
    session ? unreadCount(session.sub).catch(() => 0) : Promise.resolve(0),
    getCountry(),
    listActiveCountries(),
  ]);

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,600;12..96,700&family=Inter:wght@400;500;600;700&display=swap"
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
        />
        <main id="main">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
