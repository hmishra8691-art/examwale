/** One conversation: read it, or send to it. */
import { z } from "zod";
import { created, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { MAX_MESSAGE_LENGTH, getConversation, sendMessage } from "@/modules/messaging/service";

const bodySchema = z.object({
  body: z.string().trim().min(1, "Write something first.").max(MAX_MESSAGE_LENGTH),
});

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  return ok(await getConversation({ conversationId: id, userId: session.sub }));
});

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  // Enough for a real conversation, low enough that a script cannot flood
  // somebody's inbox faster than they can block it.
  await consume(`messaging:send:${session.sub}`, 120, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));
  const message = await sendMessage({
    conversationId: id,
    senderId: session.sub,
    body: body.body,
  });
  return created({ message });
});
