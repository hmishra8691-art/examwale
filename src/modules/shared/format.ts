/** Presentation helpers shared by server components and client components. */

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
  AED: "AED ",
  CAD: "C$",
  AUD: "A$",
};

export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code] ?? `${code} `;
}

/**
 * Number and date locale for a currency.
 *
 * Grouping differs by market — 12,34,567 in India against 1,234,567 almost
 * everywhere else — and getting it wrong is a small, constant signal that the
 * product was built for somebody else. Keyed off currency because that is what
 * every call site already has to hand; `localeForCountry` below is the more
 * direct route when an ISO country code is available.
 */
const CURRENCY_LOCALES: Record<string, string> = {
  INR: "en-IN",
  AED: "en-AE",
  USD: "en-US",
  GBP: "en-GB",
  CAD: "en-CA",
  AUD: "en-AU",
  EUR: "en-IE",
};

export function localeForCurrency(code: string): string {
  return CURRENCY_LOCALES[code] ?? "en-GB";
}

const COUNTRY_LOCALES: Record<string, string> = {
  IN: "en-IN",
  AE: "en-AE",
  US: "en-US",
  GB: "en-GB",
  CA: "en-CA",
  AU: "en-AU",
};

export function localeForCountry(iso: string | null | undefined): string {
  return (iso && COUNTRY_LOCALES[iso.toUpperCase()]) || "en-GB";
}

/**
 * Indian numbering for INR (lakh/crore), compact Western grouping elsewhere.
 * Career salaries in India are read as "₹6.5 LPA", not "₹650,000 per year",
 * and getting that wrong makes the whole product feel foreign.
 *
 * The lakh/crore branch is keyed on the currency, not on being the default, so
 * an AED salary is never rendered in lakh once a second country exists.
 */
export function formatMoney(amount: number | null | undefined, code = "INR"): string {
  if (amount === null || amount === undefined) return "—";
  const symbol = currencySymbol(code);

  if (code === "INR") {
    if (amount >= 10_000_000) return `${symbol}${trim(amount / 10_000_000)} Cr`;
    if (amount >= 100_000) return `${symbol}${trim(amount / 100_000)} L`;
    if (amount >= 1_000) return `${symbol}${new Intl.NumberFormat("en-IN").format(amount)}`;
    return `${symbol}${amount}`;
  }

  if (amount >= 1_000_000) return `${symbol}${trim(amount / 1_000_000)}M`;
  if (amount >= 1_000) {
    return `${symbol}${new Intl.NumberFormat(localeForCurrency(code)).format(amount)}`;
  }
  return `${symbol}${amount}`;
}

export function formatMoneyRange(
  min: number | null | undefined,
  max: number | null | undefined,
  code = "INR",
): string {
  if (min == null && max == null) return "Not published";
  if (min != null && max == null) return `${formatMoney(min, code)}+`;
  if (min == null && max != null) return `up to ${formatMoney(max, code)}`;
  if (min === max) return formatMoney(min, code);
  return `${formatMoney(min, code)} – ${formatMoney(max, code)}`;
}

function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatMonths(min?: number | null, max?: number | null): string {
  if (min == null && max == null) return "Varies";
  const toText = (months: number) => {
    if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
    const years = months / 12;
    return `${trim(years)} year${years === 1 ? "" : "s"}`;
  };
  if (min != null && max != null && min !== max) return `${toText(min)} – ${toText(max)}`;
  return toText((min ?? max)!);
}

/**
 * `locale` is optional and defaults to en-IN.
 *
 * Day-month-year with a short month name reads correctly in every market this
 * product currently serves, so the default is safe rather than merely
 * convenient — but the parameter exists so a country whose convention differs
 * (month-first, in the US) can pass its own without every call site changing.
 */
export function formatDate(
  value: Date | string | null | undefined,
  locale = "en-IN",
): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function relativeDays(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - date.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)}y ago`;
}

const LEVEL_TEXT: Record<string, string> = {
  VERY_LOW: "Very low",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  VERY_HIGH: "Very high",
};

export function levelLabel(level: string): string {
  return LEVEL_TEXT[level] ?? level;
}

/** 0..4 so UI meters don't have to know the enum. */
export function levelIndex(level: string): number {
  return ["VERY_LOW", "LOW", "MEDIUM", "HIGH", "VERY_HIGH"].indexOf(level);
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`;
}

/**
 * Budget filter bands for a currency.
 *
 * Not merely a symbol swap: ₹25,000 is roughly AED 1,100, so reusing the Indian
 * thresholds with a different symbol in front would offer UAE readers a "under
 * AED 25,000" band that matches almost every training course there and filters
 * nothing. The bands have to be chosen per market to be useful at all.
 *
 * Falls back to the USD-shaped ladder for currencies with no explicit entry,
 * which is wrong in detail but never absurd.
 */
export function budgetBands(currencyCode: string): { label: string; value: number }[] {
  const ladders: Record<string, number[]> = {
    INR: [25_000, 100_000, 500_000, 1_500_000],
    AED: [2_000, 10_000, 50_000, 150_000],
    USD: [500, 2_500, 10_000, 40_000],
    GBP: [500, 2_000, 8_000, 30_000],
    CAD: [700, 3_000, 12_000, 50_000],
    AUD: [800, 3_500, 14_000, 55_000],
  };

  const ladder = ladders[currencyCode] ?? ladders.USD;
  return ladder.map((value) => ({
    label: `Under ${formatMoney(value, currencyCode)}`,
    value,
  }));
}
