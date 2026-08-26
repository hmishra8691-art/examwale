import Link from "next/link";
import { and, asc, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  careerProfiles,
  companies,
  countries,
  courses,
  examEditions,
  exams,
  jobPostings,
  occupationGroups,
  occupations,
  providers,
} from "@/db/schema";
import { AskBox } from "@/components/ask-box";
import { ButtonLink } from "@/components/ui";
import {
  Countdown,
  DiscoveryCard,
  DiscoverySection,
  Rail,
  StatTile,
  Tag,
} from "@/components/discovery";
import {
  employmentTypeLabel,
  formatMoneyRange,
  remoteTypeLabel,
} from "@/modules/shared/format";
import { getSession } from "@/modules/auth/session";

export const revalidate = 300;

/*
  The homepage is a feed, not a brochure.

  The old version opened with a full screen of centred prose and a search box,
  then explained the product. That is a page for somebody who already decided
  to be here. The people this is for arrive not knowing what they want, and the
  first screen has to give them something to react to — a deadline that is
  close, a career they had not considered, a field to poke at.

  So: a compact hero that states the promise and gets out of the way, then
  rails of real rows. Everything below the hero is a live query. Nothing on
  this page is a placeholder or an illustration of what the product might one
  day contain.
*/

const EXAMPLE_QUESTIONS = [
  "I'm in class 10 and I like computers. What should I do after 10th?",
  "I'm 25 and want to change my career.",
  "I have a B.Com degree but don't know what to do.",
  "I want to prepare for UPSC while working.",
  "I have ₹50,000 and want to start a business.",
  "Which government exams can I apply for at 27?",
];

/**
 * The route through the system, as most people actually experience it.
 *
 * Rendered as a row of links rather than a graphic: each step is a real
 * destination, so somebody who recognises themselves at "Class 12" can go
 * straight there. A diagram that only illustrates the journey would be the
 * kind of decoration this redesign is trying to remove.
 */
const PATH_STEPS = [
  { label: "Class 10", href: "/pathways", detail: "Stream choice" },
  { label: "Class 12", href: "/pathways", detail: "Degree or diploma" },
  { label: "College", href: "/careers", detail: "What it opens" },
  { label: "Skills", href: "/courses", detail: "What to learn" },
  { label: "Exams", href: "/exams", detail: "Eligibility, dates" },
  { label: "Work", href: "/jobs", detail: "Roles you can get" },
];

const DEMAND_LABEL: Record<string, string> = {
  VERY_HIGH: "Very high demand",
  HIGH: "High demand",
  MEDIUM: "Steady demand",
  LOW: "Low demand",
  VERY_LOW: "Declining",
};

export default async function HomePage() {
  const session = await getSession();

  const [groups, popularCareers, closingExams, freshJobs, topCourses, counts] = await Promise.all([
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
      .limit(12),

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
      .limit(8),

    /*
      Exams whose application window is still open, soonest first.

      This is the single most time-sensitive thing the product knows, which is
      why it sits above everything else. Editions with no `applicationEnd` are
      excluded rather than shown as "no deadline" — an unannounced date and an
      absent deadline look identical in the column and mean opposite things.
    */
    db
      .select({
        slug: exams.slug,
        name: exams.name,
        shortName: exams.shortName,
        category: exams.category,
        applicationEnd: examEditions.applicationEnd,
        vacancyCount: examEditions.vacancyCount,
        year: examEditions.year,
      })
      .from(examEditions)
      .innerJoin(exams, eq(examEditions.examId, exams.id))
      .where(
        and(
          eq(exams.status, "PUBLISHED"),
          isNotNull(examEditions.applicationEnd),
          gt(examEditions.applicationEnd, sql`now()`),
        ),
      )
      .orderBy(asc(examEditions.applicationEnd))
      .limit(8),

    db
      .select({
        slug: jobPostings.slug,
        title: jobPostings.title,
        company: companies.name,
        city: jobPostings.city,
        employmentType: jobPostings.employmentType,
        remoteType: jobPostings.remoteType,
        salaryMin: jobPostings.salaryMin,
        salaryMax: jobPostings.salaryMax,
        currencyCode: jobPostings.currencyCode,
        isSalaryDisclosed: jobPostings.isSalaryDisclosed,
        expiresAt: jobPostings.expiresAt,
        experienceMinYears: jobPostings.experienceMinYears,
      })
      .from(jobPostings)
      .innerJoin(companies, eq(jobPostings.companyId, companies.id))
      .where(eq(jobPostings.status, "ACTIVE"))
      .orderBy(desc(jobPostings.postedAt))
      .limit(8),

    db
      .select({
        id: courses.id,
        title: courses.title,
        provider: providers.name,
        format: courses.format,
        duration: courses.duration,
        isFree: courses.isFree,
        cost: courses.cost,
        currencyCode: courses.currencyCode,
      })
      .from(courses)
      .innerJoin(providers, eq(courses.providerId, providers.id))
      .where(eq(courses.status, "PUBLISHED"))
      .limit(8),

    db
      .select({
        careers: sql<number>`(SELECT count(*) FROM career_profiles WHERE status = 'PUBLISHED')::int`,
        exams: sql<number>`(SELECT count(*) FROM exams WHERE status = 'PUBLISHED')::int`,
        jobs: sql<number>`(SELECT count(*) FROM job_postings WHERE status = 'ACTIVE')::int`,
        mentors: sql<number>`(SELECT count(*) FROM mentors WHERE status = 'ACTIVE')::int`,
      })
      .from(countries)
      .limit(1),
  ]);

  const totals = counts[0] ?? { careers: 0, exams: 0, jobs: 0, mentors: 0 };

  return (
    <>
      {/* Hero ------------------------------------------------------------ */}
      <section className="wash relative border-b">
        {/*
          Two columns from lg. The old hero was a 3xl block inside an 88rem
          container, so on a desktop the right 55% of the first screen was
          empty — the exact "poor use of screen real estate" this redesign was
          asked to fix. The right column is not filler: it is the same trending
          data as the rail below, surfaced above the fold so the first screen
          already contains something to click.
        */}
        <div className="page relative grid gap-8 pb-10 pt-10 sm:pb-12 sm:pt-14 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
          <div className="stack-safe">
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">
              <span aria-hidden className="size-1.5 rounded-full bg-current animate-pulse-dot" />
              India &amp; UAE · {totals.careers} career guides
            </p>
            <h1 className="font-display text-[2.5rem] font-extrabold leading-[1.05] sm:text-6xl">
              Explore your future.
              <br />
              <span className="text-brand-ink">Find your path.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">
              Real salaries, real eligibility, real deadlines — and verified people who have
              actually done the job.
            </p>

            <div className="mt-7">
              <AskBox examples={EXAMPLE_QUESTIONS} signedIn={Boolean(session)} />
            </div>

            <dl className="mt-8 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <StatTile value={totals.careers} label="Career guides" tone="brand" />
              <StatTile value={totals.exams} label="Government exams" />
              <StatTile value={totals.jobs} label="Live jobs" />
              <StatTile value={totals.mentors} label="Verified mentors" tone="accent" />
            </dl>
          </div>

          {/* Above-the-fold discovery, desktop only — on a phone this would
              push the search box off the first screen, and the same rows are
              a short scroll away. */}
          <aside className="hidden lg:block">
            <div className="card p-4">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">
                <span aria-hidden className="size-1.5 rounded-full bg-current animate-pulse-dot" />
                Popular right now
              </p>
              <ul className="space-y-1">
                {popularCareers.slice(0, 5).map((career, i) => (
                  <li key={career.slug}>
                    <Link
                      href={`/careers/${career.slug}`}
                      className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--surface-sunken)]"
                    >
                      <span aria-hidden className="numeric w-5 shrink-0 text-sm font-bold text-faint">
                        {i + 1}
                      </span>
                      <span className="stack-safe flex-1">
                        <span className="block truncate text-sm font-semibold group-hover:text-brand-ink">
                          {career.name}
                        </span>
                        <span className="numeric block text-xs text-muted">
                          {formatMoneyRange(
                            career.salaryEntryMin,
                            career.salaryEntryMax,
                            career.currencyCode ?? "INR",
                          )}
                        </span>
                      </span>
                      <span aria-hidden className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5">
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/careers"
                className="mt-3 block border-t border-[var(--border)] pt-3 text-sm font-semibold text-brand-ink hover:underline"
              >
                Browse all {totals.careers} careers <span aria-hidden>→</span>
              </Link>
            </div>
          </aside>
        </div>
      </section>

      <div className="page space-y-12 py-10 sm:space-y-14 sm:py-14">
        {/* Closing soon ------------------------------------------------- */}
        {closingExams.length ? (
          <DiscoverySection
            eyebrow="Closing soon"
            title="Applications open right now"
            description="Windows that shut in the next few weeks. Dates come from the official notification."
            seeAll={{ href: "/exams", label: "All exams" }}
          >
            <Rail label="Exams closing soon">
              {closingExams.map((exam) => (
                <li key={`${exam.slug}-${exam.year}`}>
                  <DiscoveryCard
                    href={`/exams/${exam.slug}`}
                    category="exam"
                    title={exam.shortName ?? exam.name}
                    subtitle={exam.shortName ? exam.name : undefined}
                    accessory={<Countdown deadline={exam.applicationEnd} />}
                    meta={[
                      <span key="y">{exam.year}</span>,
                      exam.vacancyCount ? (
                        <span key="v">
                          <span className="numeric font-semibold text-[var(--text)]">
                            {exam.vacancyCount.toLocaleString("en-IN")}
                          </span>{" "}
                          vacancies
                        </span>
                      ) : null,
                    ].filter(Boolean)}
                    tags={exam.category ? [exam.category] : undefined}
                  />
                </li>
              ))}
            </Rail>
          </DiscoverySection>
        ) : null}

        {/* Trending careers --------------------------------------------- */}
        <DiscoverySection
          eyebrow="Trending"
          title="Careers people are exploring"
          description="Ranked by projected demand. Salary bands are entry-level, and every figure is sourced."
          seeAll={{ href: "/careers", label: "All careers" }}
        >
          <Rail label="Trending careers">
            {popularCareers.map((career) => (
              <li key={career.slug}>
                <DiscoveryCard
                  href={`/careers/${career.slug}`}
                  category="career"
                  title={career.name}
                  subtitle={career.summary}
                  meta={[
                    <span key="s" className="numeric font-semibold text-[var(--text)]">
                      {formatMoneyRange(
                        career.salaryEntryMin,
                        career.salaryEntryMax,
                        career.currencyCode ?? "INR",
                      )}
                    </span>,
                    <span key="d">{DEMAND_LABEL[career.demand] ?? career.demand}</span>,
                  ]}
                  tags={career.groupName ? [career.groupName] : undefined}
                />
              </li>
            ))}
          </Rail>
        </DiscoverySection>

        {/* Find your path ------------------------------------------------ */}
        <section className="stack-safe">
          <h2 className="font-display text-xl font-bold sm:text-2xl">Find your path</h2>
          <p className="mt-1 text-sm text-muted">
            Wherever you are now, there is a route from here. Pick the step you&rsquo;re on.
          </p>
          <ol className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
            {PATH_STEPS.map((step, i) => (
              <li key={step.label} className="stack-safe">
                <Link
                  href={step.href}
                  className="card-interactive group flex h-full flex-col gap-1 p-3.5"
                >
                  <span
                    aria-hidden
                    className="numeric text-xs font-bold text-faint"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="font-display text-sm font-bold group-hover:text-brand-ink">
                    {step.label}
                  </span>
                  <span className="text-xs text-muted">{step.detail}</span>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        {/* Fresh jobs ---------------------------------------------------- */}
        {freshJobs.length ? (
          <DiscoverySection
            eyebrow="Just posted"
            title="Openings worth a look"
            description="Every employer posting here is a verified organisation, approved by a moderator."
            seeAll={{ href: "/jobs", label: "All jobs" }}
          >
            <Rail label="Recent jobs" size="lg">
              {freshJobs.map((job) => (
                <li key={job.slug}>
                  <DiscoveryCard
                    href={`/jobs/${job.slug}`}
                    category="job"
                    title={job.title}
                    subtitle={job.company}
                    accessory={<Countdown deadline={job.expiresAt} />}
                    meta={[
                      job.city ? <span key="c">{job.city}</span> : null,
                      job.isSalaryDisclosed && (job.salaryMin || job.salaryMax) ? (
                        <span key="s" className="numeric font-semibold text-[var(--text)]">
                          {formatMoneyRange(job.salaryMin, job.salaryMax, job.currencyCode ?? "INR")}
                        </span>
                      ) : (
                        // Not "₹0" and not blank: an undisclosed salary is a
                        // fact about the posting, and hiding it lets a reader
                        // assume we simply failed to load it.
                        <span key="s" className="text-faint">
                          Salary not disclosed
                        </span>
                      ),
                      job.experienceMinYears != null ? (
                        <span key="e">{job.experienceMinYears}+ yrs</span>
                      ) : null,
                    ].filter(Boolean)}
                    tags={[employmentTypeLabel(job.employmentType), remoteTypeLabel(job.remoteType)].filter(Boolean)}
                  />
                </li>
              ))}
            </Rail>
          </DiscoverySection>
        ) : null}

        {/* Explore by field ---------------------------------------------- */}
        <DiscoverySection
          title="Explore by field"
          description="Every published guide, grouped the way careers actually cluster."
          seeAll={{ href: "/careers" }}
        >
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {groups
              .filter((g) => g.count > 0)
              .map((group) => (
                <li key={group.slug} className="stack-safe">
                  <Link
                    href={`/careers?group=${group.slug}`}
                    className="card-interactive group flex h-full items-center justify-between gap-2 p-3.5"
                  >
                    <span className="stack-safe">
                      <span className="block truncate text-sm font-semibold group-hover:text-brand-ink">
                        {group.name}
                      </span>
                      <span className="text-xs text-muted">
                        {group.count} {group.count === 1 ? "guide" : "guides"}
                      </span>
                    </span>
                    <span aria-hidden className="shrink-0 text-faint transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </DiscoverySection>

        {/* Courses -------------------------------------------------------- */}
        {topCourses.length ? (
          <DiscoverySection
            title="Learn the skills"
            description="Coaching and courses from listed providers. Fees are per batch, not per course."
            seeAll={{ href: "/courses", label: "All courses" }}
          >
            <Rail label="Courses">
              {topCourses.map((course) => (
                <li key={course.id}>
                  <DiscoveryCard
                    href={`/courses/${course.id}`}
                    category="course"
                    title={course.title}
                    subtitle={course.provider}
                    accessory={
                      course.isFree ? (
                        <Tag className="bg-verified-50 font-semibold text-verified-700 dark:bg-verified-700/20 dark:text-verified-100">
                          Free
                        </Tag>
                      ) : null
                    }
                    meta={[
                      course.duration ? <span key="d">{course.duration}</span> : null,
                      course.format ? <span key="f">{course.format}</span> : null,
                    ].filter(Boolean)}
                  />
                </li>
              ))}
            </Rail>
          </DiscoverySection>
        ) : null}

        {/* Human intelligence -------------------------------------------- */}
        <section className="wash relative overflow-hidden rounded-2xl border border-[var(--border)] p-6 sm:p-10">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-ink">
              Human intelligence
            </p>
            <h2 className="font-display text-2xl font-bold sm:text-3xl">
              A real person reads your work.
            </h2>
            <p className="mt-3 text-muted">
              Your résumé report and interview practice are scored by rule, not written by a model —
              the same input always gives the same number, so two drafts are comparable. When you
              want judgement rather than a score, you talk to a verified mentor who has actually
              done the job.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <ButtonLink href="/mentors">Find a mentor</ButtonLink>
              <ButtonLink href="/assessment" variant="secondary">
                Take the assessment
              </ButtonLink>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
