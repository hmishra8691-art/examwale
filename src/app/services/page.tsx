import type { Metadata } from "next";
import Link from "next/link";
import { getCountryIso } from "@/modules/geo/service";
import {
  SERVICE_DELIVERY,
  SERVICE_KINDS,
  listServices,
  type ServiceKind,
} from "@/modules/services/service";
import { formatMoney } from "@/modules/shared/format";
import { Avatar } from "@/components/avatar";
import { Badge, Callout, Card, EmptyState, Pill, SectionHeading } from "@/components/ui";

export const metadata: Metadata = {
  title: "Professional services",
  description: "Résumé reviews, interview coaching and consulting from people on the platform.",
};

type Props = { searchParams: Promise<{ kind?: string; q?: string; free?: string }> };

export default async function ServicesPage({ searchParams }: Props) {
  const params = await searchParams;
  const countryIso = await getCountryIso();
  const kind = params.kind && params.kind in SERVICE_KINDS ? (params.kind as ServiceKind) : undefined;

  const { items, total } = await listServices({
    kind,
    search: params.q,
    freeOnly: params.free === "1",
    countryIso,
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Professional services"
        description="Help with a specific thing, from people who do it for a living."
      />

      <div className="mt-5">
        <Callout tone="info" title="What this is, and what it is not">
          <p>
            These are offers from individual providers, reviewed before listing. Asking about one
            starts a conversation — <strong>no money changes hands on this platform</strong>, and we
            are not a party to whatever you agree. A listing that guarantees you a job or a score
            should be reported; nobody can promise that.
          </p>
        </Callout>
      </div>

      <form className="mt-6 flex flex-wrap gap-2" action="/services">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search services…"
          className="min-w-[16rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/services">
          <Pill active={!kind && params.free !== "1"}>Everything</Pill>
        </Link>
        <Link href="/services?free=1">
          <Pill active={params.free === "1"}>Free only</Pill>
        </Link>
        {(Object.keys(SERVICE_KINDS) as ServiceKind[]).map((value) => (
          <Link key={value} href={`/services?kind=${value}`}>
            <Pill active={kind === value}>{SERVICE_KINDS[value].label}</Pill>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-sm text-muted">
        {total} {total === 1 ? "service" : "services"}
      </p>

      {items.length === 0 ? (
        <div className="mt-5">
          <EmptyState
            title="Nothing listed here yet"
            description="Services appear once a provider has written one and it has passed review."
          />
        </div>
      ) : (
        <ul className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ service, provider, avatarHash }) => (
            <Card as="li" key={service.id} className="relative flex flex-col">
              <div className="flex items-start gap-3">
                <Avatar
                  userId={provider.userId}
                  name={provider.displayName}
                  hash={avatarHash}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium leading-snug">
                    <Link href={`/services/${service.slug}`} className="hover:text-brand-600">
                      <span className="absolute inset-0" aria-hidden />
                      {service.title}
                    </Link>
                  </h3>
                  <p className="mt-0.5 text-xs text-faint">{provider.displayName}</p>
                </div>
              </div>

              <p className="mt-3 line-clamp-3 flex-1 text-sm text-muted">{service.summary}</p>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <Badge tone="neutral">{SERVICE_KINDS[service.kind as ServiceKind].label}</Badge>
                {service.durationMinutes ? (
                  <span className="text-faint">{service.durationMinutes} min</span>
                ) : null}
                {service.turnaroundDays != null ? (
                  <span className="text-faint">
                    {service.turnaroundDays === 0 ? "same day" : `${service.turnaroundDays}d turnaround`}
                  </span>
                ) : null}
              </div>

              <p className="mt-3 text-sm">
                {service.priceOnRequest ? (
                  <span className="text-muted">Priced per engagement</span>
                ) : service.price === 0 ? (
                  <Badge tone="good">Free</Badge>
                ) : (
                  <span className="font-medium">
                    {formatMoney(service.price ?? 0, service.currencyCode)}
                  </span>
                )}
              </p>
              <p className="mt-1 text-xs text-faint">
                {SERVICE_DELIVERY[service.delivery] ?? service.delivery}
              </p>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
