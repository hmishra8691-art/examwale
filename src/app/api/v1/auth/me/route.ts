import { ok, route } from "@/modules/shared/http";
import { getSession } from "@/modules/auth/session";

export const GET = route(async () => {
  const session = await getSession();
  return ok({ user: session });
});
