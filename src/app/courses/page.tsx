import type { Metadata } from "next";
import Link from "next/link";
import { courseFilterOptions, listCourses } from "@/modules/courses/service";
import { flag, int, many, one, oneOf } from "@/modules/shared/params";
import { getMessages } from "@/modules/i18n/service";
import { formatDate } from "@/modules/shared/format";
import { Badge, Callout, Card, EmptyState, Pill, SectionHeading } from "@/components/ui";
import { BatchFee } from "@/components/course-claims";
import { CoverageNotice } from "@/components/coverage-notice";

export const metadata: Metadata = {
  title: "Courses and coaching",
  description:
    "Courses and coaching centres for Indian government exams and careers, with fees shown per batch and provider claims labelled.",
};

const SORTS = ["relevance", "fee", "starting-soon"] as const;

const MODES = [
  ["ONLINE_LIVE", "Online (live)"],
  ["ONLINE_SELF_PACED", "Online (self-paced)"],
  ["CLASSROOM", "Classroom"],
  ["HYBRID", "Hybrid"],
  ["CORRESPONDENCE", "Correspondence"],
] as const;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Rebuilds the query string with one key changed — used by the filter pills. */
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
  return query ? `/courses?${query}` : "/courses";
}

export default async function CoursesPage({ searchParams }: Props) {
  const params = await searchParams;
  const get = (key: string) => params[key];

  const [t, options, result] = await Promise.all([
    getMessages(),
    courseFilterOptions(),
    listCourses({
      search: one(get("q")),
      mode: many(get("mode")),
      examId: one(get("exam")),
      city: one(get("city")),
      maxFee: int(get("maxFee"), { min: 0, max: 100_000_000 }),
      freeOnly: flag(get("free")),
      page: int(get("page"), { min: 1, max: 5000 }),
      sort: oneOf(get("sort"), SORTS),
    }),
  ]);

  const activeMode = one(get("mode"));
  const activeExam = one(get("exam"));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <SectionHeading title={t.courses.title} description={t.courses.subtitle} />

      <CoverageNotice section="courses" className="mt-6" />

      <div className="mt-6">
        <Callout tone="info" title="How to read these listings">
          Fees are shown per batch, because that is the only level at which a fee means anything —
          and they change. Anything a provider says about its own results is labelled as a claim
          unless we have checked it, which mostly we have not.
        </Callout>
      </div>

      <form method="get" className="mt-6 flex flex-wrap gap-3">
        <input
          type="search"
          name="q"
          defaultValue={one(get("q")) ?? ""}
          placeholder={t.courses.searchPlaceholder}
          className="min-w-64 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <select
          name="sort"
          defaultValue={one(get("sort")) ?? "relevance"}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        >
          <option value="relevance">Most recently checked</option>
          <option value="fee">Lowest fee first</option>
          <option value="starting-soon">Starting soonest</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          {t.common.search}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={withParam(params, "mode", undefined)}>
          <Pill active={!activeMode}>All modes</Pill>
        </Link>
        {MODES.map(([value, label]) => (
          <Link key={value} href={withParam(params, "mode", value)}>
            <Pill active={activeMode === value}>{label}</Pill>
          </Link>
        ))}
      </div>

      {options.exams.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={withParam(params, "exam", undefined)}>
            <Pill active={!activeExam}>Any exam</Pill>
          </Link>
          {options.exams.slice(0, 10).map((exam) => (
            <Link key={exam.id} href={withParam(params, "exam", exam.id)}>
              <Pill active={activeExam === exam.id}>{exam.name}</Pill>
            </Link>
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-sm text-muted">
        {result.total} {result.total === 1 ? "course" : "courses"}
      </p>

      {result.courses.length ? (
        <ul className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {result.courses.map((row) => (
            <Card as="li" key={row.course.id} className="relative flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium">
                  <Link href={`/courses/${row.course.id}`} className="hover:text-brand-600">
                    <span className="absolute inset-0" aria-hidden />
                    {row.course.title}
                  </Link>
                </h3>
                {row.course.isFree ? <Badge tone="good">Free</Badge> : null}
              </div>

              {row.providerName ? (
                <p className="mt-1 text-sm text-muted">{row.providerName}</p>
              ) : null}

              {row.course.summary ? (
                <p className="mt-2 line-clamp-2 text-sm text-muted">{row.course.summary}</p>
              ) : null}

              <div className="mt-3 text-sm">
                <span className="text-muted">{t.courses.fee}: </span>
                <BatchFee
                  feeAmount={row.cheapestFee}
                  currencyCode={row.course.currencyCode}
                  feeNote={null}
                  isFreeCourse={row.course.isFree}
                />
              </div>

              <p className="mt-2 text-xs text-faint">
                {row.batchCount} {row.batchCount === 1 ? "batch" : "batches"}
                {row.nextStart ? ` · next starts ${formatDate(row.nextStart)}` : null}
              </p>
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No courses match that"
            description="Try removing a filter, or search for the exam name instead."
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
