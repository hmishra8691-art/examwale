import { ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { markAllRead } from "@/modules/notifications/service";

export const POST = route(async () => {
  const session = await requireSession();
  return ok({ marked: await markAllRead(session.sub) });
});
