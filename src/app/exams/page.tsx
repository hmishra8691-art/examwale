import type { Metadata } from "next";
import Link from "next/link";
import { listExamCategories, listExams } from "@/modules/exams/service";
import { Badge, ButtonLink, Card, EmptyState, Pill } from "@/components/ui";
import { levelLabel, titleCase } from "@/modules/shared/format";
import { ExamFilters } from "@/components/exam-filters";
import { int, one } from "@/modules/shared/params";
import { CoverageNotice } from "@/components/coverage-notice";

export const metadata: Metadata = {
  title: "Government exams",
  description:
    "Eligibility, exam pattern, syllabus and realistic preparation time for India's major government recruitment examinations.",
};

export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ExamsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const [categories, results] = await Promise.all([
    listExamCategories(),
    listExams({
      category: one(params.category),
      search: one(params.q),
      maxAge: int(params.age, { min: 10, max: 80 }),
      page: int(params.page, { min: 1, max: 500 }) ?? 1,
    }),
  ]);

  return (
    <div className="page py-8">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Government exams
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          {results.total} examinations with eligibility, stages, syllabus and pay structure. Dates
          and vacancy counts change every cycle — we link you to the official notification rather
          than repeating a number that may be out of date.
        </p>
      </header>

      <CoverageNotice section="exams" className="mt-6" />

      <nav aria-label="Exam categories" className="mb-4 flex flex-wrap gap-2">
        <Link href="/exams">
          <Pill active={!one(params.category)}>All categories</Pill>
        </Link>
        {categories.map((category) => (
          <Link key={category.category} href={`/exams?category=${category.category}`}>
            <Pill active={one(params.category) === category.category}>
              {titleCase(category.category)}
              <span className="ml-1.5 text-xs opacity-60">{category.count}</span>
            </Pill>
          </Link>
        ))}
      </nav>

      <ExamFilters current={{ q: one(params.q) ?? "", age: one(params.age) ?? "", category: one(params.category) }} />

      {results.items.length === 0 ? (
        <EmptyState
          title="No exams matched"
          description="Try a different category, or clear the age filter — many exams have relaxations that widen eligibility."
          action={
            <ButtonLink href="/exams" variant="secondary">
              Clear filters
            </ButtonLink>
          }
        />
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.items.map((exam) => {
            const age = exam.ageLimit as { min?: number; max?: number };
            return (
              <Card as="li" key={exam.slug} className="relative flex flex-col gap-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold">
                      <Link href={`/exams/${exam.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {exam.shortName}
                      </Link>
                    </h2>
                    <Badge>{titleCase(exam.category)}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{exam.name}</p>
                  <p className="text-xs text-faint">{exam.organisationShort}</p>
                </div>

                <p className="line-clamp-3 text-sm text-muted">{exam.description}</p>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-sm">
                  <div>
                    <dt className="text-xs text-faint">Age</dt>
                    <dd className="font-medium tabular-nums">
                      {age.min ?? "—"}–{age.max ?? "no limit"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-faint">Typical prep</dt>
                    <dd className="font-medium">{exam.preparationMonthsTypical ?? "?"} months</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs text-faint">Minimum education</dt>
                    <dd className="text-sm">{exam.educationRequirement}</dd>
                  </div>
                </dl>

                <Badge tone={exam.difficultyLevel === "VERY_HIGH" ? "bad" : "warn"}>
                  {levelLabel(exam.difficultyLevel)} difficulty
                </Badge>
              </Card>
            );
          })}
        </ul>
      )}
    </div>
  );
}
