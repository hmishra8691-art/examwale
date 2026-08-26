import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession, isAdmin } from "@/modules/auth/session";
import {
  SERVICE_DELIVERY,
  SERVICE_KINDS,
  getServiceBySlug,
  type ServiceKind,
} from "@/modules/services/service";
import { formatMoney } from "@/modules/shared/format";
import { Avatar } from "@/components/avatar";
import { RequestServiceForm } from "@/components/service-forms";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { service } = await getServiceBySlug(slug);
    return { title: service.title, description: service.summary };
  } catch {
    return { title: "Service" };
  }
}

export default async function ServiceDetailPage({ params }: Props) {
  const { slug } = await params;
  const session = await getSession();

  let data;
  try {
    data = await getServiceBySlug(slug, {
      userId: session?.sub ?? null,
      canSeeUnlisted: isAdmin(session),
    });
  } catch {
    notFound();
  }

  const { service, provider, avatarHash, isOwner } = data;
  const deliverables = (service.deliverables as string[] | null) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <Link href="/services" className="text-sm text-muted hover:underline">
        ← All services
      </Link>

      {service.status !== "ACTIVE" ? (
        <div className="mt-4">
          <Callout tone="warn" title="Not publicly listed">
            <p>
              You can see this because it is yours or you are an admin. Its current state is{" "}
              {service.status.toLowerCase()}.
            </p>
          </Callout>
        </div>
      ) : null}

      <header className="mt-4">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          {service.title}
        </h1>
        <p className="mt-2 text-lg text-muted">{service.summary}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="brand">{SERVICE_KINDS[service.kind as ServiceKind].label}</Badge>
          <Badge tone="neutral">{SERVICE_DELIVERY[service.delivery] ?? service.delivery}</Badge>
          {!service.acceptingRequests && service.status === "ACTIVE" ? (
            <Badge tone="warn">Not taking new requests</Badge>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              What happens
            </h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed">{service.description}</p>
          </section>

          {deliverables.length ? (
            <section>
              <SectionHeading
                title="What you end up with"
                description="Stated by the provider. If what you receive does not match this, report it."
              />
              <ul className="mt-3 space-y-1.5">
                {deliverables.map((entry, index) => (
                  <li key={index} className="flex gap-2 text-[14.5px]">
                    <span aria-hidden className="text-brand-600 dark:text-brand-300">
                      —
                    </span>
                    <span>{entry}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Who is offering it
            </h2>
            <Card className="mt-3">
              <div className="flex items-start gap-3">
                <Avatar
                  userId={provider.userId}
                  name={provider.displayName}
                  hash={avatarHash}
                  size="md"
                />
                <div className="min-w-0">
                  <h3 className="font-medium">{provider.displayName}</h3>
                  <p className="mt-0.5 text-sm text-muted">{provider.headline}</p>
                  {provider.currentRole || provider.currentOrganisation ? (
                    <p className="mt-1 text-xs text-faint">
                      {[provider.currentRole, provider.currentOrganisation]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-muted">
                {provider.bio}
              </p>
            </Card>
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Price</p>
            <p className="mt-1 text-2xl font-semibold">
              {service.priceOnRequest
                ? "On request"
                : service.price === 0
                  ? "Free"
                  : formatMoney(service.price ?? 0, service.currencyCode)}
            </p>
            {service.priceOnRequest ? (
              <p className="mt-1 text-xs text-faint">
                Depends on the work. Ask, and they will quote.
              </p>
            ) : null}
            <dl className="mt-4 space-y-1.5 text-sm">
              {service.durationMinutes ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Duration</dt>
                  <dd>{service.durationMinutes} minutes</dd>
                </div>
              ) : null}
              {service.turnaroundDays != null ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Turnaround</dt>
                  <dd>
                    {service.turnaroundDays === 0 ? "Same day" : `${service.turnaroundDays} days`}
                  </dd>
                </div>
              ) : null}
              {(service.languages as string[] | null)?.length ? (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Languages</dt>
                  <dd className="text-right">{(service.languages as string[]).join(", ")}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {isOwner ? (
            <Card>
              <p className="text-sm text-muted">This is yours.</p>
              <Link
                href={`/provider/services/${service.id}`}
                className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
              >
                Manage it →
              </Link>
            </Card>
          ) : !session ? (
            <Card>
              <p className="text-sm">
                <Link href={`/login?next=/services/${service.slug}`} className="underline">
                  Sign in
                </Link>{" "}
                to ask about this.
              </p>
            </Card>
          ) : service.status === "ACTIVE" && service.acceptingRequests ? (
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Ask about this
              </h2>
              <div className="mt-3">
                <RequestServiceForm serviceId={service.id} />
              </div>
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-muted">
                This provider has paused new requests. The listing stays up, so it is worth checking
                back.
              </p>
            </Card>
          )}
        </aside>
      </div>
    </div>
  );
}
