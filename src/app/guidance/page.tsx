import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/modules/auth/session";
import { countListableMentors } from "@/modules/mentors/service";
import { Callout } from "@/components/ui";

export const metadata: Metadata = {
  title: "Guidance",
  description:
    "Structured tools that measure what can be measured, and verified people for the judgement that follows.",
};

const TOOLS = [
  {
    href: "/assessment",
    label: "Assessment",
    blurb:
      "Twelve questions about what you like, what you can afford and how long you can study. It produces the shortlist everything else works from.",
    meta: "No account needed",
  },
  {
    href: "/guidance/matches",
    label: "What suits me",
    blurb:
      "Your assessment answers scored against every published career guide, with the gaps each result scored against — not just the reasons it scored well.",
    meta: "Ranked by arithmetic",
  },
  {
    href: "/guidance/resume",
    label: "Résumé report",
    blurb:
      "A structural read of your résumé against the role you want: quantified bullets, ownership, missing sections, and overlap with the skills the role calls for.",
    meta: "Sign in required",
  },
  {
    href: "/guidance/interview",
    label: "Interview practice",
    blurb:
      "Questions built from the role's own guide, and your answers scored against a rubric you can read before you start.",
    meta: "Sign in required",
  },
];

export default async function GuidancePage() {
  const [session, mentorCount] = await Promise.all([getSession(), countListableMentors()]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Guidance
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Human intelligence, with the arithmetic done first
        </h1>
        <p className="mt-3 text-muted">
          These tools measure what can honestly be measured — counts, overlaps, rankings against
          published guides. Every one of them gives the same answer twice for the same input, and
          every one of them tells you what it could not see. The judgement that follows is a
          person&rsquo;s job.
        </p>
      </header>

      <div className="mt-8 divide-y border-y">
        {TOOLS.map((tool) => (
          <Link
            key={tool.href}
            href={tool.href}
            className="group flex items-baseline justify-between gap-6 py-5 transition-colors hover:bg-[var(--surface-raised)]"
          >
            <div className="min-w-0">
              <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold tracking-tight group-hover:text-brand-700 dark:group-hover:text-brand-200">
                {tool.label}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">{tool.blurb}</p>
            </div>
            <span className="hidden shrink-0 text-xs text-faint sm:block">{tool.meta}</span>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight">
          Where the questions go
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          There used to be an assistant here that would answer anything you typed. It is gone. It
          could produce a fluent paragraph about an eligibility rule it had half-remembered, and a
          fluent wrong answer about a deadline is worse than no answer — you act on it. Questions
          now go to people who have done the job and whose credentials somebody checked.
        </p>

        <div className="mt-4">
          {mentorCount > 0 ? (
            <Link
              href="/mentors"
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-700"
            >
              {mentorCount === 1
                ? "Find the mentor taking requests"
                : `Find a mentor — ${mentorCount} taking requests`}
            </Link>
          ) : (
            <Callout tone="warn" title="No mentors are taking requests right now">
              <p>
                Rather than open a form that nobody would answer, the directory says so. The tools
                above are unaffected — they never needed a person to run. If you want to be told
                when a mentor is available,{" "}
                {session ? (
                  <>
                    keep an eye on{" "}
                    <Link href="/mentors" className="font-medium underline underline-offset-2">
                      the directory
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    <Link href="/signup" className="font-medium underline underline-offset-2">
                      create an account
                    </Link>{" "}
                    and check the directory.
                  </>
                )}
              </p>
            </Callout>
          )}
        </div>
      </section>
    </div>
  );
}
