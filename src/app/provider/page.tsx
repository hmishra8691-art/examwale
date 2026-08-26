import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import {
  CAPABILITIES,
  getProviderContext,
  providerSummary,
  suggestedCapabilities,
  type CapabilityKind,
} from "@/modules/providers/service";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { Avatar } from "@/components/avatar";
import { Badge, Callout, Card, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = {
  title: "Provider dashboard",
  description: "Everything you offer, in one place.",
};

const STATUS_TONE = {
  ACTIVE: "good",
  PENDING: "warn",
  SUSPENDED: "bad",
  REJECTED: "bad",
} as const;

const STATUS_WORDS = {
  ACTIVE: "active",
  PENDING: "being reviewed",
  SUSPENDED: "suspended",
  REJECTED: "not approved",
} as const;

export default async function ProviderHubPage() {
  const session = await requirePage("/provider");
  const { profile, capabilities, active } = await getProviderContext(session.sub);

  // No profile yet: this is a first visit, and the page's whole job is to
  // explain what a provider profile is for and start one.
  if (!profile) {
    const suggested = await suggestedCapabilities(session.sub);
    const implied = suggested.filter((s) => s.impliedBy);

    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
          Providers
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Offer something here
        </h1>
        <p className="mt-3 max-w-prose text-muted">
          Mentoring, roles, courses, or professional services — one profile covers all of them. You
          pick what you offer, and each one is reviewed on its own terms.
        </p>

        {implied.length ? (
          <div className="mt-6">
            <Callout tone="info" title="You are already partly set up">
              <p>
                {implied.map((s) => `${CAPABILITIES[s.kind].label} — ${s.impliedBy}`).join("; ")}.
                Filling in a profile connects that to your account properly, and stops you needing a
                second one for anything else you offer.
              </p>
            </Callout>
          </div>
        ) : null}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {(Object.keys(CAPABILITIES) as CapabilityKind[]).map((kind) => (
            <Card key={kind}>
              <h2 className="font-medium">{CAPABILITIES[kind].label}</h2>
              <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                {CAPABILITIES[kind].blurb}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-faint">{CAPABILITIES[kind].gate}</p>
            </Card>
          ))}
        </div>

        <div className="mt-8">
          <Link
            href="/provider/profile"
            className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Set up your provider profile
          </Link>
          <p className="mt-2 text-xs text-faint">
            About five minutes. Nothing is published until you pick what to offer.
          </p>
        </div>
      </div>
    );
  }

  const [summary, [account]] = await Promise.all([
    providerSummary(session.sub, active),
    db.select({ avatarHash: users.avatarHash }).from(users).where(eq(users.id, session.sub)).limit(1),
  ]);
  const avatarHash = account?.avatarHash ?? null;
  const pending = capabilities.filter((c) => c.status === "PENDING");
  const refused = capabilities.filter((c) => c.status === "REJECTED" || c.status === "SUSPENDED");
  const unclaimed = (Object.keys(CAPABILITIES) as CapabilityKind[]).filter(
    (kind) => !capabilities.some((c) => c.kind === kind),
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <Avatar userId={session.sub} name={profile.displayName} hash={avatarHash} size="lg" />
          <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-300">
            Provider
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            {profile.displayName}
          </h1>
          <p className="mt-1 max-w-prose text-muted">{profile.headline}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={profile.visibility === "PUBLIC" ? "good" : "neutral"}>
              {profile.visibility === "PUBLIC"
                ? "Publicly listed"
                : profile.visibility === "LIMITED"
                  ? "Link only"
                  : "Hidden"}
            </Badge>
            {profile.timezone ? <Badge tone="neutral">{profile.timezone}</Badge> : null}
          </div>
          </div>
        </div>
        <Link
          href="/provider/profile"
          className="shrink-0 rounded-lg border px-3 py-2 text-sm font-medium hover:bg-[var(--surface-raised)]"
        >
          Edit profile
        </Link>
      </div>

      {Object.keys(summary).length ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.pendingRequests != null ? (
            <Stat label="Requests waiting" value={String(summary.pendingRequests)} />
          ) : null}
          {summary.upcomingSessions != null ? (
            <Stat label="Upcoming sessions" value={String(summary.upcomingSessions)} />
          ) : null}
          {summary.activeJobs != null ? (
            <Stat label="Active roles" value={String(summary.activeJobs)} />
          ) : null}
          {summary.applicants != null ? (
            <Stat label="Applicants" value={String(summary.applicants)} />
          ) : null}
        </div>
      ) : null}

      {refused.length ? (
        <div className="mt-6 space-y-3">
          {refused.map((capability) => (
            <Callout
              key={capability.id}
              tone="warn"
              title={`${CAPABILITIES[capability.kind as CapabilityKind].label} — ${STATUS_WORDS[capability.status]}`}
            >
              <p>
                {capability.reviewNote ??
                  "No reason was recorded, which is a bug on our side — contact support and we will look."}
              </p>
            </Callout>
          ))}
        </div>
      ) : null}

      <div className="mt-8">
        <SectionHeading
          title="What you offer"
          description="Each one is reviewed separately, because the checks are different."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {capabilities.map((capability) => {
            const meta = CAPABILITIES[capability.kind as CapabilityKind];
            const usable = capability.status === "ACTIVE";
            return (
              <Card key={capability.id}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{meta.label}</h3>
                  <Badge tone={STATUS_TONE[capability.status]}>
                    {STATUS_WORDS[capability.status]}
                  </Badge>
                </div>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{meta.blurb}</p>
                {capability.status === "PENDING" ? (
                  <p className="mt-2 text-xs leading-relaxed text-faint">{meta.gate}</p>
                ) : null}
                {usable && meta.href ? (
                  <Link
                    href={meta.href}
                    className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                  >
                    Open →
                  </Link>
                ) : usable ? (
                  <p className="mt-3 text-xs text-faint">
                    Approved. The screens for managing this are not built yet — you will see them
                    here when they are.
                  </p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      {unclaimed.length ? (
        <div className="mt-10">
          <SectionHeading
            title="Add something else"
            description="One profile covers everything — you do not need a second account."
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {unclaimed.map((kind) => (
              <Card key={kind}>
                <h3 className="font-medium">{CAPABILITIES[kind].label}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">
                  {CAPABILITIES[kind].blurb}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-faint">{CAPABILITIES[kind].gate}</p>
                <Link
                  href={CAPABILITIES[kind].applyHref}
                  className="mt-3 inline-block text-sm font-medium text-brand-600 hover:underline dark:text-brand-300"
                >
                  Apply →
                </Link>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {pending.length ? (
        <p className="mt-8 text-xs text-faint">
          Applications are reviewed by a person, usually within a couple of days. You will get a
          notification either way — nothing here is decided by a script.
        </p>
      ) : null}
    </div>
  );
}
