import type { Metadata } from "next";
import { listOrganisationsForReview } from "@/modules/admin/service";
import { Badge, Callout, Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/modules/shared/format";

export const metadata: Metadata = { title: "Verification · Admin" };

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  VERIFIED: "good",
  PENDING: "warn",
  REJECTED: "bad",
  UNVERIFIED: "neutral",
};

export default async function AdminOrganisationsPage() {
  const organisations = await listOrganisationsForReview();
  const pending = organisations.filter((org) => org.verificationStatus === "PENDING");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
          Organisation verification
        </h1>
        <p className="mt-1 text-muted">
          {pending.length} awaiting review, {organisations.length} total.
        </p>
      </header>

      <Callout tone="info" title="How this gate works">
        <p>
          An organisation can create an account and sign in immediately, but stays{" "}
          <strong>unverified</strong> until a human reviews its registration documents. Unverified
          organisations cannot publish live opportunities. Employer self-serve posting is a Phase 2
          feature; this queue exists now so the gate is in place before it opens.
        </p>
      </Callout>

      {organisations.length === 0 ? (
        <EmptyState
          title="No organisations registered yet"
          description="Employer and institute registration opens in Phase 2. The review queue is here and wired up ahead of it."
        />
      ) : (
        <ul className="space-y-3">
          {organisations.map((organisation) => (
            <Card as="li" key={organisation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{organisation.name}</h2>
                  <p className="text-sm text-muted">
                    {organisation.type} · {organisation.contactEmail}
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    Registered {formatDate(organisation.createdAt)}
                  </p>
                </div>
                <Badge tone={STATUS_TONE[organisation.verificationStatus] ?? "neutral"}>
                  {organisation.verificationStatus.toLowerCase()}
                </Badge>
              </div>
              {organisation.reviewNote ? (
                <p className="mt-2 border-t pt-2 text-sm text-muted">
                  Review note: {organisation.reviewNote}
                </p>
              ) : null}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
