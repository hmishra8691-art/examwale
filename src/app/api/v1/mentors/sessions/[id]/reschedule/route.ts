/**
 * Move a session to a different time.
 *
 * Either party may ask. The service decides whether the caller is one of them,
 * and puts the result back to REQUESTED — a time the mentor accepted is not the
 * same as a time they have agreed to.
 */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { rescheduleSession } from "@/modules/mentors/service";

const bodySchema = z.object({ scheduledAt: z.string().datetime() });
type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`mentor:reschedule:${session.sub}`, 20, 24 * 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));
  const when = new Date(body.scheduledAt);
  if (Number.isNaN(when.getTime())) throw new ValidationError("That isn't a valid time.");

  return ok({
    session: await rescheduleSession({ sessionId: id, actorId: session.sub, scheduledAt: when }),
  });
});
