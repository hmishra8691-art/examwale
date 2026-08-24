import { noContent, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { markRead } from "@/modules/notifications/service";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  // Scoped by user inside markRead — one statement, no ownership read-then-write gap.
  await markRead(session.sub, id);
  return noContent();
});
