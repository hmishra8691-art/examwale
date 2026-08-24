import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { recordVerification } from "@/modules/admin/publish";

const bodySchema = z.object({
  entityType: z.enum(["career", "exam", "exam_edition", "scholarship"]),
  entityId: z.string().min(1),
  sourceId: z.string().min(1),
  validForDays: z.number().int().min(1).max(3650).optional(),
  note: z.string().max(1000).optional(),
});

export const POST = route(async (request: Request) => {
  const session = await requireAdmin();
  const body = bodySchema.parse(await readJson(request));
  await recordVerification({ ...body, adminId: session.sub });
  return ok({ verified: true });
});
