/**
 * Take or give back a short reservation on a slot.
 *
 * POST holds, DELETE releases. The hold is what stops two people filling in the
 * same booking form and one of them losing at the end of it — the slot is
 * reserved while the second person is still choosing.
 */
import { z } from "zod";
import { created, noContent, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { holdSlot, releaseHold } from "@/modules/mentors/service";

const holdSchema = z.object({ scheduledAt: z.string().datetime() });
const releaseSchema = z.object({ holdId: z.string().min(1).max(64) });

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  // Generous, because refreshing a booking page legitimately re-takes the hold,
  // but bounded so holds cannot be used to sweep a mentor's whole calendar.
  await consume(`mentor:hold:${session.sub}`, 60, 60 * 60);

  const { id } = await context.params;
  const body = holdSchema.parse(await readJson(request));
  const when = new Date(body.scheduledAt);
  if (Number.isNaN(when.getTime())) throw new ValidationError("That isn't a valid time.");

  return created(await holdSlot({ mentorId: id, seekerId: session.sub, scheduledAt: when }));
});

export const DELETE = route(async (request: Request) => {
  const session = await requireSession();
  const body = releaseSchema.parse(await readJson(request));
  await releaseHold({ holdId: body.holdId, seekerId: session.sub });
  return noContent();
});
