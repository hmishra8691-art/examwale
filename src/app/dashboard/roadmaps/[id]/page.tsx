import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getRoadmap } from "@/modules/roadmaps/service";
import { VERDICT_TONE } from "@/modules/roadmaps/reality-check";
import { Callout, Card, ProgressBar, SectionHeading } from "@/components/ui";
import { RoadmapSteps } from "@/components/roadmap-steps";

export const metadata: Metadata = { title: "Roadmap" };

type Params = Promise<{ id: string }>;

export default async function RoadmapDetailPage({ params }: { params: Params }) {
  const session = await requirePage("/dashboard/roadmaps");
  const { id } = await params;

  let data: Awaited<ReturnType<typeof getRoadmap>>;
  try {
    data = await getRoadmap(id, session.sub);
  } catch {
    notFound();
  }

  const { roadmap, steps, progress } = data;
  const check = roadmap.realityCheck;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href="/dashboard/roadmaps" className="hover:text-[var(--text)]">
          Roadmaps
        </Link>
      </nav>

      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          {roadmap.title}
        </h1>
        <p className="mt-1 text-muted">{roadmap.goalDescription}</p>
      </header>

      <Card>
        <ProgressBar
          percent={progress}
          label={`${steps.filter((step) => step.status === "DONE").length} of ${steps.length} steps complete`}
        />
      </Card>

      {check ? (
        <section aria-labelledby="reality">
          <SectionHeading title="Reality check" id="reality" />
          <Callout
            tone={VERDICT_TONE[check.verdict] === "good" ? "good" : VERDICT_TONE[check.verdict] === "bad" ? "danger" : "warn"}
            title={check.headline}
          >
            <ul className="space-y-1.5">
              {check.reasoning.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {check.alternative ? (
              <p className="mt-3 border-t pt-2 font-medium">{check.alternative}</p>
            ) : null}
          </Callout>
        </section>
      ) : null}

      <section aria-labelledby="steps">
        <SectionHeading
          title="Your steps"
          id="steps"
          description="Mark steps as you go. Target dates are spaced by how long each stage typically takes — adjust your expectations, not the arithmetic."
        />
        <RoadmapSteps
          steps={steps.map((step) => ({
            id: step.id,
            sequence: step.sequence,
            title: step.title,
            description: step.description,
            kind: step.kind,
            status: step.status,
            targetDate: step.targetDate?.toISOString() ?? null,
            refType: step.refType,
            refSlug: step.refSlug,
          }))}
        />
      </section>

      {roadmap.targetCareerSlug ? (
        <Card>
          <p className="text-sm">
            Full detail on this career — eligibility, cost, salary bands and the honest downsides —
            is on the{" "}
            <Link href={`/careers/${roadmap.targetCareerSlug}`} className="font-medium text-brand-600 underline">
              career guide
            </Link>
            .
          </p>
        </Card>
      ) : null}
    </div>
  );
}
