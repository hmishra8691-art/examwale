/** Search your own messages. Scoped by a join to your participation rows. */
import { ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { searchMessages } from "@/modules/messaging/service";

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`messaging:search:${session.sub}`, 120, 60 * 60);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  return ok({ results: await searchMessages({ userId: session.sub, query }) });
});
