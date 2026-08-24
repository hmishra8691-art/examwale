import { ConfidenceBadge, Callout } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

/**
 * Renders provider outcome claims.
 *
 * This component exists so that there is exactly one way for a "98% selection
 * rate" to reach a page, and that way prints who claimed it. The value and its
 * label are rendered by the same element — you cannot use this component to
 * show the number on its own, which is the point.
 *
 * An unverified claim is deliberately given quieter typography than a verified
 * fact elsewhere on the page. Visual weight is an implicit truth claim, and
 * matching a coaching centre's marketing to the weight of an official exam
 * date would be the interface lying on the provider's behalf.
 */

export type OutcomeClaim = {
  claim: {
    id: string;
    metric: string;
    claimedValue: string;
    claimedPeriod: string | null;
    confidence: "VERIFIED" | "ESTIMATED" | "AI_JUDGEMENT" | "UNVERIFIED";
    verifiedAt: Date | null;
    note: string | null;
  };
  sourceName: string | null;
  sourceUrl: string | null;
};

const METRIC_LABELS: Record<string, string> = {
  selection_rate: "Selection rate",
  placement_rate: "Placement rate",
  average_package: "Average package",
  highest_package: "Highest package",
  selections_count: "Selections",
  batch_size: "Batch size",
  faculty_experience: "Faculty experience",
};

export function OutcomeClaims({ claims }: { claims: OutcomeClaim[] }) {
  if (!claims.length) {
    return (
      <p className="text-sm text-muted">
        This provider hasn&rsquo;t published outcome figures here. That is not a mark against them
        — most don&rsquo;t, and the ones that do are rarely independently checked.
      </p>
    );
  }

  const anyUnverified = claims.some(
    (entry) => entry.claim.confidence === "UNVERIFIED" || entry.claim.confidence === "ESTIMATED",
  );

  return (
    <div className="space-y-4">
      <ul className="grid gap-3 sm:grid-cols-2">
        {claims.map(({ claim, sourceName, sourceUrl }) => {
          const verified = claim.confidence === "VERIFIED";
          return (
            <li
              key={claim.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs uppercase tracking-wide text-muted">
                  {METRIC_LABELS[claim.metric] ?? claim.metric.replace(/_/g, " ")}
                </p>
                <ConfidenceBadge level={claim.confidence} size="xs" />
              </div>

              <p
                className={
                  verified
                    ? "mt-1.5 text-xl font-semibold tabular-nums"
                    : "mt-1.5 text-lg font-medium tabular-nums text-[var(--text-muted)]"
                }
              >
                {claim.claimedValue}
              </p>

              {claim.claimedPeriod ? (
                <p className="mt-0.5 text-xs text-faint">{claim.claimedPeriod}</p>
              ) : null}

              <p className="mt-2 text-xs leading-relaxed text-faint">
                {verified ? (
                  <>
                    Checked against{" "}
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {sourceName ?? "a source"}
                      </a>
                    ) : (
                      (sourceName ?? "a source")
                    )}
                    {claim.verifiedAt ? ` on ${formatDate(claim.verifiedAt)}` : null}.
                  </>
                ) : (
                  <>Claimed by the provider. We have not checked this against any other source.</>
                )}
              </p>

              {claim.note ? <p className="mt-1 text-xs text-faint">{claim.note}</p> : null}
            </li>
          );
        })}
      </ul>

      {anyUnverified ? (
        <Callout tone="warn" title="About these figures">
          Coaching results are almost never independently audited in India. A selection rate
          depends entirely on who is counted as a student — a centre that counts only its full-year
          batch will report a very different number from one that counts everyone who bought a test
          series. Ask what the denominator is before you read anything into a percentage.
        </Callout>
      ) : null}
    </div>
  );
}

/**
 * Fee display for a batch.
 *
 * Never renders a bare number. An absent fee says so, because rendering "₹0"
 * or omitting the row entirely both read as "free" to a scanning eye.
 */
export function BatchFee({
  feeAmount,
  currencyCode,
  feeNote,
  isFreeCourse,
}: {
  feeAmount: number | null;
  currencyCode: string;
  feeNote: string | null;
  isFreeCourse: boolean;
}) {
  if (isFreeCourse) {
    return <span className="font-medium text-verified-700 dark:text-verified-100">Free</span>;
  }

  if (feeAmount == null) {
    return (
      <span className="text-muted">
        Fee not published
        {feeNote ? <span className="block text-xs text-faint">{feeNote}</span> : null}
      </span>
    );
  }

  const formatted = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode || "INR",
    maximumFractionDigits: 0,
  }).format(feeAmount);

  return (
    <span>
      <span className="font-medium tabular-nums">{formatted}</span>
      {feeNote ? <span className="block text-xs text-faint">{feeNote}</span> : null}
    </span>
  );
}
