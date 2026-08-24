import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { approveJobPosting, rejectJobPosting } from "@/modules/employers/service";

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), note: z.string().trim().max(1000).optional() }),
  z.object({ decision: z.literal("reject"), reason: z.string().trim().min(5).max(1000) }),
]);

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  if (body.decision === "approve") {
    await approveJobPosting({ jobId: id, adminId: admin.sub, note: body.note });
  } else {
    await rejectJobPosting({ jobId: id, adminId: admin.sub, reason: body.reason });
  }

  return ok({ decision: body.decision });
});
