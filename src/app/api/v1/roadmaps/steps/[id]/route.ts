import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { updateStepStatus } from "@/modules/roadmaps/service";

const bodySchema = z.object({
  status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE"]),
});

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  await updateStepStatus({ userId: session.sub, stepId: id, status: body.status });
  return ok({ updated: true });
});
