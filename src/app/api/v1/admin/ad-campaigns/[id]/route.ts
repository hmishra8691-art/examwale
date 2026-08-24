import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { listCreatives, reviewCampaign } from "@/modules/ads/service";

const bodySchema = z.object({
  decision: z.enum(["ACTIVE", "REJECTED"]),
  note: z.string().trim().max(1000).optional(),
});

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  await requireAdmin();
  const { id } = await context.params;
  return ok({ creatives: await listCreatives(id) });
});

export const POST = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const campaign = await reviewCampaign({
    campaignId: id,
    adminId: admin.sub,
    decision: body.decision,
    note: body.note,
  });

  return ok({ campaign });
});
