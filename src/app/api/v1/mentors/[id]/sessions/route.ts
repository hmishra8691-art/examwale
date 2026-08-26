import { z } from "zod";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { requestSession } from "@/modules/mentors/service";

const bodySchema = z.object({
  topic: z.string().trim().min(3).max(160),
  question: z.string().trim().max(2000).nullish(),
  scheduledAt: z.string().min(1),
  /**
   * The seeker's own reservation on this slot, if they took one.
   *
   * Passed through so the service converts that row rather than inserting
   * beside it — without this the hold blocks the very booking it exists to
   * protect, and the seeker is told their slot was taken by themselves.
   */
  fromHoldId: z.string().max(64).nullish(),
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`mentorship:request:${session.sub}`, 20, 24 * 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const scheduledAt = new Date(body.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new ValidationError("That date and time isn't valid.");
  }

  const created_ = await requestSession({
    mentorId: id,
    seekerId: session.sub,
    topic: body.topic,
    question: body.question ?? null,
    scheduledAt,
    fromHoldId: body.fromHoldId ?? null,
  });

  return created({ session: created_ });
});
