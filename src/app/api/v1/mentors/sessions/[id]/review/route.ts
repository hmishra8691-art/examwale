import { z } from "zod";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { submitReview } from "@/modules/mentors/service";

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).nullish(),
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  consume(`mentor:review:${session.sub}`, 30, 24 * 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const review = await submitReview({
    sessionId: id,
    seekerId: session.sub,
    rating: body.rating,
    comment: body.comment ?? null,
  });

  return created({ review });
});
