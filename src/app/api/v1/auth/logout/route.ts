import { ok, route } from "@/modules/shared/http";
import { clearSessionCookies, readRefreshCookie } from "@/modules/auth/cookies";
import { revokeSession } from "@/modules/auth/service";

export const POST = route(async () => {
  await revokeSession(await readRefreshCookie());
  await clearSessionCookies();
  return ok({ signedOut: true });
});
