import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/modules/auth/session";
import { getProvider } from "@/modules/ai/provider";
import { getUsageSnapshot } from "@/modules/ai/usage";
import { ButtonLink, Callout, Card, Stat } from "@/components/ui";

export const metadata: Metadata = {
  title: "AI tools",
  description:
    "Career assistant, résumé review, interview practice, study plans and personalised recommendations — grounded in the platform's own guides.",
};

const TOOLS = [
  {
    href: "/chat",
    name: "Career assistant",
    tagline: "Ask anything about careers, exams, jobs or starting a business.",
    detail:
      "Answers are built from the guides in the database, and the records used are listed under each reply so you can check them.",
    icon: "chat",
    signInRequired: true,
  },
  {
    href: "/ai/resume",
    name: "Résumé review",
    tagline: "A scored review against the role you actually want.",
    detail:
      "The score comes from a stated rulebook — quantified bullets, sections, contact details, overlap with the role's skills — so two drafts are comparable.",
    icon: "doc",
    signInRequired: true,
  },
  {
    href: "/ai/interview",
    name: "Interview practice",
    tagline: "Mock questions for the role, then feedback on your answers.",
    detail:
      "Questions are built from the role's own guide. Your answer is scored on structure, specifics and ownership, and rewritten in your words.",
    icon: "mic",
    signInRequired: true,
  },
  {
    href: "/ai/recommendations",
    name: "What suits me",
    tagline: "A ranked shortlist, with the reason it might not suit you.",
    detail:
      "The shortlist is scored against real career rows. The AI explains and reorders within it — it cannot invent a career the platform has no guide for.",
    icon: "compass",
    signInRequired: false,
  },
  {
    href: "/exams",
    name: "Study plans",
    tagline: "Pick an exam, get a month-by-month plan with an honest verdict.",
    detail:
      "Hours are calculated from the syllabus weights. If your target date does not fit, the plan says so rather than compressing the syllabus quietly.",
    icon: "calendar",
    signInRequired: false,
  },
] as const;

const ICONS: Record<string, React.ReactNode> = {
  chat: (
    <path
      d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H6a2 2 0 0 1-2-2V6Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  ),
  doc: (
    <path
      d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm8 0v5h4M8 12h8M8 16h5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  mic: (
    <path
      d="M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3Zm-6 8a6 6 0 0 0 12 0M12 18v3"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="m15 9-2 4-4 2 2-4 4-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
  calendar: (
    <path
      d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Zm4-4v4m8-4v4M4 10h16"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  ),
};

export default async function AiHubPage() {
  const session = await getSession();
  const provider = getProvider();
  const usage = session ? await getUsageSnapshot(session.sub, session.plan) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
          AI tools
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Five tools, one rule
        </h1>
        <p className="mt-3 text-muted">
          Every score on this page is computed from a rulebook that is written down, and every
          factual claim comes from a record you can open. The model writes the explanation. It does
          not set the number, and it cannot recommend something the platform has no guide for.
        </p>
      </header>

      {!provider.isModelBacked ? (
        <div className="mt-6">
          <Callout tone="warn" title="Running without a language-model key">
            <p>
              These tools all work — the scoring, ranking and planning are rule-based and need no
              model. What you will not get is conversational prose or rewrites in your own wording.
              Every affected output says so where it appears rather than passing rule-built text off
              as generated.
            </p>
            <p className="mt-2 text-xs">
              To enable the generated layer, set <code>ANTHROPIC_API_KEY</code> in the environment
              and restart.
            </p>
          </Callout>
        </div>
      ) : null}

      {usage ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Stat label="Used today" value={usage.used} />
          <Stat label="Remaining today" value={usage.remaining} tone={usage.remaining > 0 ? "good" : "warn"} />
          <Stat label="Daily limit" value={usage.limit} hint="Resets at midnight" />
        </div>
      ) : null}

      <ul className="mt-8 grid gap-4 sm:grid-cols-2">
        {TOOLS.map((tool) => {
          const locked = tool.signInRequired && !session;
          const href = locked ? `/login?next=${encodeURIComponent(tool.href)}` : tool.href;
          return (
            <Card as="li" key={tool.href} className="relative flex flex-col">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                >
                  <svg viewBox="0 0 24 24" fill="none" className="size-5">
                    {ICONS[tool.icon]}
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="font-medium">
                    <Link href={href} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {tool.name}
                    </Link>
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">{tool.tagline}</p>
                </div>
              </div>
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted">{tool.detail}</p>
              {locked ? (
                <p className="mt-3 text-xs text-faint">Sign in to use this one.</p>
              ) : null}
            </Card>
          );
        })}
      </ul>

      <div className="mt-8">
        <Callout tone="info" title="What these tools will not do">
          <ul className="list-disc space-y-1 pl-4">
            <li>Tell you that you will get the job, clear the exam, or reach a salary.</li>
            <li>
              State an exam date, fee, age limit or eligibility rule that is not in a record you can
              open and check against its source.
            </li>
            <li>Write an achievement into your résumé that you did not tell it about.</li>
            <li>Recommend a career the platform has no published guide for.</li>
          </ul>
        </Callout>
      </div>

      {!session ? (
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Create a free account</ButtonLink>
          <ButtonLink href="/ai/recommendations" variant="secondary">
            Try recommendations without one
          </ButtonLink>
        </div>
      ) : null}
    </div>
  );
}
