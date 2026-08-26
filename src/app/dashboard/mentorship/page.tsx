import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { listSessionsForSeeker } from "@/modules/mentors/service";
import { getEntitlements } from "@/modules/billing/entitlements";
import { formatDate } from "@/modules/shared/format";
import { MessageLink } from "@/components/message-link";
import { ReviewForm, SessionActions } from "@/components/mentor-forms";
import { Badge, ButtonLink, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Your mentorship" };

const STATUS_TONE: Record<string, "neutral" | "good" | "warn" | "bad" | "brand"> = {
  REQUESTED: "warn",
  ACCEPTED: "good",
  DECLINED: "neutral",
  COMPLETED: "brand",
  CANCELLED: "neutral",
  NO_SHOW: "bad",
};

export default async function SeekerMentorshipPage() {
  const session = await requirePage("/dashboard/mentorship");
  const [sessions, resolved] = await Promise.all([
    listSessionsForSeeker(session.sub),
    getEntitlements(session.sub),
  ]);

  const thisMonth = sessions.filter((row) => {
    const created = new Date(row.session.createdAt);
    const now = new Date();
    return (
      created.getMonth() === now.getMonth() &&
      created.getFullYear() === now.getFullYear() &&
      ["REQUESTED", "ACCEPTED", "COMPLETED"].includes(row.session.status)
    );
  }).length;

  return (
    <div className="measure-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <SectionHeading
          title="Your mentorship"
          description="Sessions you've requested, and the ones that happened."
        />
        <ButtonLink href="/mentors" variant="secondary">
          Find a mentor
        </ButtonLink>
      </div>

      <p className="mt-4 text-sm text-muted">
        {thisMonth} of {resolved.entitlements.mentorSessionsPerMonth} sessions used this month on
        the {resolved.planName} plan.
        {resolved.planCode === "free" ? (
          <>
            {" "}
            <Link href="/pricing" className="underline">
              See plans
            </Link>
          </>
        ) : null}
      </p>

      {sessions.length ? (
        <ul className="mt-6 grid gap-4">
          {sessions.map((row) => (
            <Card as="li" key={row.session.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-medium">{row.session.topic}</h3>
                  <p className="mt-1 text-sm text-muted">
                    with{" "}
                    <Link href={`/mentors/${row.mentorId}`} className="underline">
                      {row.mentorName ?? "a mentor"}
                    </Link>
                  </p>
                  <p className="mt-1 text-xs text-faint">
                    {formatDate(row.session.scheduledAt)} ·{" "}
                    {new Date(row.session.scheduledAt).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {row.session.durationMinutes} min
                  </p>
                </div>
                <Badge tone={STATUS_TONE[row.session.status] ?? "neutral"}>
                  {row.session.status.toLowerCase().replace("_", " ")}
                </Badge>
              </div>

              {row.session.mentorNote ? (
                <p className="mt-3 rounded-lg bg-[var(--surface-raised)] p-3 text-sm">
                  {row.session.mentorNote}
                </p>
              ) : null}

              {row.session.meetingUrl && row.session.status === "ACCEPTED" ? (
                <a
                  href={row.session.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm underline"
                >
                  Join the session
                </a>
              ) : null}

              <div className="mt-3">
                <MessageLink
                  withUserId={row.mentorUserId}
                  contextType="MENTORSHIP"
                  contextId={row.session.id}
                  label="Message this mentor"
                />
                <SessionActions
                  sessionId={row.session.id}
                  status={row.session.status}
                  asMentor={false}
                />
              </div>

              {row.session.status === "COMPLETED" && !row.hasReview ? (
                <ReviewForm sessionId={row.session.id} />
              ) : null}
            </Card>
          ))}
        </ul>
      ) : (
        <div className="mt-6">
          <EmptyState
            title="No sessions yet"
            description="Find someone who has done what you're trying to do, and ask them thirty minutes' worth of questions."
            action={<ButtonLink href="/mentors">Browse mentors</ButtonLink>}
          />
        </div>
      )}
    </div>
  );
}
