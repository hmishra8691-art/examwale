import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { businessCategories, businessModelTemplates, sources } from "@/db/schema";
import { getSession } from "@/modules/auth/session";
import {
  Badge,
  Callout,
  Card,
  SectionHeading,
  SourceNote,
  SummaryPanel,
} from "@/components/ui";
import { formatMoney, formatMoneyRange } from "@/modules/shared/format";
import { SaveButton } from "@/components/save-button";
import { BreakEvenCalculator } from "@/components/break-even-calculator";

export const revalidate = 300;

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  const [row] = await db
    .select({
      model: businessModelTemplates,
      category: businessCategories,
      source: sources,
    })
    .from(businessModelTemplates)
    .innerJoin(businessCategories, eq(businessModelTemplates.categoryId, businessCategories.id))
    .leftJoin(sources, eq(businessModelTemplates.sourceId, sources.id))
    .where(eq(businessModelTemplates.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const row = await load(slug);
  if (!row) return { title: "Business idea not found" };
  return { title: row.model.name, description: row.model.summary.slice(0, 155) };
}

export default async function BusinessDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const row = await load(slug);
  if (!row) notFound();

  const { model, category, source } = row;
  const session = await getSession();

  const fixedCosts = model.fixedCosts as { label: string; approxMonthly: number }[];
  const variableCosts = model.variableCosts as { label: string; note: string }[];
  const equipment = model.equipment as string[];
  const licenses = model.licenses as { name: string; authority: string; note?: string }[];
  const skills = model.skills as string[];
  const marketing = model.marketingPlan as string[];
  const breakEven = model.breakEven as { assumptions: string[]; formula: string; note: string };
  const risks = model.risks as string[];
  const growth = model.growth as string[];
  const aiOpportunities = model.aiOpportunities as string[];
  const launchPlan = model.launchPlan as { window: string; tasks: string[] }[];

  const monthlyFixed = fixedCosts.reduce((sum, cost) => sum + cost.approxMonthly, 0);

  return (
    <article className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-muted">
        <Link href="/business" className="hover:text-[var(--text)]">
          Business ideas
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <Link href={`/business?category=${category.slug}`} className="hover:text-[var(--text)]">
          {category.name}
        </Link>
      </nav>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
              {model.name}
            </h1>
            <p className="mt-2 max-w-3xl text-lg text-muted">{model.summary}</p>
          </div>
          <SaveButton itemType="business" itemId={model.id} label={model.name} signedIn={Boolean(session)} />
        </div>
      </header>

      <SummaryPanel
        eyebrow="The short version"
        title="What it takes to start this"
        points={[
          {
            label: "Startup cost",
            value: formatMoneyRange(model.startupCostMin, model.startupCostMax, model.currencyCode),
          },
          { label: "Monthly fixed cost", value: `~${formatMoney(monthlyFixed, model.currencyCode)}` },
          { label: "Licences needed", value: `${licenses.length}` },
          { label: "Category", value: category.name },
        ]}
        footer={<p className="text-sm">{model.targetCustomer}</p>}
      />

      <Callout tone="warn" title="No profit projection here — deliberately">
        <p>
          We will not tell you what this business will earn, because nobody honestly can. What we
          give you instead is the cost side, which is knowable, and the break-even arithmetic, which
          tells you what volume you need. Whether you reach that volume depends on your location,
          execution and a good deal of luck.
        </p>
      </Callout>

      <section className="mt-8" aria-labelledby="costs">
        <SectionHeading title="What it costs" id="costs" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Monthly fixed costs
            </h3>
            <ul className="space-y-2">
              {fixedCosts.map((cost) => (
                <li key={cost.label} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>{cost.label}</span>
                  <span className="font-medium tabular-nums">
                    {formatMoney(cost.approxMonthly, model.currencyCode)}
                  </span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-3 border-t pt-2 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{formatMoney(monthlyFixed, model.currencyCode)}</span>
              </li>
            </ul>
            <p className="mt-2 text-xs text-faint">
              Estimates. Rent in particular varies by a factor of five between a metro and a small
              town — substitute your own numbers.
            </p>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
              Variable costs
            </h3>
            <ul className="space-y-3">
              {variableCosts.map((cost) => (
                <li key={cost.label}>
                  <p className="text-sm font-medium">{cost.label}</p>
                  <p className="text-sm text-muted">{cost.note}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="breakeven">
        <SectionHeading title="Break-even" id="breakeven" />
        <Card>
          <p className="font-mono text-sm">{breakEven.formula}</p>
          <p className="mt-3 text-sm text-muted">{breakEven.note}</p>
          <h3 className="mb-1.5 mt-4 text-sm font-semibold">Assumptions built into this</h3>
          <ul className="space-y-1 text-sm text-muted">
            {breakEven.assumptions.map((assumption) => (
              <li key={assumption} className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" />
                {assumption}
              </li>
            ))}
          </ul>
        </Card>
        <div className="mt-4">
          <BreakEvenCalculator defaultFixedCost={monthlyFixed} currencyCode={model.currencyCode} />
        </div>
      </section>

      <section className="mt-8" aria-labelledby="setup">
        <SectionHeading title="What you need to set up" id="setup" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Equipment</h3>
            <ul className="space-y-1 text-sm">
              {equipment.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink-400" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Skills</h3>
            <ul className="flex flex-wrap gap-1.5">
              {skills.map((skill) => (
                <li key={skill}>
                  <Badge tone="brand">{skill}</Badge>
                </li>
              ))}
            </ul>
            {model.suppliersNote ? (
              <>
                <h3 className="mb-1 mt-4 text-sm font-semibold uppercase tracking-wide text-muted">
                  Suppliers
                </h3>
                <p className="text-sm text-muted">{model.suppliersNote}</p>
              </>
            ) : null}
          </Card>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="licences">
        <SectionHeading
          title="Licences and registrations"
          id="licences"
          description="Requirements and thresholds differ by state and change over time. Confirm each with the named authority before you rely on it."
        />
        <Card className="p-0">
          <ul className="divide-y">
            {licenses.map((licence) => (
              <li key={licence.name} className="p-4">
                <h3 className="text-sm font-semibold">{licence.name}</h3>
                <p className="text-sm text-muted">Issued by: {licence.authority}</p>
                {licence.note ? <p className="mt-1 text-sm text-muted">{licence.note}</p> : null}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-8" aria-labelledby="revenue">
        <SectionHeading title="How you make money" id="revenue" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Pricing</h3>
            <p className="text-sm">{model.pricingModel}</p>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Revenue model</h3>
            <p className="text-sm">{model.revenueModel}</p>
          </Card>
        </div>
      </section>

      <section className="mt-8" aria-labelledby="marketing">
        <SectionHeading title="Getting your first customers" id="marketing" />
        <Card>
          <ul className="space-y-1.5 text-sm">
            {marketing.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-saffron-500" />
                {item}
              </li>
            ))}
          </ul>
          <h3 className="mb-1 mt-4 text-sm font-semibold">Competition</h3>
          <p className="text-sm text-muted">{model.competition}</p>
        </Card>
      </section>

      <section className="mt-8" aria-labelledby="risks">
        <SectionHeading title="What could go wrong" id="risks" />
        <Card>
          <ul className="space-y-1.5 text-sm">
            {risks.map((risk) => (
              <li key={risk} className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-red-500" />
                {risk}
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-8" aria-labelledby="launch">
        <SectionHeading title="30 / 60 / 90-day launch plan" id="launch" />
        <div className="grid gap-4 md:grid-cols-3">
          {launchPlan.map((phase, index) => (
            <Card key={phase.window}>
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="text-sm font-semibold">{phase.window}</h3>
              </div>
              <ul className="space-y-1.5 text-sm">
                {phase.tasks.map((task) => (
                  <li key={task} className="flex gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-400" />
                    {task}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="growth">
        <SectionHeading title="If it works" id="growth" />
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Ways to grow
            </h3>
            <ul className="space-y-1.5 text-sm">
              {growth.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-verified-600" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
              Where automation helps
            </h3>
            <ul className="space-y-1.5 text-sm">
              {aiOpportunities.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-judgement-600" />
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <footer className="mt-10 border-t pt-4">
        <SourceNote sourceName={source?.name} sourceUrl={source?.url} lastVerifiedAt={model.lastVerifiedAt} />
        <p className="mt-2 text-xs text-faint">
          Nothing here guarantees profit. Costs, licence requirements and market conditions vary by
          location and change over time. Take professional advice on registration and tax before
          you start trading.
        </p>
      </footer>
    </article>
  );
}
