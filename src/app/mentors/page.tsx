import type { Metadata } from "next";
import Link from "next/link";
import { listMentors } from "@/modules/mentors/service";
import { flag, int, one } from "@/modules/shared/params";
import { getMessages } from "@/modules/i18n/service";
import { formatMoney } from "@/modules/shared/format";
import { Badge, ButtonLink, Callout, Card, EmptyState, Pill, SectionHeading } from "@/components/ui";
import { CoverageNotice } from "@/components/coverage-notice";

export const metadata: Metadata = {
  title: "Mentors",
  description:
    "Talk to someone who has done the thing you're trying to do. Every mentor here has had at least one credential checked.",
};

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

function withParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
  value: string | undefined,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === key || k === "page") continue;
    if (Array.isArray(v)) v.forEach((item) => next.append(k, item));
    else if (v) next.set(k, v);
  }
  if (value) next.set(key, value);
  const query = next.toString();
  return query ? `/mentors?${query}` : "/mentors";
}

const LANGUAGES = ["Hindi", "English", "Tamil", "Telugu", "Marathi", "Malayalam"];

export default async function MentorsPage({ searchParams }: Props) {
  const params = await searchParams;
  const get = (key: string) => params[key];

  const [t, result] = await Promise.all([
    getMessages(),
    listMentors({
      search: one(get("q")),
      language: one(get("language")),
      maxRate: int(get("maxRate"), { min: 0, max: 100_000 }),
      freeOnly: flag(get("free")),
      page: int(get("page"), { min: 1, max: 5000 }),
    }),
  ]);

  const activeLanguage = one(get("language"));
  const freeOnly = flag(get("free"));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading title={t.mentors.title} description={t.mentors.subtitle} />

      <CoverageNotice section="mentors" className="mt-6" />
        <ButtonLink href="/mentors/apply" variant="secondary">
          {t.mentors.becomeMentor}
        </ButtonLink>
      </div>

      <div className="mt-6">
        <Callout tone="info" title="What we check, and what we don't">
          Everyone listed here has had at least one credential — an exam result, an employment
          letter, a professional registration — checked by a person before their profile went
          live. We do not vet the advice itself. A verified IAS officer can still be wrong about
          your situation.
        </Callout>
      </div>

      <form method="get" className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          name="q"
          defaultValue={one(get("q")) ?? ""}
          placeholder="Search by exam, role or organisation…"
          className="min-w-64 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t.common.search}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={withParam(params, "free", freeOnly ? undefined : "1")}>
          <Pill active={freeOnly}>Free sessions only</Pill>
        </Link>
        <Link href={withParam(params, "language", undefined)}>
          <Pill active={!activeLanguage}>Any language</Pill>
        </Link>
        {LANGUAGES.map((language) => (
          <Link key={language} href={withParam(params, "language", language)}>
            <Pill active={activeLanguage === language}>{language}</Pill>
          </Link>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted">
        {result.total} {result.total === 1 ? "mentor" : "mentors"}
      </p>

      {result.mentors.length ? (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.mentors.map((row) => (
            <Card as="li" key={row.mentor.id} className="relative flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-medium">
                    <Link href={`/mentors/${row.mentor.id}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {row.name ?? "Mentor"}
                    </Link>
                  </h3>
                  <p className="mt-0.5 text-xs text-faint">
                    {[row.mentor.currentRole, row.mentor.currentOrganisation]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {row.mentor.sessionRate === 0 ? <Badge tone="good">Free</Badge> : null}
              </div>

              <p className="mt-2 line-clamp-2 text-sm text-muted">{row.mentor.headline}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="brand">{t.mentors.credentialsVerified}</Badge>
                <span className="text-faint">
                  {row.mentor.yearsExperience} yrs · {row.mentor.sessionMinutes} min
                </span>
              </div>

              <p className="mt-3 text-sm">
                <span className="text-muted">{t.mentors.rate}: </span>
                <span className="font-medium">
                  {row.mentor.sessionRate === 0
                    ? t.mentors.free
                    : formatMoney(row.mentor.sessionRate, row.mentor.currencyCode)}
                </span>
              </p>

              <p className="mt-1 text-xs text-faint">
                {row.rating.tooFew
                  ? row.rating.total === 0
                    ? "No reviews yet"
                    : `${row.rating.total} ${row.rating.total === 1 ? "review" : "reviews"} — too few to average`
                  : `★ ${row.rating.average} from ${row.rating.total} reviews`}
              </p>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No mentors match that"
            description="Try a different language filter, or clear the search."
          />
        </div>
      )}

      {result.totalPages > 1 ? (
        <nav className="mt-8 flex items-center justify-center gap-3 text-sm">
          {result.page > 1 ? (
            <Link
              href={withParam({ ...params, page: undefined }, "page", String(result.page - 1))}
              className="underline"
            >
              ← Previous
            </Link>
          ) : null}
          <span className="text-muted">
            Page {result.page} of {result.totalPages}
          </span>
          {result.page < result.totalPages ? (
            <Link
              href={withParam({ ...params, page: undefined }, "page", String(result.page + 1))}
              className="underline"
            >
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
