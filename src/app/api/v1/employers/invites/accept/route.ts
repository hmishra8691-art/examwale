import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { clientIp, ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consumeByClient } from "@/modules/shared/rate-limit";
import { NotFoundError } from "@/modules/shared/errors";
import { acceptInvite } from "@/modules/employers/service";

const bodySchema = z.object({ token: z.string().min(10).max(200) });

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  // Token guessing is the threat here, so the limit is on attempts, not on the
  // account: a slow drip from many accounts is still a drip from one client.
  await consumeByClient("invite:accept", clientIp(request), { perIp: 20, globalFallback: 200 }, 60 * 60);

  const body = bodySchema.parse(await readJson(request));

  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, session.sub))
    .limit(1);
  if (!user) throw new NotFoundError("We couldn't find your account.");

  const organisationId = await acceptInvite({
    token: body.token,
    userId: session.sub,
    email: user.email,
  });

  return ok({ organisationId });
});
