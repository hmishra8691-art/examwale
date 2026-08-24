import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { verifyCredential } from "@/modules/mentors/service";

const bodySchema = z.object({ note: z.string().trim().max(1000).optional() });

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request).catch(() => ({})));

  const credential = await verifyCredential({
    credentialId: id,
    adminId: admin.sub,
    note: body.note,
  });

  return ok({ credential });
});
