import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HOLD_MINUTES, getMentorById, offeredSlots } from "@/modules/mentors/service";
import { getSession, isAdmin } from "@/modules/auth/session";
import { getCountryIso } from "@/modules/geo/service";
import { getMessages } from "@/modules/i18n/service";
import { zoneAbbreviation } from "@/modules/shared/timezone";
import { formatDate, formatMoney } from "@/modules/shared/format";
import { SessionRequestForm } from "@/components/mentor-forms";
import { Avatar } from "@/components/avatar";
import { Badge, Callout, Card, SectionHeading } from "@/components/ui";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const { name, mentor } = await getMentorById(id);
    return { title: `${name ?? "Mentor"} — ${mentor.headline}` };
  } catch {
    return { title: "Mentor" };
  }
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function timeLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const CREDENTIAL_KIND: Record<string, string> = {
  exam_result: "Exam result",
  employment: "Employment",
  education: "Education",
  licence: "Licence",
  other: "Other",
};

export default async function MentorProfilePage({ params }: Props) {
  const { id } = await params;
  const session = await getSession();

  let data;
  try {
    data = await getMentorById(id, { userId: session?.sub ?? null, isAdmin: isAdmin(session) });
  } catch {
    notFound();
  }

  const { mentor, name, rating, credentials, availability, reviews, isOwner } = data;
  const [t, countryIso] = await Promise.all([getMessages(), getCountryIso()]);

  /*
   * Slots are generated on the server, not in the browser.
   *
   * The picker used to build them from the weekly pattern using the visitor's
   * own clock, while the booking endpoint checked them against the server's —
   * so a seeker could pick a time the API would then refuse. Both now read the
   * same generator, and each slot arrives carrying its label in the mentor's
   * zone and in the viewer's.
   */
  const { slots, viewerZone } = await offeredSlots({
    mentorId: mentor.id,
    viewerUserId: session?.sub ?? null,
    viewerCountryIso: countryIso,
  });

  // The zone the mentor's published hours are written in. Was hardcoded to IST,
  // which was wrong the moment a mentor outside India set their hours.
  const publishedZone = availability[0]?.timezone ?? "UTC";

  return (
    <div className="page page-measure py-10">
      <Link href="/mentors" className="text-sm text-muted hover:underline">
        ← All mentors
      </Link>

      {!isOwner && mentor.status !== "ACTIVE" ? (
        <div className="mt-4">
          <Callout tone="warn" title="Not publicly listed">
            You&rsquo;re seeing this because you&rsquo;re an admin. This profile is not visible to
            anyone else.
          </Callout>
        </div>
      ) : null}

      {isOwner && mentor.status === "PENDING" ? (
        <div className="mt-4">
          <Callout tone="warn" title="Your profile isn't live yet">
            We verify at least one credential before listing a mentor.{" "}
            <Link href="/dashboard/mentor" className="underline">
              Add or check your credentials
            </Link>
            .
          </Callout>
        </div>
      ) : null}

      <header className="mt-4 flex flex-wrap items-start gap-5">
        <Avatar userId={data.userId} name={name} hash={data.avatarHash} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
              {name ?? "Mentor"}
            </h1>
            {mentor.credentialVerifiedAt ? (
              <Badge tone="good">{t.mentors.credentialsVerified}</Badge>
            ) : null}
          </div>
          <p className="mt-2 text-lg text-muted">{mentor.headline}</p>
          <p className="mt-1 text-sm text-faint">
            {[mentor.currentRole, mentor.currentOrganisation, mentor.city]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-8">
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">About</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed">{mentor.bio}</p>
          </section>

          <section>
            <SectionHeading
              title="Verified credentials"
              description="Checked by a person before this profile was listed."
            />
            {credentials.length ? (
              <ul className="mt-4 space-y-2">
                {credentials.map((credential) => (
                  <li
                    key={credential.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)] p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{credential.title}</p>
                      <p className="text-xs text-faint">
                        {CREDENTIAL_KIND[credential.kind] ?? credential.kind}
                        {credential.issuer ? ` · ${credential.issuer}` : null}
                      </p>
                    </div>
                    <Badge tone={credential.status === "VERIFIED" ? "good" : "neutral"}>
                      {credential.status === "VERIFIED" ? "Verified" : "Not yet checked"}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted">No credentials recorded.</p>
            )}
          </section>

          <section>
            <SectionHeading title="Reviews" />
            <p className="mt-2 text-sm">
              {rating.tooFew ? (
                <span className="text-muted">
                  {rating.total === 0
                    ? "No reviews yet."
                    : `${rating.total} ${rating.total === 1 ? "review" : "reviews"} — too few to show an average. An average from one or two sessions tells you almost nothing.`}
                </span>
              ) : (
                <span className="font-medium">
                  ★ {rating.average} from {rating.total} reviews
                </span>
              )}
            </p>

            {reviews.length ? (
              <ul className="mt-4 space-y-3">
                {reviews.map((entry) => (
                  <li key={entry.review.id} className="rounded-md border border-[var(--border)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {entry.reviewerName ?? "A seeker"}
                      </span>
                      <span className="text-sm text-rating">
                        {"★".repeat(entry.review.rating)}
                        <span className="text-ink-300 dark:text-ink-600">
                          {"★".repeat(5 - entry.review.rating)}
                        </span>
                      </span>
                    </div>
                    {entry.review.comment ? (
                      <p className="mt-2 text-sm leading-relaxed">{entry.review.comment}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-faint">{formatDate(entry.review.createdAt)}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        </div>

        <aside className="space-y-4">
          <Card>
            <p className="text-xs uppercase tracking-wide text-muted">{t.mentors.rate}</p>
            <p className="mt-1 text-2xl font-semibold">
              {mentor.sessionRate === 0
                ? t.mentors.free
                : formatMoney(mentor.sessionRate, mentor.currencyCode)}
            </p>
            <p className="mt-0.5 text-xs text-faint">per {mentor.sessionMinutes}-minute session</p>

            <dl className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t.mentors.experience}</dt>
                <dd className="font-medium">{mentor.yearsExperience} years</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">{t.mentors.languages}</dt>
                <dd className="text-right font-medium">{mentor.languages.join(", ")}</dd>
              </div>
            </dl>
          </Card>

          {availability.length ? (
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                Usual hours
              </h2>
              <ul className="mt-3 space-y-1 text-sm">
                {availability.map((slot) => (
                  <li key={slot.id} className="flex justify-between gap-2">
                    <span className="text-muted">{WEEKDAYS[slot.weekday]}</span>
                    <span className="tabular-nums">
                      {timeLabel(slot.startMinute)}–{timeLabel(slot.endMinute)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-faint">
                {zoneAbbreviation(new Date(), publishedZone)}
                {publishedZone !== viewerZone ? (
                  <> · shown in the mentor&rsquo;s timezone</>
                ) : null}
              </p>
            </Card>
          ) : null}

          {!isOwner ? (
            <Card>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
                {t.mentors.bookSession}
              </h2>
              <div className="mt-4">
                <SessionRequestForm
                  mentorId={mentor.id}
                  slots={slots}
                  signedIn={Boolean(session)}
                  holdMinutes={HOLD_MINUTES}
                />
              </div>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
