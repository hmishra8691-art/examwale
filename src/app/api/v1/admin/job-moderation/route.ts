import { ok, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { listPendingModeration } from "@/modules/employers/service";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ queue: await listPendingModeration() });
});
