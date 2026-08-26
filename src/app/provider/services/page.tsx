import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getProviderContext } from "@/modules/providers/service";
import {
  SERVICE_KINDS,
  SERVICE_STATUS_META,
  listOwnServices,
  listServiceRequests,
  type ServiceKind,
  type ServiceStatus,
} from "@/modules/services/service";
import { Avatar } from "@/components/avatar";
import { Badge, ButtonLink, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Your services" };
export const dynamic = "force-dynamic";

export default async function ProviderServicesPage() {
  const session = await requirePage("/provider/services");
  const { profile, active } = await getProviderContext(session.sub);
  if (!profile) redirect("/provider/profile");

  if (!active.includes("SERVICE_PROVIDER")) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SectionHeading title="Services" />
        <div className="mt-5">
          <Callout tone="warn" title="Not approved for this yet">
            <p>
              Listing professional services needs the services capability on your provider profile.{" "}
              <Link href="/provider/apply?kind=SERVICE_PROVIDER" className="underline">
                Apply for it
              </Link>{" "}
              — a person reviews each application.
            </p>
          </Callout>
        </div>
      </div>
    );
  }

  const [items, requests] = await Promise.all([
    listOwnServices(session.sub),
    listServiceRequests(session.sub),
  ]);
  const openRequests = requests.filter((row) => row.request.status === "REQUESTED");

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeading
          title="Your services"
          description="Each listing is reviewed before it appears in the directory."
        />
        <ButtonLink href="/provider/services/new">Write a new one</ButtonLink>
      </div>

      {openRequests.length ? (
        <div className="mt-6">
          <SectionHeading
            title={`${openRequests.length} waiting for you`}
            description="Each one has a conversation open — reply there."
          />
          <ul className="mt-4 space-y-2">
            {openRequests.map((row) => (
              <Card as="li" key={row.request.id}>
                <div className="flex items-start gap-3">
                  <Avatar
                    userId={row.requesterId}
                    name={row.requesterName}
                    hash={row.avatarHash}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{row.requesterName ?? "Someone"}</p>
                    <p className="text-xs text-faint">{row.service.title}</p>
                    {row.request.message ? (
                      <p className="mt-1.5 line-clamp-2 text-[13.5px] text-muted">
                        {row.request.message}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    href="/messages"
                    className="shrink-0 text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Reply
                  </Link>
                </div>
              </Card>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-8">
        {items.length === 0 ? (
          <EmptyState
            title="Nothing listed yet"
            description="Write your first service. It saves as a draft, so nothing is public until you submit it and it passes review."
            action={<ButtonLink href="/provider/services/new">Write one</ButtonLink>}
          />
        ) : (
          <ul className="space-y-3">
            {items.map(({ service, openRequests: count }) => {
              const meta = SERVICE_STATUS_META[service.status as ServiceStatus];
              return (
                <Card as="li" key={service.id} className="relative">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-medium">
                        <Link
                          href={`/provider/services/${service.id}`}
                          className="hover:text-brand-600"
                        >
                          <span className="absolute inset-0" aria-hidden />
                          {service.title}
                        </Link>
                      </h3>
                      <p className="mt-0.5 text-xs text-faint">
                        {SERVICE_KINDS[service.kind as ServiceKind].label}
                      </p>
                      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                        {meta.blurb}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                      {Number(count) > 0 ? <Badge tone="brand">{count} waiting</Badge> : null}
                      {service.status === "ACTIVE" && !service.acceptingRequests ? (
                        <Badge tone="warn">paused requests</Badge>
                      ) : null}
                    </div>
                  </div>
                </Card>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
