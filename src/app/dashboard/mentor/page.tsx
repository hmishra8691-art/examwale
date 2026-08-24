import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { mentorAvailability } from "@/db/schema";
import { requirePage } from "@/modules/auth/session";
import {
  getMentorForUser,
  listCredentials,
  listSessionsForMentor,
} from "@/modules/mentors/service";
import { formatDate } from "@/modules/shared/format";
import { AvailabilityEditor, CredentialForm, SessionActions } from "@/components/mentor-forms";
import { Badge, Callout, Card, EmptyState, SectionHeading, Stat } from "@/components/ui";

export const metadata: Metadata = { title: "Mentor dashboard" };

export default async function MentorDashboardPage() {
  const session = await requirePage("/dashboard/mentor");
  const mentor = await getMentorForUser(session.sub);
  if (!mentor) redirect("/mentors/apply");

  const [credentials, sessions, availability] = await Promise.all([
    listCredentials(mentor.id),
    listSessionsForMentor(session.sub),
    db
      .select()
      .from(mentorAvailability)
      .where(eq(mentorAvailability.mentorId, mentor.id))
      .orderBy(mentorAvailability.weekday, mentorAvailability.startMinute),
  ]);

  const pending = sessions.filter((row) => row.session.status === "REQUESTED");
  const upcoming = sessions.filter(
    (row) => row.session.status === "ACCEPTED" && new Date(row.session.scheduledAt) > new Date(),
  );
  const completed = sessions.filter((row) => row.session.status === "COMPLETED");
  const verifiedCount = credentials.filter((c) => c.status === "VERIFIED").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Mentor dashboard"
        description="Your requests, your hours, and the credentials your listing depends on."
      />

      {mentor.status !== "ACTIVE" ? (
        <div className="mt-6">
          <Callout
            tone={mentor.status === "REJECTED" ? "danger" : "warn"}
            title={
              mentor.status === "REJECTED"
                ? "Application declined"
                : "Your profile isn't public yet"
            }
          >
            {mentor.status === "REJECTED" ? (
              <p>{mentor.reviewNote ?? "We couldn't approve this application."}</p>
            ) : (
              <p>
                {verifiedCount === 0
                  ? "No credential has been verified yet. Add at least one below — a reviewer checks it before your profile is listed."
                  : "A credential is verified. A reviewer will approve the profile shortly."}
              </p>
            )}
          </Callout>
        </div>
      ) : (
        <div className="mt-6">
          <Callout tone="good" title="You're listed">
            <Link href={`/mentors/${mentor.id}`} className="underline">
              View your public profile
            </Link>
          </Callout>
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Pending requests" value={pending.length} tone={pending.length ? "warn" : undefined} />
        <Stat label="Upcoming" value={upcoming.length} />
        <Stat label="Completed" value={completed.length} />
      </div>

      <section className="mt-10">
        <SectionHeading title="Credentials" description="At least one must be verified for your profile to be listed." />
        {credentials.length ? (
          <ul className="mt-4 space-y-2">
            {credentials.map((credential) => (
              <li
                key={credential.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border)] p-3"
              >
                <div>
                  <p className="text-sm font-medium">{credential.title}</p>
                  <p className="text-xs text-faint">
                    {credential.kind.replace("_", " ")}
                    {credential.issuer ? ` · ${credential.issuer}` : null}
                  </p>
                </div>
                <Badge tone={credential.status === "VERIFIED" ? "good" : "warn"}>
                  {credential.status === "VERIFIED" ? "Verified" : "Awaiting check"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing added yet.</p>
        )}
        <div className="mt-4">
          <CredentialForm />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading
          title="Your hours"
          description="People can only book inside these windows. Times are IST."
        />
        <div className="mt-4">
          <AvailabilityEditor
            initial={availability.map((slot) => ({
              weekday: slot.weekday,
              startMinute: slot.startMinute,
              endMinute: slot.endMinute,
            }))}
          />
        </div>
      </section>

      <section className="mt-10">
        <SectionHeading title="Requests and sessions" />
        {sessions.length ? (
          <ul className="mt-5 grid gap-4">
            {sessions.map((row) => (
              <Card as="li" key={row.session.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium">{row.session.topic}</h3>
                    <p className="mt-1 text-sm text-muted">{row.seekerName ?? "A seeker"}</p>
                    <p className="mt-1 text-xs text-faint">
                      {formatDate(row.session.scheduledAt)} ·{" "}
                      {new Date(row.session.scheduledAt).toLocaleTimeString("en-IN", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <Badge tone={row.session.status === "REQUESTED" ? "warn" : "neutral"}>
                    {row.session.status.toLowerCase().replace("_", " ")}
                  </Badge>
                </div>

                {row.session.question ? (
                  <p className="mt-3 rounded-lg bg-[var(--surface-raised)] p-3 text-sm leading-relaxed">
                    {row.session.question}
                  </p>
                ) : null}

                <div className="mt-3">
                  <SessionActions
                    sessionId={row.session.id}
                    status={row.session.status}
                    asMentor
                  />
                </div>
              </Card>
            ))}
          </ul>
        ) : (
          <div className="mt-5">
            <EmptyState
              title="No requests yet"
              description="Once your profile is live and you've set your hours, requests will land here."
            />
          </div>
        )}
      </section>
    </div>
  );
}
