import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { publish, unpublish } from "@/modules/admin/publish";

const bodySchema = z.object({
  entityType: z.enum(["career", "exam", "exam_edition", "scholarship"]),
  entityId: z.string().min(1),
  action: z.enum(["publish", "unpublish"]),
  reason: z.string().max(500).optional(),
});

export const POST = route(async (request: Request) => {
  const session = await requireAdmin();
  const body = bodySchema.parse(await readJson(request));

  if (body.action === "publish") {
    // Throws with a specific reason if the source or verification is missing.
    await publish({ entityType: body.entityType, entityId: body.entityId, adminId: session.sub });
    return ok({ status: "PUBLISHED" });
  }

  await unpublish({
    entityType: body.entityType,
    entityId: body.entityId,
    adminId: session.sub,
    reason: body.reason,
  });
  return ok({ status: "NEEDS_REVIEW" });
});
