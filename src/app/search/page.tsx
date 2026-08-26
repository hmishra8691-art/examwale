import type { Metadata } from "next";
import Link from "next/link";
import { describeIntent, universalSearch } from "@/modules/search/service";
import { getSession } from "@/modules/auth/session";
import { Badge, ButtonLink, Callout, Card, EmptyState } from "@/components/ui";
import { GlobalSearch } from "@/components/global-search";
import { one } from "@/modules/shared/params";

export const metadata: Metadata = {
  title: "Search",
  description: "Search careers, government exams, jobs and business ideas in plain language.",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KIND_META: Record<string, { label: string; href: string; tone: "brand" | "saffron" | "good" | "neutral" }> = {
  career: { label: "Career", href: "/careers", tone: "brand" },
  exam: { label: "Exam", href: "/exams", tone: "saffron" },
  job: { label: "Job", href: "/jobs", tone: "good" },
  business: { label: "Business", href: "/business", tone: "neutral" },
};

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = (one(params.q) ?? "").slice(0, 300);
  const session = await getSession();

  const result = query ? await universalSearch({ query, limit: 30 }) : null;
  const understood = result ? describeIntent(result.intent) : [];

  const grouped = new Map<string, typeof result extends null ? never : NonNullable<typeof result>["hits"]>();
  if (result) {
    for (const hit of result.hits) {
      const list = grouped.get(hit.kind) ?? [];
      list.push(hit);
      grouped.set(hit.kind, list);
    }
  }

  return (
    <div className="page page-measure-md py-8">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Search
        </h1>
        <p className="mt-2 text-muted">
          Ask in plain language — &ldquo;government jobs for a 25-year-old commerce graduate&rdquo;
          works as well as a keyword.
        </p>
      </header>

      {/*
        The same component as the header, at the large size. Two search boxes
        that behave differently on the same site is a small thing that makes a
        product feel unfinished — suggestions here, none there, different
        Enter behaviour. One component, one behaviour.
      */}
      <div className="mb-6">
        <GlobalSearch id="page-search" size="lg" autoFocus={!query} initialQuery={query} />
      </div>


      {!query ? (
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Try one of these</h2>
          <ul className="flex flex-wrap gap-2">
            {[
              "government jobs for a 25 year old commerce graduate",
              "careers I can start with no degree",
              "remote jobs for freshers",
              "business under 50000",
              "how to become a doctor",
              "banking exams",
              "skilled trades that pay well",
            ].map((example) => (
              <li key={example}>
                <Link
                  href={`/search?q=${encodeURIComponent(example)}`}
                  className="rounded-full border px-3 py-1.5 text-sm text-muted hover:border-brand-400 hover:text-[var(--text)]"
                >
                  {example}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {result ? (
        <>
          {understood.length ? (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">We read that as:</span>
              {understood.map((part) => (
                <Badge key={part} tone="brand">
                  {part}
                </Badge>
              ))}
            </div>
          ) : null}

          {result.hits.length === 0 ? (
            <EmptyState
              title={`Nothing found for "${query}"`}
              description="Try fewer words, or browse by category instead. If you're asking a question rather than searching for a thing, a mentor can answer it properly."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <ButtonLink href="/careers" variant="secondary" size="sm">
                    Browse careers
                  </ButtonLink>
                  <ButtonLink href="/mentors" size="sm">
                    Ask a mentor
                  </ButtonLink>
                </div>
              }
            />
          ) : (
            <div className="space-y-8">
              {["career", "exam", "job", "business"].map((kind) => {
                const hits = grouped.get(kind);
                if (!hits?.length) return null;
                const meta = KIND_META[kind];
                return (
                  <section key={kind} aria-labelledby={`group-${kind}`}>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 id={`group-${kind}`} className="text-lg font-semibold">
                        {meta.label}s
                      </h2>
                      <Link href={meta.href} className="text-sm text-brand-600 hover:underline">
                        Browse all →
                      </Link>
                    </div>
                    <ul className="space-y-2">
                      {hits.map((hit) => (
                        <Card as="li" key={`${hit.kind}-${hit.slug}`} className="relative p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="font-medium">
                                <Link href={`${meta.href}/${hit.slug}`} className="hover:text-brand-600">
                                  <span className="absolute inset-0" aria-hidden />
                                  {hit.title}
                                </Link>
                              </h3>
                              <p className="mt-0.5 line-clamp-2 text-sm text-muted">{hit.subtitle}</p>
                            </div>
                            <Badge tone={meta.tone}>{hit.meta}</Badge>
                          </div>
                        </Card>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          <Callout tone="info" title="Looking for advice rather than a page?">
            <p>
              Search finds records. If you want the reasoning — what suits you, what&rsquo;s
              realistic on your timeline, what to do first —{" "}
              <Link href={session ? `/chat?q=${encodeURIComponent(query)}` : "/signup"} className="font-medium underline">
                ask the assistant instead
              </Link>
              .
            </p>
          </Callout>
        </>
      ) : null}
    </div>
  );
}
