import { ok, route } from "@/modules/shared/http";
import { readRefreshCookie, setSessionCookies } from "@/modules/auth/cookies";
import { refreshSession } from "@/modules/auth/service";
import { UnauthorizedError } from "@/modules/shared/errors";

export const POST = route(async () => {
  const refreshToken = await readRefreshCookie();
  if (!refreshToken) throw new UnauthorizedError("No session to refresh.");

  const session = await refreshSession(refreshToken);
  await setSessionCookies(session.accessToken, session.refreshToken);
  return ok({ user: session.user });
});
