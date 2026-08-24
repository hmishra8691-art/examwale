import { getCountry, getCurrentCoverage } from "@/modules/geo/service";
import { COVERAGE_LABELS, SECTION_LABELS, type CoverageSection } from "@/modules/geo/config";
import { Callout } from "@/components/ui";

/**
 * Says what this country's coverage of a section actually is.
 *
 * The point is the difference between an empty list and a stated absence. A
 * reader who opens "Government exams" in the UAE and sees nothing has no way
 * to tell whether the page is broken, whether we have not got round to it, or
 * whether the concept simply does not exist there — and those call for three
 * completely different reactions from them.
 *
 * Renders nothing when a section is fully covered, so the common case carries
 * no furniture.
 */
export async function CoverageNotice({
  section,
  className,
}: {
  section: CoverageSection;
  className?: string;
}) {
  const [country, coverage] = await Promise.all([getCountry(), getCurrentCoverage()]);
  const entry = coverage[section];

  if (!entry || entry.state === "COVERED") return null;

  const tone = entry.state === "NOT_APPLICABLE" ? "info" : "warn";

  const title =
    entry.state === "NOT_APPLICABLE"
      ? `${SECTION_LABELS[section]} don't apply in ${country.name}`
      : entry.state === "PLANNED"
        ? `${SECTION_LABELS[section]} aren't covered in ${country.name} yet`
        : `${SECTION_LABELS[section]} are only partly covered in ${country.name}`;

  return (
    <div className={className}>
      <Callout tone={tone} title={title}>
        {entry.note ? (
          <p>{entry.note}</p>
        ) : entry.state === "PARTIAL" ? (
          <p>
            What&rsquo;s here is real and sourced, but it isn&rsquo;t the whole picture yet. Treat
            an absence as &ldquo;not recorded&rdquo;, not as &ldquo;doesn&rsquo;t exist&rdquo;.
          </p>
        ) : (
          <p>
            We&rsquo;d rather show you nothing than invent it. If you switch country using the
            selector in the header, you&rsquo;ll see what we do have.
          </p>
        )}
      </Callout>
    </div>
  );
}

/** Compact inline variant for dashboards and cards. */
export async function CoverageBadge({ section }: { section: CoverageSection }) {
  const coverage = await getCurrentCoverage();
  const entry = coverage[section];
  if (!entry || entry.state === "COVERED") return null;

  return (
    <span className="rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[11px] font-medium text-muted">
      {COVERAGE_LABELS[entry.state]}
    </span>
  );
}
