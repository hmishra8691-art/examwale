import type { Metadata } from "next";
import Link from "next/link";
import { listJobRegions, listJobs } from "@/modules/jobs/service";
import { Badge, ButtonLink, Callout, Card, EmptyState } from "@/components/ui";
import { formatMoneyRange, relativeDays, titleCase } from "@/modules/shared/format";
import { JobFilters } from "@/components/job-filters";
import { int, many, one, oneOf } from "@/modules/shared/params";
import { AdSlot } from "@/components/ad-slot";
import { getCountry } from "@/modules/geo/service";
import { CoverageNotice } from "@/components/coverage-notice";

export const metadata: Metadata = {
  title: "Jobs",
  description: "Search jobs across India by location, salary, experience and work style.",
};

export const revalidate = 120;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const SORTS = ["recent", "salary"] as const;
const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "APPRENTICESHIP", "FREELANCE"];
const REMOTE_TYPES = ["ONSITE", "HYBRID", "REMOTE"];

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  // Enum-valued filters are intersected with the allowed set rather than passed
  // through: an unrecognised value would reach Postgres as an invalid enum cast.
  const within = (values: string[] | undefined, allowed: string[]) =>
    values?.filter((value) => allowed.includes(value));

  const [regions, results, resolvedCountry] = await Promise.all([
    listJobRegions(),
    listJobs({
      search: one(params.q),
      region: one(params.region),
      employmentType: within(many(params.type), EMPLOYMENT_TYPES),
      remoteType: within(many(params.remote), REMOTE_TYPES),
      minSalary: int(params.minSalary, { min: 0, max: 100_000_000 }),
      maxExperience: int(params.exp, { min: 0, max: 60 }),
      sort: oneOf(params.sort, SORTS) ?? "recent",
      page: int(params.page, { min: 1, max: 500 }) ?? 1,
    }),
    getCountry(),
  ]);

  const adCountryId = resolvedCountry.id;

  return (
    <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Jobs
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {results.total} openings. Sign in and add your skills to see how well you match each one.
        </p>
      </header>

      <CoverageNotice section="jobs" className="mt-6" />

      <Callout tone="info" title="About these listings">
        <p>
          This deployment is seeded with sample listings for demonstration. Before going live,
          replace them with real postings from verified employers or a licensed aggregator — a demo
          listing must never be mistaken for a real vacancy.
        </p>
      </Callout>

      <div className="mt-6">
        <JobFilters
          regions={regions.map((region) => region.name)}
          current={{
            q: one(params.q) ?? "",
            region: one(params.region) ?? "",
            type: many(params.type) ?? [],
            remote: many(params.remote) ?? [],
            sort: one(params.sort) ?? "recent",
            exp: one(params.exp) ?? "",
          }}
        />
      </div>

      {results.items.length === 0 ? (
        <EmptyState
          title="No jobs matched"
          description="Try widening the location or clearing the experience filter."
          action={
            <ButtonLink href="/jobs" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-6 space-y-3">
          {results.items.map((job) => (
            <Card as="li" key={job.slug} className="relative">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-semibold">
                    <Link href={`/jobs/${job.slug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {job.title}
                    </Link>
                  </h2>
                  <p className="text-sm text-muted">
                    {job.companyName} · {job.city ?? job.regionName ?? "India"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium tabular-nums">
                    {job.isSalaryDisclosed
                      ? formatMoneyRange(job.salaryMin, job.salaryMax, job.currencyCode)
                      : "Not disclosed"}
                  </p>
                  <p className="text-xs text-faint">{relativeDays(job.postedAt)}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="neutral">{titleCase(job.employmentType)}</Badge>
                <Badge tone={job.remoteType === "REMOTE" ? "good" : "neutral"}>
                  {titleCase(job.remoteType)}
                </Badge>
                <Badge tone="neutral">
                  {job.experienceMinYears}
                  {job.experienceMaxYears ? `–${job.experienceMaxYears}` : "+"} yrs
                </Badge>
                {(job.skillsRequired as string[]).slice(0, 4).map((skill) => (
                  <Badge key={skill} tone="brand">
                    {skill}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </ul>
      )}

      {results.totalPages > 1 ? (
        <nav aria-label="Pagination" className="mt-8 flex justify-center gap-2">
          {Array.from({ length: Math.min(10, results.totalPages) }).map((_, index) => {
            const page = index + 1;
            const query = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
              if (typeof value === "string" && key !== "page") query.set(key, value);
            }
            query.set("page", String(page));
            return (
              <Link
                key={page}
                href={`/jobs?${query.toString()}`}
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

      {/*
        Paid placement sits below the results, never inside them. Renders
        nothing for subscribers with the adFree entitlement, and nothing at all
        when no approved campaign matches.
      */}
      <AdSlot slot="jobs-footer" countryId={adCountryId} className="mt-10" />
    </div>
  );
}
