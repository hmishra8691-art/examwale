import type { Metadata } from "next";
import { requireAdminPage } from "@/modules/auth/session";
import { listCountriesForAdmin, MIN_CAREERS_TO_LAUNCH } from "@/modules/geo/service";
import { CountryActivation, CoverageEditor } from "@/components/admin-country-controls";
import { Badge, Callout, Card, SectionHeading, Stat } from "@/components/ui";
import type { CoverageSection } from "@/modules/geo/config";

export const metadata: Metadata = { title: "Countries" };

export default async function AdminCountriesPage() {
  await requireAdminPage("/admin/countries");
  const countries = await listCountriesForAdmin();

  const active = countries.filter((entry) => entry.country.isActive);
  const readyToLaunch = countries.filter(
    (entry) => !entry.country.isActive && entry.readiness.ready,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Countries"
        description="What the product covers, where, and whether a market is ready to open."
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Live" value={active.length} />
        <Stat label="Ready to launch" value={readyToLaunch.length} />
        <Stat label="Seeded" value={countries.length} />
      </div>

      <div className="mt-6">
        <Callout tone="info" title="What launching commits you to">
          <p>
            A country goes live only once it has at least {MIN_CAREERS_TO_LAUNCH} published careers
            and every section has a declared coverage state. That second condition is the one that
            does the work: an empty section with no explanation reads to a visitor as a broken
            page, and an empty section that is actually <em>not applicable here</em> — government
            exams in the UAE, say — should say so rather than looking like an oversight.
          </p>
          <p className="mt-2">
            Marking a section &ldquo;covered&rdquo; while it has no rows is refused outright.
          </p>
        </Callout>
      </div>

      <ul className="mt-8 grid gap-6">
        {countries.map((entry) => (
          <Card as="li" key={entry.country.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex flex-wrap items-center gap-2 font-medium">
                  {entry.country.name}
                  <span className="font-mono text-xs text-faint">{entry.country.isoCode}</span>
                  <Badge tone={entry.country.isActive ? "good" : "neutral"}>
                    {entry.country.isActive ? "Live" : "Not launched"}
                  </Badge>
                </h2>
                <p className="mt-1 text-xs text-faint">
                  {entry.country.currencyCode} · default locale {entry.country.defaultLocale}
                </p>
              </div>
              <CountryActivation
                countryId={entry.country.id}
                isActive={entry.country.isActive}
                ready={entry.readiness.ready}
              />
            </div>

            {entry.readiness.blockers.length ? (
              <div className="mt-4">
                <Callout tone="warn" title="Blocking launch">
                  <ul className="list-disc space-y-1 pl-4">
                    {entry.readiness.blockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                </Callout>
              </div>
            ) : null}

            {entry.readiness.warnings.length ? (
              <div className="mt-3">
                <Callout tone="info" title="Worth checking">
                  <ul className="list-disc space-y-1 pl-4">
                    {entry.readiness.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Callout>
              </div>
            ) : null}

            <div className="mt-5">
              <CoverageEditor
                countryId={entry.country.id}
                rows={entry.readiness.coverage.map((row) => ({
                  section: row.section as CoverageSection,
                  state: row.state,
                  note: row.note,
                  rows: row.rows,
                }))}
              />
            </div>
          </Card>
        ))}
      </ul>
    </div>
  );
}
