import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/modules/auth/session";
import { getConversation } from "@/modules/messaging/service";
import { Avatar } from "@/components/avatar";
import { Thread } from "@/components/messaging";
import { Badge, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Conversation" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function ConversationPage({ params }: Props) {
  const { id } = await params;
  const session = await requirePage(`/messages/${id}`);

  let data;
  try {
    data = await getConversation({ conversationId: id, userId: session.sub });
  } catch {
    notFound();
  }

  return (
    <div className="page page-measure-sm py-8">
      <Link href="/messages" className="text-sm text-muted hover:underline">
        ← All messages
      </Link>

      <div className="mt-4 flex items-center gap-3">
        {data.other ? (
          <Avatar
            userId={data.other.id}
            name={data.other.name}
            hash={data.other.avatarHash}
            size="md"
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight">
            {data.other?.name ?? "Someone"}
          </h1>
          <p className="mt-0.5 text-sm text-muted">{data.conversation.subject}</p>
        </div>
        {data.conversation.lockedAt ? <Badge tone="bad">closed</Badge> : null}
      </div>

      <Card className="mt-5">
        <Thread
          conversationId={data.conversation.id}
          viewerId={session.sub}
          other={data.other}
          blocked={data.blocked}
          locked={data.conversation.lockedAt ? (data.conversation.lockedReason ?? "Closed by a moderator.") : null}
          initialMessages={data.messages.map((message) => ({
            id: message.id,
            senderId: message.senderId,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
            deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
          }))}
        />
      </Card>
    </div>
  );
}
