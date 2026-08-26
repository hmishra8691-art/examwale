import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { providerProfiles, services } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import {
  SERVICE_STATUS_META,
  serviceModerationTrail,
  type ServiceStatus,
} from "@/modules/services/service";
import { formatDate } from "@/modules/shared/format";
import { ServiceActions, ServiceForm } from "@/components/service-forms";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Manage service" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ManageServicePage({ params }: Props) {
  const { id } = await params;
  const session = await requirePage(`/provider/services/${id}`);

  const [row] = await db
    .select({ service: services, providerUserId: providerProfiles.userId })
    .from(services)
    .innerJoin(providerProfiles, eq(providerProfiles.id, services.providerProfileId))
    .where(eq(services.id, id))
    .limit(1);

  if (!row || row.providerUserId !== session.sub) notFound();

  const service = row.service;
  const meta = SERVICE_STATUS_META[service.status as ServiceStatus];
  const trail = await serviceModerationTrail(id);
  // The most recent thing a moderator actually said, which is what the provider
  // needs when their listing came back refused.
  const lastNote = trail.find((entry) => entry.reason);

  return (
    <div className="max-w-3xl">
      <Link href="/provider/services" className="text-sm text-muted hover:underline">
        ← Your services
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {service.title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            {service.status === "ACTIVE" ? (
              <Link
                href={`/services/${service.slug}`}
                className="text-sm text-brand-600 hover:underline dark:text-brand-300"
              >
                View public page →
              </Link>
            ) : null}
          </div>
          <p className="mt-2 max-w-prose text-[13.5px] leading-relaxed text-muted">{meta.blurb}</p>
        </div>
      </div>

      {lastNote && (service.status === "REJECTED" || service.status === "DRAFT" || service.status === "SUSPENDED") ? (
        <div className="mt-5">
          <Callout
            tone={service.status === "SUSPENDED" ? "danger" : "warn"}
            title={`A moderator said (${formatDate(lastNote.createdAt)})`}
          >
            <p>{lastNote.reason}</p>
          </Callout>
        </div>
      ) : null}

      <Card className="mt-6">
        <ServiceActions
          serviceId={service.id}
          status={service.status}
          acceptingRequests={service.acceptingRequests}
        />
      </Card>

      <div className="mt-8">
        <SectionHeading
          title="The listing"
          description="Editing a listed service returns it to draft — what a moderator approved is not what would then be public."
        />
        <div className="mt-5">
          <ServiceForm
            initial={{
              id: service.id,
              kind: service.kind,
              title: service.title,
              summary: service.summary,
              description: service.description,
              deliverables: (service.deliverables as string[] | null) ?? [],
              delivery: service.delivery,
              price: service.price,
              priceOnRequest: service.priceOnRequest,
              durationMinutes: service.durationMinutes,
              turnaroundDays: service.turnaroundDays,
            }}
          />
        </div>
      </div>
    </div>
  );
}
