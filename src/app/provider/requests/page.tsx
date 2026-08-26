import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getProviderContext } from "@/modules/providers/service";
import { waitingForProvider } from "@/modules/providers/workload";
import { Avatar } from "@/components/avatar";
import { Badge, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Requests" };
export const dynamic = "force-dynamic";

const KIND_LABEL = {
  MENTORSHIP: "Session request",
  JOB_APPLICATION: "Job application",
  SERVICE_REQUEST: "Service request",
} as const;

function waitingFor(since: Date): string {
  const hours = Math.round((Date.now() - since.getTime()) / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 36) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default async function ProviderRequestsPage() {
  const session = await requirePage("/provider/requests");
  const { profile, active } = await getProviderContext(session.sub);
  if (!profile) redirect("/provider");

  const items = await waitingForProvider(session.sub, active);

  return (
    <div>
      <SectionHeading
        title="Waiting for you"
        description="Everything anybody is expecting a reply to, oldest first."
      />

      {items.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Nothing waiting"
            description="Session requests, job applications and service enquiries all land here."
          />
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted">
            {items.length} {items.length === 1 ? "person is" : "people are"} waiting. Oldest first —
            whoever has waited longest is the likeliest to have given up.
          </p>
          <ul className="mt-4 space-y-3">
            {items.map((item) => (
              <Card as="li" key={`${item.kind}-${item.id}`} className="relative">
                <div className="flex items-start gap-3">
                  <Avatar
                    userId={item.personId}
                    name={item.personName}
                    hash={item.avatarHash}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{item.personName ?? "Someone"}</p>
                      <Badge tone="neutral">{KIND_LABEL[item.kind]}</Badge>
                    </div>
                    <p className="mt-0.5 text-[13.5px] text-muted">{item.subject}</p>
                    {item.note ? (
                      <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-faint">
                        {item.note}
                      </p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs tabular-nums text-faint">{waitingFor(item.at)}</p>
                    <Link
                      href={item.href}
                      className="mt-1 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                    >
                      <span className="absolute inset-0" aria-hidden />
                      Open
                    </Link>
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
