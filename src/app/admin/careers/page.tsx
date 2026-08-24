import type { Metadata } from "next";
import Link from "next/link";
import { listCareersForAdmin, listSources } from "@/modules/admin/service";
import { Card, SectionHeading } from "@/components/ui";
import { PublishTable } from "@/components/publish-table";

export const metadata: Metadata = { title: "Careers · Admin" };

export default async function AdminCareersPage() {
  const [careers, sources] = await Promise.all([listCareersForAdmin(), listSources()]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Careers
        </h1>
        <p className="mt-1 text-muted">
          {careers.length} records. Publishing requires a source and a current verification — the
          gate refuses anything without both.
        </p>
      </header>

      <SectionHeading title="All career profiles" />
      <PublishTable
        entityType="career"
        rows={careers.map((career) => ({
          id: career.id,
          title: career.name,
          subtitle: career.slug,
          status: career.status,
          sourceName: career.sourceName,
          lastVerifiedAt: career.lastVerifiedAt?.toISOString() ?? null,
          href: `/careers/${career.slug}`,
        }))}
        sources={sources.map((source) => ({ id: source.id, name: source.name }))}
      />

      <Card>
        <h2 className="text-sm font-semibold">Why the gate exists</h2>
        <p className="mt-1 text-sm text-muted">
          Career records carry salary ranges, education costs and licensing claims that people make
          ten-year decisions on. A record that reaches a user without provenance is a record nobody
          can check. The publish endpoint enforces this in code — see{" "}
          <code className="text-xs">modules/admin/publish.ts</code>.
        </p>
      </Card>
    </div>
  );
}
