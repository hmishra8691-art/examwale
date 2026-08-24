import { ok, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { listCampaignsForReview } from "@/modules/ads/service";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ queue: await listCampaignsForReview() });
});
