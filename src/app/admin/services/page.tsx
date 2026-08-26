import type { Metadata } from "next";
import Link from "next/link";
import { requireAdminPage } from "@/modules/auth/session";
import {
  SERVICE_FLAG_LABELS,
  SERVICE_KINDS,
  pendingServices,
  type ServiceKind,
} from "@/modules/services/service";
import { formatDate, formatMoney } from "@/modules/shared/format";
import { ServiceReview } from "@/components/admin-service-review";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Service listings" };
export const dynamic = "force-dynamic";

export default async function AdminServicesPage() {
  await requireAdminPage("/admin/services");
  const pending = await pendingServices();

  return (
    <div className="space-y-6">
      <SectionHeading
        title="Service listings"
        description="Flags are raised automatically for a person to judge. None of them is a rejection."
      />

      {pending.length === 0 ? (
        <EmptyState title="Nothing waiting" description="Submitted listings appear here." />
      ) : (
        <div className="space-y-4">
          {pending.map(({ service, provider, email, flags }) => (
            <Card key={service.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">{service.title}</h3>
                    <Badge tone="neutral">{SERVICE_KINDS[service.kind as ServiceKind].label}</Badge>
                    <Badge tone={service.status === "UNDER_REVIEW" ? "brand" : "warn"}>
                      {service.status.toLowerCase().replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted">{service.summary}</p>
                  <p className="mt-1 text-xs text-faint">
                    {provider.displayName} · {email}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-medium">
                    {service.priceOnRequest
                      ? "On request"
                      : service.price === 0
                        ? "Free"
                        : formatMoney(service.price ?? 0, service.currencyCode)}
                  </p>
                  <p className="text-xs text-faint">{formatDate(service.updatedAt)}</p>
                </div>
              </div>

              {flags?.length ? (
                <div className="mt-3">
                  <Callout tone="warn" title="Automated flags">
                    <ul className="list-inside list-disc">
                      {flags.map((flag) => (
                        <li key={flag}>{SERVICE_FLAG_LABELS[flag] ?? flag}</li>
                      ))}
                    </ul>
                  </Callout>
                </div>
              ) : null}

              <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed text-muted">
                {service.description}
              </p>

              {(service.deliverables as string[] | null)?.length ? (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-faint">
                    Claimed deliverables
                  </p>
                  <ul className="mt-1 list-inside list-disc text-[13.5px] text-muted">
                    {(service.deliverables as string[]).map((entry, index) => (
                      <li key={index}>{entry}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <Link
                href={`/services/${service.slug}`}
                className="mt-3 inline-block text-sm text-brand-600 hover:underline dark:text-brand-300"
              >
                See it as a buyer would →
              </Link>

              <ServiceReview serviceId={service.id} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
