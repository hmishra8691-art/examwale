import { noContent, ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { deleteConversation, getConversation } from "@/modules/ai/chat";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const { conversation, messages } = await getConversation(id, session.sub);
  return ok({ conversation, messages });
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  await deleteConversation(id, session.sub);
  return noContent();
});
