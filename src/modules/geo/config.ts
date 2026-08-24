/**
 * Country configuration.
 *
 * Country is carried in a cookie for the same reasons locale is (see
 * `modules/i18n/config.ts`): no URL restructuring, resolved once in the root
 * layout, and a later move to prefixed routes only has to change `getCountry`.
 *
 * The important difference from locale is that **country is a content
 * boundary, not a presentation one**. Switching language re-renders the same
 * facts in another tongue. Switching country changes which facts exist at all
 * — a different set of careers, different salary currencies, different (or no)
 * government exams, different business rules. That makes two things matter
 * here that do not matter for locale:
 *
 *  1. Only *active* countries may be selected. A country with no content is
 *     not a country the product supports, and offering it in a switcher is a
 *     promise the database cannot keep.
 *  2. The resolved country must be stable across a request. Two queries on one
 *     page resolving different countries would produce a page that quietly
 *     mixes jurisdictions, which for eligibility rules is the kind of error
 *     someone acts on.
 */

export const COUNTRY_COOKIE = "examwale_country";

/**
 * Fallback used when nothing else resolves, and when a request-scoped lookup
 * is impossible (a script, a background job, a seed).
 *
 * Deliberately an ISO code rather than a database id: ids differ between
 * environments, codes do not.
 */
export const FALLBACK_COUNTRY_ISO = "IN";

export type ActiveCountry = {
  id: string;
  isoCode: string;
  name: string;
  currencyCode: string;
  currencySymbol: string;
  defaultLocale: string;
};

/**
 * Sections a country can cover.
 *
 * Coverage is *declared per country*, not inferred from row counts, because
 * the two failure modes look identical to an inference and completely
 * different to a reader:
 *
 *  - "We track this and there are currently none" (a real, empty list)
 *  - "We do not track this here" (not applicable, or not built yet)
 *
 * The UAE is the case that forces this. It has no equivalent of UPSC or SSC,
 * so an empty exams list there is not a gap to be filled — it is the correct
 * and permanent answer. Rendering it as an empty search result would read as a
 * bug, and inventing exams to fill it would be a lie.
 */
export const COVERAGE_SECTIONS = [
  "careers",
  "exams",
  "jobs",
  "business",
  "courses",
  "mentors",
  "scholarships",
] as const;

export type CoverageSection = (typeof COVERAGE_SECTIONS)[number];

export const SECTION_LABELS: Record<CoverageSection, string> = {
  careers: "Careers",
  exams: "Government exams",
  jobs: "Jobs",
  business: "Business models",
  courses: "Courses",
  mentors: "Mentors",
  scholarships: "Scholarships",
};

/**
 * What a section's coverage state means.
 *
 * `NOT_APPLICABLE` is the one that earns its place: it is how a country says
 * "this concept does not exist here" without an empty list implying we simply
 * have not got round to it.
 */
export type CoverageState = "COVERED" | "PARTIAL" | "PLANNED" | "NOT_APPLICABLE";

export const COVERAGE_LABELS: Record<CoverageState, string> = {
  COVERED: "Covered",
  PARTIAL: "Partial",
  PLANNED: "Planned",
  NOT_APPLICABLE: "Not applicable here",
};
