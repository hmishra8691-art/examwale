import type { Metadata } from "next";
import { requirePage } from "@/modules/auth/session";
import { listConversations } from "@/modules/ai/chat";
import { getUsageSnapshot } from "@/modules/ai/usage";
import { getProvider } from "@/modules/ai/provider";
import { AI_MODES } from "@/modules/ai/types";
import { ChatWorkspace } from "@/components/chat-workspace";
import { one } from "@/modules/shared/params";

export const metadata: Metadata = { title: "Ask the assistant" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ChatPage({ searchParams }: { searchParams: SearchParams }) {
  const session = await requirePage("/chat");
  const params = await searchParams;

  const [conversations, usage] = await Promise.all([
    listConversations(session.sub),
    getUsageSnapshot(session.sub, session.plan),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <ChatWorkspace
        modes={AI_MODES}
        conversations={conversations.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          mode: conversation.mode,
          updatedAt: conversation.updatedAt.toISOString(),
        }))}
        usage={usage}
        plan={session.plan}
        initialQuestion={(one(params.q) ?? "").slice(0, 4000)}
        initialConversationId={one(params.c)}
        modelBacked={getProvider().isModelBacked}
      />
    </div>
  );
}
