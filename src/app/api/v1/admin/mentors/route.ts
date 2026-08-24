import { ok, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { listPendingMentors } from "@/modules/mentors/service";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ queue: await listPendingMentors() });
});
