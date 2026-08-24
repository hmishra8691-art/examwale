import { ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { flag, int } from "@/modules/shared/params";
import { listNotifications, unreadCount } from "@/modules/notifications/service";

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const url = new URL(request.url);

  const [notifications, unread] = await Promise.all([
    listNotifications(session.sub, {
      unreadOnly: flag(url.searchParams.getAll("unread")),
      limit: int(url.searchParams.getAll("limit"), { min: 1, max: 100 }),
    }),
    unreadCount(session.sub),
  ]);

  return ok({ notifications, unread });
});
