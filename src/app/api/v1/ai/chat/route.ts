import { z } from "zod";
import { db } from "@/db/client";
import { aiMessages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { fail, readJson } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { getProvider } from "@/modules/ai/provider";
import {
  assertConversationOwner,
  createConversation,
  persistTurn,
  prepareTurn,
} from "@/modules/ai/chat";
import { applySafety } from "@/modules/ai/safety";
import { assertWithinQuota, getUsageSnapshot, logUsage } from "@/modules/ai/usage";

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().nullish(),
  mode: z
    .enum(["CAREER", "EXAM", "JOB", "BUSINESS", "EDUCATION", "RESUME", "INTERVIEW", "GENERAL"])
    .optional(),
});

/**
 * Streaming chat over Server-Sent Events.
 *
 * The quota check runs before the provider is touched, so a user over their
 * limit costs nothing. Safety runs on the complete text after streaming ends —
 * the reader sees raw deltas, then the final `done` event replaces the message
 * with the checked version, which is what gets persisted.
 */
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    await consume(`ai-chat:${session.sub}`, 30, 60);

    const body = bodySchema.parse(await readJson(request));
    await assertWithinQuota(session.sub, session.plan);

    let conversationId = body.conversationId ?? null;
    if (conversationId) {
      // The id comes from the client, so ownership must be proven before any
      // history is loaded or any message is written into the thread.
      await assertConversationOwner(conversationId, session.sub);
    } else {
      const conversation = await createConversation({
        userId: session.sub,
        mode: body.mode ?? "GENERAL",
      });
      conversationId = conversation.id;
    }

    const existing = await db
      .select({ id: aiMessages.id })
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conversationId))
      .limit(1);
    const isFirstMessage = existing.length === 0;

    const prepared = await prepareTurn({
      userId: session.sub,
      conversationId,
      message: body.message,
      mode: body.mode,
    });

    const encoder = new TextEncoder();
    const send = (controller: ReadableStreamDefaultController, payload: unknown) =>
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

    const stream = new ReadableStream({
      async start(controller) {
        try {
          send(controller, { type: "meta", conversationId, mode: prepared.mode });

          // Out-of-scope questions bypass the model entirely.
          if (prepared.scopeResponse) {
            send(controller, { type: "delta", text: prepared.scopeResponse });
            await persistTurn({
              conversationId: conversationId!,
              userMessage: body.message,
              assistantMessage: prepared.scopeResponse,
              citations: [],
              provider: "policy",
              isFirstMessage,
            });
            send(controller, {
              type: "done",
              text: prepared.scopeResponse,
              citations: [],
              conversation: {
                id: conversationId,
                title: body.message.slice(0, 60),
                mode: prepared.mode,
                updatedAt: new Date().toISOString(),
              },
            });
            controller.close();
            return;
          }

          const provider = getProvider();
          const started = Date.now();
          let accumulated = "";

          for await (const delta of provider.stream({
            system: prepared.system,
            messages: prepared.history,
          })) {
            accumulated += delta;
            send(controller, { type: "delta", text: delta });
          }

          const safe = applySafety(accumulated);

          await Promise.all([
            persistTurn({
              conversationId: conversationId!,
              userMessage: body.message,
              assistantMessage: safe.text,
              citations: prepared.citations,
              provider: provider.name,
              isFirstMessage,
            }),
            logUsage({
              userId: session.sub,
              mode: prepared.mode,
              provider: provider.name,
              // Rough estimate: the streaming API doesn't hand back a usage
              // block, and four characters per token is close enough for cost
              // tracking that only needs to be directionally right.
              inputTokens: Math.round(prepared.system.length / 4),
              outputTokens: Math.round(accumulated.length / 4),
              latencyMs: Date.now() - started,
            }),
          ]);

          const usage = await getUsageSnapshot(session.sub, session.plan);

          send(controller, {
            type: "done",
            text: safe.text,
            citations: prepared.citations,
            remaining: usage.remaining,
            conversation: {
              id: conversationId,
              title: isFirstMessage ? body.message.slice(0, 60) : undefined,
              mode: prepared.mode,
              updatedAt: new Date().toISOString(),
            },
          });
          controller.close();
        } catch (error) {
          console.error("[ai/chat] stream failed", error);
          send(controller, {
            type: "error",
            message: "The assistant stopped part-way through. Please try that again.",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return fail(error);
  }
}
