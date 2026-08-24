import { ok, route } from "@/modules/shared/http";
import { requireAdmin } from "@/modules/auth/session";
import { listCountriesForAdmin } from "@/modules/geo/service";

export const GET = route(async () => {
  await requireAdmin();
  return ok({ countries: await listCountriesForAdmin() });
});
