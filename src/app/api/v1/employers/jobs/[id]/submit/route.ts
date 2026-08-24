import { ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { submitForReview } from "@/modules/employers/service";

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  consume(`job:submit:${session.sub}`, 40, 24 * 60 * 60);

  const { id } = await context.params;
  const { posting, flags } = await submitForReview(id, session.sub);

  return ok({
    posting,
    // Surfaced to the employer as well as the reviewer: someone who tripped
    // "mentions_candidate_payment" by describing a training bond deserves the
    // chance to reword it rather than to wait and be rejected.
    flags,
    message:
      "Submitted for review. A person checks each posting before it goes live — usually within a working day.",
  });
});
