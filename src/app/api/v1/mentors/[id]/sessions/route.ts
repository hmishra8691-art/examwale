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
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  consume(`mentorship:request:${session.sub}`, 20, 24 * 60 * 60);

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
  });

  return created({ session: created_ });
});
