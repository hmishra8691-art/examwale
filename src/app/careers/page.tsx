import type { Metadata } from "next";
import Link from "next/link";
import { listCareerGroups, listCareers } from "@/modules/careers/service";
import { Badge, ButtonLink, Card, EmptyState, Meter, Pill } from "@/components/ui";
import { formatMoneyRange, formatMonths, levelIndex, levelLabel } from "@/modules/shared/format";
import { CareerFilters } from "@/components/career-filters";
import { flag, int, one, oneOf } from "@/modules/shared/params";
import { CoverageNotice } from "@/components/coverage-notice";
import { getCountry } from "@/modules/geo/service";
import { budgetBands } from "@/modules/shared/format";

export const metadata: Metadata = {
  title: "Career guides",
  description:
    "Explore careers in India with real eligibility, cost, time, salary ranges and honest downsides — no account needed.",
};

export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORTS = ["demand", "salary", "cost", "name"] as const;

export default async function CareersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const filters = {
    group: one(params.group),
    search: one(params.q),
    maxCost: int(params.maxCost, { min: 0, max: 100_000_000 }),
    remoteOnly: flag(params.remote),
    selfEmploymentOnly: flag(params.self),
    sort: oneOf(params.sort, SORTS) ?? "demand",
    page: int(params.page, { min: 1, max: 500 }) ?? 1,
  };

  const [groups, results, country] = await Promise.all([
    listCareerGroups(),
    listCareers(filters),
    getCountry(),
  ]);

  // Filter thresholds follow the market's currency, not just its symbol.
  const budgets = budgetBands(country.currencyCode);

  return (
    <div className="page py-8">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Career guides
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {results.total} careers with what they actually require, what they cost, what they pay,
          and what&rsquo;s difficult about them. Free to read, no account needed.
        </p>
      </header>

      <CoverageNotice section="careers" className="mt-6" />

      <nav aria-label="Career fields" className="mb-6 flex flex-wrap gap-2">
        <Link href="/careers">
          <Pill active={!filters.group}>All fields</Pill>
        </Link>
        {groups
          .filter((group) => group.count > 0)
          .map((group) => (
            <Link key={group.slug} href={`/careers?group=${group.slug}`}>
              <Pill active={filters.group === group.slug}>
                <span aria-hidden className="mr-1">
                  {group.icon}
                </span>
                {group.name}
                <span className="ml-1.5 text-xs opacity-60">{group.count}</span>
              </Pill>
            </Link>
          ))}
      </nav>

      <CareerFilters
        budgets={budgets}
        current={{
          q: filters.search ?? "",
          sort: filters.sort,
          remote: filters.remoteOnly,
          self: filters.selfEmploymentOnly,
          maxCost: filters.maxCost,
          group: filters.group,
        }}
      />

      {results.items.length === 0 ? (
        <EmptyState
          title="Nothing matched those filters"
          description="Try widening the budget, clearing the search, or picking a different field."
          action={
            <ButtonLink href="/careers" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.items.map((career) => (
            <Card as="li" key={career.slug} className="relative flex flex-col gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-snug">
                    <Link href={`/careers/${career.slug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {career.name}
                    </Link>
                  </h2>
                  {career.isRegulated ? <Badge tone="warn">Licensed</Badge> : null}
                </div>
                <p className="mt-0.5 text-xs text-faint">{career.groupName}</p>
              </div>

              <p className="line-clamp-3 text-sm text-muted">{career.summary}</p>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-xs text-faint">Entry pay (est.)</dt>
                  <dd className="font-medium tabular-nums">
                    {formatMoneyRange(career.salaryEntryMin, career.salaryEntryMax, career.currencyCode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-faint">Time to qualify</dt>
                  <dd className="font-medium">
                    {formatMonths(career.timeRequiredMonthsMin, career.timeRequiredMonthsMax)}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-xs text-faint">Education cost (est.)</dt>
                  <dd className="font-medium tabular-nums">
                    {career.costMin === 0
                      ? `Free – ${formatMoneyRange(null, career.costMax, career.currencyCode)}`
                      : formatMoneyRange(career.costMin, career.costMax, career.currencyCode)}
                  </dd>
                </div>
              </dl>

              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
                <Meter
                  label={`${levelLabel(career.futureDemandLevel)} demand`}
                  index={levelIndex(career.futureDemandLevel)}
                  tone="good"
                />
                <Meter
                  label={`${levelLabel(career.competitionLevel)} competition`}
                  index={levelIndex(career.competitionLevel)}
                  tone="warn"
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {career.remotePossible ? <Badge tone="brand">Remote possible</Badge> : null}
                {career.selfEmploymentPossible ? <Badge tone="brand">Self-employment</Badge> : null}
                {career.costMin === 0 ? <Badge tone="good">Free route exists</Badge> : null}
              </div>
            </Card>
          ))}
        </ul>
      )}

      {results.totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2">
          {Array.from({ length: results.totalPages }).map((_, index) => {
            const page = index + 1;
            const query = new URLSearchParams();
            if (filters.group) query.set("group", filters.group);
            if (filters.search) query.set("q", filters.search);
            if (filters.sort) query.set("sort", filters.sort);
            query.set("page", String(page));
            return (
              <Link
                key={page}
                href={`/careers?${query.toString()}`}
                aria-current={page === results.page ? "page" : undefined}
                className={
                  page === results.page
                    ? "rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white"
                    : "rounded-lg border px-3.5 py-2 text-sm hover:bg-[var(--surface-raised)]"
                }
              >
                {page}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
