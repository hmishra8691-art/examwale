/** Who you have blocked, and blocking or unblocking somebody. */
import { z } from "zod";
import { noContent, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { blockUser, listBlocked, unblockUser } from "@/modules/messaging/service";

const bodySchema = z.object({ userId: z.string().min(1).max(64) });

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ blocked: await listBlocked(session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`messaging:block:${session.sub}`, 100, 24 * 60 * 60);
  const body = bodySchema.parse(await readJson(request));
  await blockUser({ blockerId: session.sub, blockedId: body.userId });
  return noContent();
});

export const DELETE = route(async (request: Request) => {
  const session = await requireSession();
  const body = bodySchema.parse(await readJson(request));
  await unblockUser({ blockerId: session.sub, blockedId: body.userId });
  return noContent();
});
