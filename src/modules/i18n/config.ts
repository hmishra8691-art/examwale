/**
 * Locale configuration.
 *
 * Locale is carried in a cookie, not a URL prefix.
 *
 * A `/hi/...` prefix would have meant restructuring all 52 existing routes and
 * doubling every internal href, and it buys something this product does not
 * need yet: separately indexable per-language URLs. The cookie is read in a
 * server component at the root layout, so pages stay static-shaped and any
 * later move to prefixed routes only has to change `getLocale`.
 *
 * The honest limitation, recorded rather than hidden: a Hindi page and an
 * English page share one URL, so a shared link opens in the recipient's
 * language, not the sender's.
 */

export const LOCALES = ["en", "hi"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "examwale_locale";

export const LOCALE_LABELS: Record<Locale, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  hi: { native: "हिन्दी", english: "Hindi" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function coerceLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
