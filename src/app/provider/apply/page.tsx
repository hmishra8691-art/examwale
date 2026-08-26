import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import {
  CAPABILITIES,
  getProviderContext,
  isCapabilityKind,
  type CapabilityKind,
} from "@/modules/providers/service";
import { CapabilityApplyButton } from "@/components/provider-apply";
import { Callout, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Apply to offer something" };

type Props = { searchParams: Promise<{ kind?: string }> };

export default async function ProviderApplyPage({ searchParams }: Props) {
  const session = await requirePage("/provider/apply");
  const { kind } = await searchParams;

  // A profile is the prerequisite: a capability with no professional identity
  // behind it is not reviewable, so send them to build one first rather than
  // letting them apply into a void.
  const { profile, capabilities } = await getProviderContext(session.sub);
  if (!profile) redirect("/provider/profile");

  if (!kind || !isCapabilityKind(kind)) redirect("/provider");

  // Mentoring and hiring collect things this page does not know about.
  if (kind === "MENTOR" || kind === "EMPLOYER") redirect(CAPABILITIES[kind].applyHref);

  const meta = CAPABILITIES[kind as CapabilityKind];
  const existing = capabilities.find((c) => c.kind === kind);

  return (
    <div className="max-w-2xl">
      <Link href="/provider" className="text-sm text-muted hover:underline">
        ← Provider dashboard
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        {meta.label}
      </h1>
      <p className="mt-3 text-muted">{meta.blurb}</p>

      <div className="mt-6">
        <Callout tone="info" title="What happens next">
          <p>{meta.gate}</p>
        </Callout>
      </div>

      <Card className="mt-6">
        <h2 className="font-medium">Applying as</h2>
        <p className="mt-1 text-sm">{profile.displayName}</p>
        <p className="text-[13.5px] text-muted">{profile.headline}</p>
        <p className="mt-3 text-xs text-faint">
          This is the profile a reviewer reads.{" "}
          <Link href="/provider/profile" className="underline">
            Edit it
          </Link>{" "}
          before applying if anything is out of date.
        </p>
      </Card>

      <div className="mt-6">
        {existing && existing.status !== "REJECTED" ? (
          <Callout tone="good" title="Already applied">
            <p>
              This is currently{" "}
              {existing.status === "ACTIVE"
                ? "approved"
                : existing.status === "PENDING"
                  ? "waiting for review"
                  : "suspended"}
              . Nothing more to do here.
            </p>
          </Callout>
        ) : (
          <CapabilityApplyButton kind={kind} reapplying={existing?.status === "REJECTED"} />
        )}
      </div>
    </div>
  );
}
