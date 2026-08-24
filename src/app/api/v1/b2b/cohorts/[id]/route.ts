import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { acceptCohortInvite, cohortAnalytics, leaveCohort } from "@/modules/b2b/service";

const bodySchema = z.object({ action: z.enum(["accept", "leave"]) });

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  return ok(await cohortAnalytics(id, session.sub));
});

/** Student-side membership actions — consent in, or withdraw. */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const member =
    body.action === "accept"
      ? await acceptCohortInvite(id, session.sub)
      : await leaveCohort(id, session.sub);

  return ok({ member });
});
