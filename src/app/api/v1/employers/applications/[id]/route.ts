import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { updateApplicationStatus } from "@/modules/employers/service";

const bodySchema = z.object({
  status: z.enum(["IN_REVIEW", "REJECTED", "OFFER"]),
});

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`application:status:${session.sub}`, 300, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const application = await updateApplicationStatus({
    applicationId: id,
    userId: session.sub,
    status: body.status,
  });

  return ok({ application });
});
