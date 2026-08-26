import { noContent, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { deleteMessage } from "@/modules/messaging/service";

type Context = { params: Promise<{ messageId: string }> };

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { messageId } = await context.params;
  await deleteMessage({ messageId, userId: session.sub });
  return noContent();
});
