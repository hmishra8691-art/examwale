import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { setOrganisationVerification } from "@/modules/employers/service";

const bodySchema = z.object({
  status: z.enum(["VERIFIED", "REJECTED", "PENDING"]),
  note: z.string().trim().max(1000).optional(),
});

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const organisation = await setOrganisationVerification({
    organisationId: id,
    adminId: admin.sub,
    status: body.status,
    note: body.note,
  });

  return ok({ organisation });
});
