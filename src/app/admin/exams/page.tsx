import type { Metadata } from "next";
import { listExamsForAdmin, listSources } from "@/modules/admin/service";
import { Callout, SectionHeading } from "@/components/ui";
import { PublishTable } from "@/components/publish-table";

export const metadata: Metadata = { title: "Exams · Admin" };

export default async function AdminExamsPage() {
  const [exams, sources] = await Promise.all([listExamsForAdmin(), listSources()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Exams
        </h1>
        <p className="mt-1 text-muted">{exams.length} records.</p>
      </header>

      <Callout tone="warn" title="Cycle data is the risky part">
        <p>
          Exam <em>structure</em> is stable and safe to publish once verified. Exam <em>editions</em>{" "}
          — dates, vacancies, fees — change every cycle and go stale silently. Seeded editions are
          deliberately left in draft with no dates: fill them from the official notification, and set
          a verification window that expires before the next cycle opens.
        </p>
      </Callout>

      <SectionHeading title="All exams" />
      <PublishTable
        entityType="exam"
        rows={exams.map((exam) => ({
          id: exam.id,
          title: exam.shortName,
          subtitle: `${exam.name} · ${exam.category}`,
          status: exam.status,
          sourceName: exam.sourceName,
          lastVerifiedAt: exam.lastVerifiedAt?.toISOString() ?? null,
          href: `/exams/${exam.slug}`,
        }))}
        sources={sources.map((source) => ({ id: source.id, name: source.name }))}
      />
    </div>
  );
}
