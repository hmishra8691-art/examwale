import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getProviderContext } from "@/modules/providers/service";
import { providerCalendar } from "@/modules/providers/workload";
import { formatInZone, zoneForUserId } from "@/modules/shared/timezone";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

export default async function ProviderCalendarPage() {
  const session = await requirePage("/provider/calendar");
  const { profile, active } = await getProviderContext(session.sub);
  if (!profile) redirect("/provider");

  const [entries, zone] = await Promise.all([
    providerCalendar(session.sub, active),
    zoneForUserId(session.sub),
  ]);

  // Grouped by the provider's own calendar day, not by UTC — a session at 00:30
  // for the server is still Tuesday evening where they are.
  const byDay = new Map<string, typeof entries>();
  for (const entry of entries) {
    const key = formatInZone(entry.at, zone, { withDate: true }).split(",").slice(0, 2).join(",");
    byDay.set(key, [...(byDay.get(key) ?? []), entry]);
  }

  return (
    <div>
      <SectionHeading
        title="The next six weeks"
        description="Sessions you have agreed to, and deadlines that are coming."
      />

      <p className="mt-2 text-xs text-faint">
        Times shown in {zone.replace(/_/g, " ")} — your own zone, set on your profile.
      </p>

      {entries.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Nothing scheduled"
            description="Accepted sessions and posting deadlines appear here as they arrive."
          />
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {[...byDay.entries()].map(([day, items]) => (
            <div key={day}>
              <h2 className="text-sm font-semibold text-muted">{day}</h2>
              <ul className="mt-2 space-y-2">
                {items.map((entry) => (
                  <Card as="li" key={`${entry.kind}-${entry.id}`} className="relative">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={entry.kind === "SESSION" ? "brand" : "warn"}>
                            {entry.kind === "SESSION" ? "Session" : "Deadline"}
                          </Badge>
                          <p className="font-medium">
                            <Link href={entry.href} className="hover:text-brand-600">
                              <span className="absolute inset-0" aria-hidden />
                              {entry.title}
                            </Link>
                          </p>
                        </div>
                        {entry.detail ? (
                          <p className="mt-0.5 text-[13.5px] text-muted">{entry.detail}</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-sm tabular-nums text-muted">
                        {formatInZone(entry.at, zone)}
                      </p>
                    </div>
                  </Card>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {active.includes("MENTOR") ? (
        <div className="mt-8">
          <Callout tone="info" title="This shows what is booked, not when you are free">
            <p>
              Your available hours, days off and one-off windows are set on your{" "}
              <Link href="/dashboard/mentor" className="underline">
                mentoring page
              </Link>
              . Seekers only ever see slots generated from those.
            </p>
          </Callout>
        </div>
      ) : null}
    </div>
  );
}
