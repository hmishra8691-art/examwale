import { z } from "zod";
import { noContent, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { markRead, setMuted } from "@/modules/messaging/service";

const bodySchema = z.object({ muted: z.boolean().optional() });
type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request).catch(() => ({})));

  if (body.muted !== undefined) await setMuted(id, session.sub, body.muted);
  else await markRead(id, session.sub);

  return noContent();
});
