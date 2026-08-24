import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { aiConversations, aiMessages, type Citation } from "@/db/schema";
import { NotFoundError, ForbiddenError } from "@/modules/shared/errors";
import { getProvider, type ChatMessage } from "@/modules/ai/provider";
import { buildSystemPrompt } from "@/modules/ai/prompts";
import { loadProfileContext } from "@/modules/ai/context";
import { renderContext, retrieve, toCitations } from "@/modules/ai/retrieval";
import { applySafety, checkScope } from "@/modules/ai/safety";
import { assertWithinQuota, logUsage } from "@/modules/ai/usage";
import { retrievalScope, routeIntent, type AiMode } from "@/modules/ai/types";

const HISTORY_LIMIT = 12;

export async function listConversations(userId: string) {
  return db
    .select({
      id: aiConversations.id,
      mode: aiConversations.mode,
      title: aiConversations.title,
      updatedAt: aiConversations.updatedAt,
    })
    .from(aiConversations)
    .where(eq(aiConversations.userId, userId))
    .orderBy(desc(aiConversations.updatedAt))
    .limit(40);
}

export async function getConversation(conversationId: string, userId: string) {
  const conversation = await db.query.aiConversations.findFirst({
    where: eq(aiConversations.id, conversationId),
  });
  if (!conversation) throw new NotFoundError("That conversation doesn't exist.");
  if (conversation.userId !== userId) throw new ForbiddenError("That conversation isn't yours.");

  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(asc(aiMessages.createdAt));

  return { conversation, messages };
}

/**
 * Confirms a conversation belongs to the caller.
 *
 * Every code path that accepts a client-supplied conversation id must go
 * through this — the id is guessable enough (timestamp-prefixed) that skipping
 * the check would let one user read another's thread.
 */
export async function assertConversationOwner(
  conversationId: string,
  userId: string,
): Promise<void> {
  const conversation = await db.query.aiConversations.findFirst({
    where: eq(aiConversations.id, conversationId),
  });
  if (!conversation) throw new NotFoundError("That conversation doesn't exist.");
  if (conversation.userId !== userId) throw new ForbiddenError("That conversation isn't yours.");
}

export async function createConversation(input: {
  userId: string;
  mode?: AiMode;
  title?: string;
}) {
  const [conversation] = await db
    .insert(aiConversations)
    .values({
      userId: input.userId,
      mode: input.mode ?? "GENERAL",
      title: input.title ?? "New conversation",
    })
    .returning();
  return conversation;
}

export async function deleteConversation(conversationId: string, userId: string) {
  const conversation = await db.query.aiConversations.findFirst({
    where: eq(aiConversations.id, conversationId),
  });
  if (!conversation) return;
  if (conversation.userId !== userId) throw new ForbiddenError("That conversation isn't yours.");

  // Messages go first: no foreign key means no cascade, and a deleted thread
  // must not leave its contents behind in the database.
  await db.delete(aiMessages).where(eq(aiMessages.conversationId, conversationId));
  await db.delete(aiConversations).where(eq(aiConversations.id, conversationId));
}

/** First user message becomes the thread title, trimmed at a word boundary. */
function deriveTitle(message: string): string {
  const clean = message.trim().replace(/\s+/g, " ");
  if (clean.length <= 60) return clean;
  const cut = clean.slice(0, 60);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

export type PreparedTurn = {
  system: string;
  history: ChatMessage[];
  citations: Citation[];
  mode: AiMode;
  scopeResponse: string | null;
};

/**
 * Everything that happens before the model is called: intent routing, profile
 * assembly, retrieval, prompt construction. Kept separate from the streaming
 * loop so both the streaming and non-streaming paths behave identically.
 */
export async function prepareTurn(input: {
  userId: string | null;
  conversationId?: string;
  message: string;
  mode?: AiMode;
}): Promise<PreparedTurn> {
  const scopeResponse = checkScope(input.message);
  const mode = input.mode ?? routeIntent(input.message);

  if (scopeResponse) {
    return { system: "", history: [], citations: [], mode, scopeResponse };
  }

  const [profile, chunks, history] = await Promise.all([
    loadProfileContext(input.userId),
    retrieve({
      query: input.message,
      entityTypes: retrievalScope(mode),
      limit: 6,
    }),
    input.conversationId ? loadHistory(input.conversationId) : Promise.resolve([]),
  ]);

  const system = buildSystemPrompt({
    mode,
    profile,
    retrievedContext: renderContext(chunks),
  });

  return {
    system,
    history: [...history, { role: "user", content: input.message }],
    citations: toCitations(chunks),
    mode,
    scopeResponse: null,
  };
}

async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const rows = await db
    .select({ role: aiMessages.role, content: aiMessages.content })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(desc(aiMessages.createdAt))
    .limit(HISTORY_LIMIT);

  return rows
    .reverse()
    .map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}

export async function persistTurn(input: {
  conversationId: string;
  userMessage: string;
  assistantMessage: string;
  citations: Citation[];
  provider: string;
  isFirstMessage: boolean;
}) {
  await db.insert(aiMessages).values([
    {
      conversationId: input.conversationId,
      role: "user",
      content: input.userMessage,
      confidenceLabel: "UNVERIFIED",
    },
    {
      conversationId: input.conversationId,
      role: "assistant",
      content: input.assistantMessage,
      citations: input.citations.length ? input.citations : null,
      // Retrieval-grounded answers are still model output; the per-claim
      // distinction lives in the text, and the badge stays honest about origin.
      confidenceLabel: input.citations.length ? "ESTIMATED" : "AI_JUDGEMENT",
      providerUsed: input.provider,
    },
  ]);

  await db
    .update(aiConversations)
    .set({
      updatedAt: new Date(),
      ...(input.isFirstMessage ? { title: deriveTitle(input.userMessage) } : {}),
    })
    .where(eq(aiConversations.id, input.conversationId));
}

/** Non-streaming turn — used by the API and by server-rendered flows. */
export async function completeTurn(input: {
  userId: string;
  plan: "FREE" | "PREMIUM" | "B2B";
  conversationId: string;
  message: string;
  mode?: AiMode;
}) {
  await assertWithinQuota(input.userId, input.plan);

  const prepared = await prepareTurn({
    userId: input.userId,
    conversationId: input.conversationId,
    message: input.message,
    mode: input.mode,
  });

  const existing = await db
    .select({ id: aiMessages.id })
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, input.conversationId))
    .limit(1);
  const isFirstMessage = existing.length === 0;

  if (prepared.scopeResponse) {
    await persistTurn({
      conversationId: input.conversationId,
      userMessage: input.message,
      assistantMessage: prepared.scopeResponse,
      citations: [],
      provider: "policy",
      isFirstMessage,
    });
    return { text: prepared.scopeResponse, citations: [], provider: "policy" };
  }

  const provider = getProvider();
  const started = Date.now();
  const result = await provider.complete({
    system: prepared.system,
    messages: prepared.history,
  });

  const safe = applySafety(result.text);

  await Promise.all([
    persistTurn({
      conversationId: input.conversationId,
      userMessage: input.message,
      assistantMessage: safe.text,
      citations: prepared.citations,
      provider: result.provider,
      isFirstMessage,
    }),
    logUsage({
      userId: input.userId,
      mode: prepared.mode,
      provider: result.provider,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      latencyMs: Date.now() - started,
    }),
  ]);

  return { text: safe.text, citations: prepared.citations, provider: result.provider };
}
