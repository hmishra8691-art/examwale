import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { businessCategories, businessModelTemplates, countries } from "@/db/schema";
import { Badge, ButtonLink, Callout, Card, EmptyState, Pill } from "@/components/ui";
import { formatMoneyRange } from "@/modules/shared/format";
import { int, one } from "@/modules/shared/params";
import { getCountry } from "@/modules/geo/service";
import { CoverageNotice } from "@/components/coverage-notice";
import { budgetBands } from "@/modules/shared/format";

export const metadata: Metadata = {
  title: "Business ideas",
  description:
    "Costed business models for India — startup cost, licences, break-even and a 30/60/90-day launch plan for each.",
};

export const revalidate = 300;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BusinessPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const budget = int(params.budget, { min: 0, max: 100_000_000 });
  const category = one(params.category);

  const country = await getCountry();
  const budgets = budgetBands(country.currencyCode);

  const conditions = [
    eq(businessModelTemplates.status, "PUBLISHED"),
    eq(countries.isoCode, country.isoCode),
    ...(budget ? [lte(businessModelTemplates.startupCostMin, budget)] : []),
    ...(category ? [eq(businessCategories.slug, category)] : []),
  ];

  const [models, categories] = await Promise.all([
    db
      .select({
        slug: businessModelTemplates.slug,
        name: businessModelTemplates.name,
        summary: businessModelTemplates.summary,
        targetCustomer: businessModelTemplates.targetCustomer,
        startupCostMin: businessModelTemplates.startupCostMin,
        startupCostMax: businessModelTemplates.startupCostMax,
        currencyCode: businessModelTemplates.currencyCode,
        categoryName: businessCategories.name,
        categorySlug: businessCategories.slug,
        skills: businessModelTemplates.skills,
      })
      .from(businessModelTemplates)
      .innerJoin(businessCategories, eq(businessModelTemplates.categoryId, businessCategories.id))
      .innerJoin(countries, eq(businessModelTemplates.countryId, countries.id))
      .where(and(...conditions))
      .orderBy(asc(businessModelTemplates.startupCostMin)),

    db.select().from(businessCategories).orderBy(asc(businessCategories.name)),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
          Start something of your own
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Costed business models with the licences you&rsquo;ll need, the break-even arithmetic, and
          a 30/60/90-day plan. What we won&rsquo;t give you is a profit projection.
        </p>
      </header>

      <CoverageNotice section="business" className="mt-6" />

      <Callout tone="warn" title="What these are and aren't">
        <p>
          These are planning templates, not business plans, and definitely not promises. Costs vary
          enormously by city and scale, licence requirements differ by state, and most new small
          businesses do not become profitable quickly. Work through the break-even arithmetic with
          your own numbers before committing money you cannot afford to lose.
        </p>
      </Callout>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/business">
          <Pill active={!category && !budget}>All ideas</Pill>
        </Link>
        {categories.map((item) => (
          <Link key={item.slug} href={`/business?category=${item.slug}`}>
            <Pill active={category === item.slug}>{item.name}</Pill>
          </Link>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted">I have:</span>
        {budgets.map((option) => (
          <Link
            key={option.value}
            href={`/business?budget=${option.value}${category ? `&category=${category}` : ""}`}
          >
            <Pill active={budget === option.value}>{option.label}</Pill>
          </Link>
        ))}
      </div>

      {models.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing in that range yet"
            description="We don't have a costed model that starts below that budget in this category. Try a wider budget or another category."
            action={
              <ButtonLink href="/business" variant="secondary">
                Show all
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {models.map((model) => (
            <Card as="li" key={model.slug} className="relative flex flex-col gap-3">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold leading-snug">
                    <Link href={`/business/${model.slug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {model.name}
                    </Link>
                  </h2>
                </div>
                <p className="mt-0.5 text-xs text-faint">{model.categoryName}</p>
              </div>

              <p className="line-clamp-3 text-sm text-muted">{model.summary}</p>

              <div className="mt-auto border-t pt-3">
                <p className="text-xs uppercase tracking-wide text-muted">Startup cost</p>
                <p className="font-semibold tabular-nums">
                  {formatMoneyRange(model.startupCostMin, model.startupCostMax, model.currencyCode)}
                </p>
              </div>

              <ul className="flex flex-wrap gap-1.5">
                {(model.skills as string[]).slice(0, 3).map((skill) => (
                  <li key={skill}>
                    <Badge tone="neutral">{skill}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
