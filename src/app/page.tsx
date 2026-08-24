import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { careerProfiles, countries, exams, occupationGroups, occupations } from "@/db/schema";
import { AskBox } from "@/components/ask-box";
import { Badge, ButtonLink, Card } from "@/components/ui";
import { formatMoneyRange } from "@/modules/shared/format";
import { getSession } from "@/modules/auth/session";

export const revalidate = 300;

const EXAMPLE_QUESTIONS = [
  "I'm in class 10 and I like computers. What should I do after 10th?",
  "I'm 25 and want to change my career.",
  "I have a B.Com degree but don't know what to do.",
  "I want to become a software engineer but can't afford an expensive college.",
  "I want to prepare for UPSC while working.",
  "I have ₹50,000 and want to start a business.",
  "Which government exams can I apply for at 27?",
  "I want to become a doctor. Explain every step.",
];

const AUDIENCES = [
  { label: "School students", href: "/pathways", detail: "Class 10 and 12 choices, explained without the panic" },
  { label: "Graduates", href: "/careers", detail: "What your degree actually opens up" },
  { label: "Career changers", href: "/assessment", detail: "Move fields without starting from zero" },
  { label: "Exam aspirants", href: "/exams", detail: "Syllabus, eligibility and an honest study plan" },
  { label: "Job seekers", href: "/jobs", detail: "Roles matched to what you can already do" },
  { label: "First-time founders", href: "/business", detail: "Costs, licences and break-even, before you spend" },
];

export default async function HomePage() {
  const session = await getSession();

  const [groups, popularCareers, popularExams, counts] = await Promise.all([
    db
      .select({
        slug: occupationGroups.slug,
        name: occupationGroups.name,
        icon: occupationGroups.icon,
        count: sql<number>`count(${careerProfiles.id})::int`,
      })
      .from(occupationGroups)
      .leftJoin(occupations, eq(occupations.groupId, occupationGroups.id))
      .leftJoin(
        careerProfiles,
        and(eq(careerProfiles.occupationId, occupations.id), eq(careerProfiles.status, "PUBLISHED")),
      )
      .groupBy(occupationGroups.slug, occupationGroups.name, occupationGroups.icon, occupationGroups.sequence)
      .orderBy(occupationGroups.sequence)
      .limit(10),

    db
      .select({
        slug: careerProfiles.slug,
        name: occupations.name,
        summary: careerProfiles.summary,
        salaryEntryMin: careerProfiles.salaryEntryMin,
        salaryEntryMax: careerProfiles.salaryEntryMax,
        currencyCode: careerProfiles.currencyCode,
        demand: careerProfiles.futureDemandLevel,
        groupName: occupationGroups.name,
      })
      .from(careerProfiles)
      .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
      .innerJoin(occupationGroups, eq(occupations.groupId, occupationGroups.id))
      .where(eq(careerProfiles.status, "PUBLISHED"))
      .orderBy(desc(careerProfiles.futureDemandLevel))
      .limit(6),

    db
      .select({
        slug: exams.slug,
        name: exams.name,
        shortName: exams.shortName,
        category: exams.category,
        description: exams.description,
      })
      .from(exams)
      .where(eq(exams.status, "PUBLISHED"))
      .limit(6),

    db
      .select({
        careers: sql<number>`(SELECT count(*) FROM career_profiles WHERE status = 'PUBLISHED')::int`,
        exams: sql<number>`(SELECT count(*) FROM exams WHERE status = 'PUBLISHED')::int`,
        jobs: sql<number>`(SELECT count(*) FROM job_postings WHERE status = 'ACTIVE')::int`,
      })
      .from(countries)
      .limit(1),
  ]);

  const totals = counts[0] ?? { careers: 0, exams: 0, jobs: 0 };

  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className="relative overflow-hidden border-b">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-brand-100),transparent_70%)] opacity-70 dark:opacity-25"
        />
        <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pt-20">
          <Badge tone="saffron" className="mb-5">
            India first · built to add more countries
          </Badge>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Discover what you should do next.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-muted sm:text-lg">
            Tell us where you are — your education, interests, budget, and the time you actually
            have. We&rsquo;ll show you the options, what each one really costs, and whether it is
            realistic.
          </p>

          <div className="mt-8">
            <AskBox examples={EXAMPLE_QUESTIONS} signedIn={Boolean(session)} />
          </div>

          <dl className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm">
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Career guides</dt>
              <dd className="text-lg font-semibold tabular-nums">{totals.careers}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Government exams</dt>
              <dd className="text-lg font-semibold tabular-nums">{totals.exams}</dd>
            </div>
            <div className="flex items-baseline gap-2">
              <dt className="text-muted">Live jobs</dt>
              <dd className="text-lg font-semibold tabular-nums">{totals.jobs}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* Who it's for ---------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Wherever you&rsquo;re starting from
        </h2>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AUDIENCES.map((audience) => (
            <Link
              key={audience.label}
              href={audience.href}
              className="card group p-5 transition-colors hover:border-brand-400"
            >
              <p className="font-medium group-hover:text-brand-600">{audience.label}</p>
              <p className="mt-1 text-sm text-muted">{audience.detail}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works ---------------------------------------------------- */}
      <section className="border-y bg-[var(--surface-raised)]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            How it works
          </h2>
          <p className="mt-2 max-w-2xl text-muted">
            The order matters. Most sites start with the opportunity and hope it fits you. We start
            with you.
          </p>
          <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                step: "Understand you",
                detail:
                  "Education, interests, skills, budget, location, hours available. The constraints are the point — a plan that ignores them isn't a plan.",
              },
              {
                step: "Show real options",
                detail:
                  "Every career, exam and business idea comes with eligibility, cost, time, salary range and the honest downsides.",
              },
              {
                step: "Check what's realistic",
                detail:
                  "We do the arithmetic on your timeline and hours. If the numbers don't work, we say so and show the version that does.",
              },
              {
                step: "Build the roadmap",
                detail:
                  "A dated, step-by-step path from where you are to where you're going — and the jobs and resources along the way.",
              },
            ].map((item, index) => (
              <li key={item.step} className="relative">
                <span className="font-[family-name:var(--font-display)] text-3xl font-semibold text-brand-500/40 tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-1 font-medium">{item.step}</h3>
                <p className="mt-1 text-sm text-muted">{item.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* AI tools -------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              Tools that do the work with you
            </h2>
            <p className="mt-1 max-w-2xl text-muted">
              Every score below is computed from a rulebook you can read. The AI writes the
              explanation — it does not set the number, and it cannot recommend something the
              platform has no guide for.
            </p>
          </div>
          <ButtonLink href="/ai" variant="secondary" size="sm">
            All AI tools
          </ButtonLink>
        </div>
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              href: "/ai/resume",
              title: "Résumé review",
              detail: "Scored against the role you want, with your own lines rewritten.",
            },
            {
              href: "/ai/interview",
              title: "Interview practice",
              detail: "Questions from the role's guide, then feedback on how you answered.",
            },
            {
              href: "/ai/recommendations",
              title: "What suits me",
              detail: "A ranked shortlist — including why each one might not fit.",
            },
            {
              href: "/chat",
              title: "Career assistant",
              detail: "Ask anything. Answers cite the records they came from.",
            },
          ].map((tool) => (
            <li key={tool.href}>
              <Link
                href={tool.href}
                className="card group flex h-full flex-col p-5 transition-colors hover:border-brand-400"
              >
                <p className="font-medium group-hover:text-brand-600">{tool.title}</p>
                <p className="mt-1 text-sm text-muted">{tool.detail}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Career fields --------------------------------------------------- */}
      <section className="mx-auto max-w-7xl border-t px-4 py-14 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              Browse by field
            </h2>
            <p className="mt-1 text-muted">No account needed to read any of this.</p>
          </div>
          <ButtonLink href="/careers" variant="secondary" size="sm">
            All careers
          </ButtonLink>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {groups
            .filter((group) => group.count > 0)
            .map((group) => (
              <Link
                key={group.slug}
                href={`/careers?group=${group.slug}`}
                className="card flex flex-col gap-1 p-4 transition-colors hover:border-brand-400"
              >
                <span aria-hidden className="text-xl">
                  {group.icon ?? "•"}
                </span>
                <span className="text-sm font-medium">{group.name}</span>
                <span className="text-xs text-faint">{group.count} careers</span>
              </Link>
            ))}
        </div>
      </section>

      {/* Featured careers ------------------------------------------------ */}
      {popularCareers.length ? (
        <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
              High-demand right now
            </h2>
            <ButtonLink href="/careers?sort=demand" variant="ghost" size="sm">
              See all →
            </ButtonLink>
          </div>
          <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {popularCareers.map((career) => (
              <Card as="li" key={career.slug} className="relative flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">
                    <Link href={`/careers/${career.slug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {career.name}
                    </Link>
                  </h3>
                  <Badge tone="good">High demand</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm text-muted">{career.summary}</p>
                <p className="mt-3 text-sm">
                  <span className="text-muted">Entry pay: </span>
                  <span className="font-medium tabular-nums">
                    {formatMoneyRange(career.salaryEntryMin, career.salaryEntryMax, career.currencyCode)}
                  </span>
                </p>
                <p className="mt-1 text-xs text-faint">{career.groupName}</p>
              </Card>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Exams ----------------------------------------------------------- */}
      {popularExams.length ? (
        <section className="border-t bg-[var(--surface-raised)]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
                  Government exams
                </h2>
                <p className="mt-1 text-muted">
                  Structure, eligibility and syllabus — with a study plan built around your hours.
                </p>
              </div>
              <ButtonLink href="/exams" variant="secondary" size="sm">
                All exams
              </ButtonLink>
            </div>
            <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {popularExams.map((exam) => (
                <Card as="li" key={exam.slug} className="relative">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">
                      <Link href={`/exams/${exam.slug}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {exam.shortName}
                      </Link>
                    </h3>
                    <Badge>{exam.category.replace(/-/g, " ")}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{exam.name}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{exam.description}</p>
                </Card>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* Honesty ---------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-saffron-200 bg-saffron-50/60 p-6 dark:border-saffron-800 dark:bg-saffron-900/15 sm:p-8">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight sm:text-2xl">
            What we won&rsquo;t do
          </h2>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            {[
              {
                title: "Guarantee outcomes",
                detail:
                  "No promises of admission, a job, a salary, exam success or business profit. Anyone promising you those is selling something.",
              },
              {
                title: "Invent facts",
                detail:
                  "Exam dates, eligibility, fees and salary ranges come from the database with a source and a date attached. Where we don't know, we say so.",
              },
              {
                title: "Let ads shape advice",
                detail:
                  "Sponsored listings are labelled and kept out of the ranking that produces your recommendations. They cannot buy their way into your results.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="font-medium">{item.title}</h3>
                <p className="mt-1 text-sm text-muted">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA -------------------------------------------------------------- */}
      <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6">
        <div className="rounded-2xl bg-ink-900 px-6 py-12 text-center dark:bg-ink-800 sm:px-12">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Ten minutes now, a clearer decade after
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-ink-300">
            Fill in your situation once. Every recommendation, roadmap and job match after that is
            scored against it.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href={session ? "/assessment" : "/signup"} size="lg">
              {session ? "Take the assessment" : "Create a free account"}
            </ButtonLink>
            <ButtonLink
              href="/careers"
              size="lg"
              variant="secondary"
              className="!border-ink-600 !bg-transparent !text-white hover:!bg-ink-700"
            >
              Browse without an account
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
