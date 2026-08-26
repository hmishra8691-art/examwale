import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { careerPathways, careerProfiles, educationStages, occupations, type PathwayOption } from "@/db/schema";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";
import { formatMoneyRange } from "@/modules/shared/format";

export const metadata: Metadata = {
  title: "After Class 10 and 12",
  description:
    "What each stream and route actually leads to after Class 10 and Class 12 in India — including the routes back if you change your mind.",
};

export const revalidate = 600;

export default async function PathwaysPage() {
  const pathways = await db
    .select({
      id: careerPathways.id,
      title: careerPathways.title,
      description: careerPathways.description,
      options: careerPathways.options,
      stageName: educationStages.name,
      stageSequence: educationStages.sequence,
    })
    .from(careerPathways)
    .innerJoin(educationStages, eq(careerPathways.fromStageId, educationStages.id))
    .orderBy(asc(educationStages.sequence));

  // Resolve every referenced career once so the cards can show real numbers.
  const allSlugs = [
    ...new Set(
      pathways.flatMap((pathway) =>
        (pathway.options as PathwayOption[]).flatMap((option) => option.leadsToCareerSlugs),
      ),
    ),
  ];

  const careers = allSlugs.length
    ? await db
        .select({
          slug: careerProfiles.slug,
          name: occupations.name,
          salaryEntryMin: careerProfiles.salaryEntryMin,
          salaryEntryMax: careerProfiles.salaryEntryMax,
          currencyCode: careerProfiles.currencyCode,
        })
        .from(careerProfiles)
        .innerJoin(occupations, eq(careerProfiles.occupationId, occupations.id))
        .where(inArray(careerProfiles.slug, allSlugs))
    : [];

  const careerBySlug = new Map(careers.map((career) => [career.slug, career]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          After Class 10 and Class 12
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          The two decisions Indian students are told will determine their whole life. They matter —
          but far less finally than anyone tells you, and here&rsquo;s what each one actually opens.
        </p>
      </header>

      <Callout tone="info" title="Read this before the lists">
        <p>
          Choosing a stream narrows your immediate options. It does not close your life off. People
          move from commerce into technology, from arts into law and civil services, from ITI into
          engineering degrees, and from science into design — every year, in large numbers. Where a
          route back exists, we&rsquo;ve said so.
        </p>
      </Callout>

      {pathways.map((pathway) => (
        <section key={pathway.id} className="mt-10" aria-labelledby={`pathway-${pathway.id}`}>
          <SectionHeading title={pathway.title} id={`pathway-${pathway.id}`} description={pathway.description ?? undefined} />

          <div className="space-y-4">
            {(pathway.options as PathwayOption[]).map((option, index) => (
              <Card key={option.slug}>
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    aria-hidden
                    className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-sm font-bold text-white"
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold">{option.label}</h3>
                    <p className="mt-1 text-sm text-muted">{option.summary}</p>
                    {option.note ? (
                      <p className="mt-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2 text-sm">
                        {option.note}
                      </p>
                    ) : null}

                    {option.leadsToCareerSlugs.length ? (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                          Where it can lead
                        </p>
                        <ul className="flex flex-wrap gap-2">
                          {option.leadsToCareerSlugs.map((slug) => {
                            const career = careerBySlug.get(slug);
                            if (!career) return null;
                            return (
                              <li key={slug}>
                                <Link
                                  href={`/careers/${slug}`}
                                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors hover:border-brand-400"
                                >
                                  <span className="font-medium">{career.name}</span>
                                  <span className="text-xs tabular-nums text-faint">
                                    {formatMoneyRange(
                                      career.salaryEntryMin,
                                      career.salaryEntryMax,
                                      career.currencyCode,
                                    )}
                                  </span>
                                </Link>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}

      <section className="mt-12" aria-labelledby="myths">
        <SectionHeading title="Four things people will tell you that aren't true" id="myths" />
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            {
              myth: "Science keeps every door open, so take it regardless",
              truth:
                "Science with maths does keep the widest set of doors open. But taking it when you dislike it, and then struggling, closes more doors than commerce or arts ever would have. Aptitude beats optionality.",
            },
            {
              myth: "Arts is for students who couldn't get science",
              truth:
                "Arts is the standard route into civil services, law, journalism, psychology and design — several of which pay and rank above the average engineering outcome. The stigma is a local prejudice, not a fact about the field.",
            },
            {
              myth: "ITI and diploma are dead ends",
              truth:
                "An ITI graduate can be earning within two years of Class 10 at almost no cost, and skilled trades are in genuine shortage in India and abroad. A polytechnic diploma also leads into a BTech through lateral entry.",
            },
            {
              myth: "Once you pick a stream you're stuck",
              truth:
                "You aren't. Law, management, civil services, design and most of the technology industry accept graduates from any stream. Changing costs you time, not your future.",
            },
          ].map((item) => (
            <Card key={item.myth}>
              <div className="mb-1.5 flex items-start gap-2">
                <Badge tone="bad">Myth</Badge>
              </div>
              <p className="text-sm font-medium">&ldquo;{item.myth}&rdquo;</p>
              <p className="mt-2 text-sm text-muted">{item.truth}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <Card className="text-center">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Still not sure which way to go?
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted">
            The assessment asks about your interests, budget and how you like to work, then ranks
            careers against your answers — and explains every ranking.
          </p>
          <div className="mt-4">
            <Link
              href="/assessment"
              className="inline-flex items-center rounded-md bg-brand-600 px-5 py-3 font-medium text-white hover:bg-brand-700"
            >
              Take the assessment
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}
