import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getProviderContext } from "@/modules/providers/service";
import { ServiceForm } from "@/components/service-forms";
import { Callout } from "@/components/ui";

export const metadata: Metadata = { title: "New service" };

export default async function NewServicePage() {
  const session = await requirePage("/provider/services/new");
  const { profile, active } = await getProviderContext(session.sub);
  if (!profile) redirect("/provider/profile");
  if (!active.includes("SERVICE_PROVIDER")) redirect("/provider/services");

  return (
    <div className="max-w-3xl">
      <Link href="/provider/services" className="text-sm text-muted hover:underline">
        ← Your services
      </Link>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
        Write a service
      </h1>
      <p className="mt-3 max-w-prose text-muted">
        It saves as a draft. Nothing is public until you submit it and a person has read it.
      </p>

      <div className="mt-6">
        <Callout tone="info" title="What gets refused">
          <p>
            Anything guaranteeing a job, a score or a selection — nobody can promise that, and a
            listing which does is the single clearest sign of a scam. Also refused: pushing contact
            to a personal number, and asking for payment before any conversation has happened.
          </p>
        </Callout>
      </div>

      <div className="mt-8">
        <ServiceForm
          initial={{
            kind: "RESUME_REVIEW",
            title: "",
            summary: "",
            description: "",
            deliverables: [],
            delivery: "LIVE_SESSION",
            price: 0,
            priceOnRequest: false,
            durationMinutes: null,
            turnaroundDays: null,
          }}
        />
      </div>
    </div>
  );
}
