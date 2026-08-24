import { z } from "zod";
import { ok, route, readJson } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { listCredentials, reviewMentorApplication } from "@/modules/mentors/service";

const bodySchema = z.object({
  decision: z.enum(["ACTIVE", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
});

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  return ok({ credentials: await listCredentials(id) });
});

export const POST = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const mentor = await reviewMentorApplication({
    mentorId: id,
    adminId: admin.sub,
    decision: body.decision,
    note: body.note,
  });

  return ok({ mentor });
});
