import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/modules/auth/session";
import { listBlocked, listConversations } from "@/modules/messaging/service";
import { Avatar } from "@/components/avatar";
import { BlockedList } from "@/components/messaging";
import { Badge, Callout, Card, EmptyState, SectionHeading } from "@/components/ui";

export const metadata: Metadata = { title: "Messages" };
export const dynamic = "force-dynamic";

function ago(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 90) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const CONTEXT_LABEL: Record<string, string> = {
  MENTORSHIP: "Mentoring",
  JOB_APPLICATION: "Hiring",
  COURSE_ENQUIRY: "Course",
  SUPPORT: "Support",
};

export default async function MessagesPage() {
  const session = await requirePage("/messages");
  const [conversations, blocked] = await Promise.all([
    listConversations(session.sub),
    listBlocked(session.sub),
  ]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <SectionHeading
        title="Messages"
        description="Conversations with people you have something in progress with."
      />

      {conversations.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="No conversations yet"
            description="A thread opens when you book a session, apply to a role, or enquire about a course. You cannot message people you have no connection to — that is deliberate."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {conversations.map((row) => (
            <Card as="li" key={row.conversation.id} className="relative">
              <div className="flex items-start gap-3">
                {row.other ? (
                  <Avatar
                    userId={row.other.id}
                    name={row.other.name}
                    hash={row.other.avatarHash}
                    size="sm"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium">
                      <Link href={`/messages/${row.conversation.id}`} className="hover:text-brand-600">
                        <span className="absolute inset-0" aria-hidden />
                        {row.other?.name ?? "Someone"}
                      </Link>
                    </h3>
                    <Badge tone="neutral">
                      {CONTEXT_LABEL[row.conversation.contextType] ?? row.conversation.contextType}
                    </Badge>
                    {Number(row.unread) > 0 ? (
                      <Badge tone="brand">{row.unread} new</Badge>
                    ) : null}
                    {row.mutedAt ? <Badge tone="neutral">muted</Badge> : null}
                  </div>
                  <p className="mt-0.5 text-xs text-faint">{row.conversation.subject}</p>
                  <p className="mt-1.5 line-clamp-1 text-sm text-muted">
                    {row.preview ?? "No messages yet."}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-faint">
                  {ago(row.conversation.lastMessageAt)}
                </span>
              </div>
            </Card>
          ))}
        </ul>
      )}

      <div className="mt-10">
        <SectionHeading title="Blocked" description="Neither of you can message the other." />
        <div className="mt-4">
          <BlockedList
            initial={blocked.map((row) => ({
              user: row.user,
              since: row.since.toISOString(),
            }))}
          />
        </div>
      </div>

      <div className="mt-10">
        <Callout tone="info" title="What we can and cannot see">
          <p>
            Messages are encrypted in transit and at rest, and only the two of you can read a
            conversation through the app. They are <strong>not</strong> end-to-end encrypted: if
            somebody reports a message, a moderator can read that conversation in order to judge it.
            We would rather say that plainly than show a padlock that does not mean what people
            assume it means.
          </p>
        </Callout>
      </div>
    </div>
  );
}
