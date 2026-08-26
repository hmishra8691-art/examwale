import type { Metadata } from "next";
import { requireAdminPage } from "@/modules/auth/session";
import { CAPABILITIES, pendingCapabilities, type CapabilityKind } from "@/modules/providers/service";
import { formatDate } from "@/modules/shared/format";
import { CapabilityReview } from "@/components/admin-capability-review";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Provider applications" };
export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  await requireAdminPage("/admin/providers");
  const pending = await pendingCapabilities();

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Provider applications"
        description="Each capability is judged on its own terms. Approving mentoring says nothing about hiring, and vice versa."
      />

      {pending.length === 0 ? (
        <EmptyState
          title="Nothing waiting"
          description="Applications appear here as they arrive."
        />
      ) : (
        <div className="space-y-4">
          {pending.map(({ capability, profile, email }) => {
            const meta = CAPABILITIES[capability.kind as CapabilityKind];
            return (
              <Card key={capability.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{profile.displayName}</h3>
                      <Badge tone="brand">{meta.label}</Badge>
                      <Badge tone="neutral">{profile.visibility}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{profile.headline}</p>
                    <p className="mt-1 text-xs text-faint">
                      {email}
                      {profile.currentRole ? ` · ${profile.currentRole}` : ""}
                      {profile.currentOrganisation ? ` at ${profile.currentOrganisation}` : ""}
                      {profile.city ? ` · ${profile.city}` : ""}
                      {profile.timezone ? ` · ${profile.timezone}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs text-faint">
                    applied {formatDate(capability.createdAt)}
                  </p>
                </div>

                <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">
                  {profile.bio}
                </p>

                {Array.isArray(profile.certifications) && profile.certifications.length ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                      Self-declared certifications — not verified
                    </p>
                    <ul className="mt-1 space-y-0.5 text-[13.5px] text-muted">
                      {(profile.certifications as { title: string; issuer?: string; year?: number }[]).map(
                        (entry, index) => (
                          <li key={index}>
                            {entry.title}
                            {entry.issuer ? ` — ${entry.issuer}` : ""}
                            {entry.year ? ` (${entry.year})` : ""}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}

                {Array.isArray(profile.links) && profile.links.length ? (
                  <ul className="mt-3 flex flex-wrap gap-3 text-[13.5px]">
                    {(profile.links as { label: string; url: string }[]).map((link, index) => (
                      <li key={index}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer nofollow noopener"
                          className="text-brand-600 hover:underline dark:text-brand-300"
                        >
                          {link.label} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <p className="mt-3 rounded-lg bg-[var(--surface-raised)] p-2.5 text-xs leading-relaxed text-muted">
                  <strong>What this capability requires:</strong> {meta.gate}
                </p>

                <CapabilityReview capabilityId={capability.id} />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
