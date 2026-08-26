import { clientIp, ok, readJson, route } from "@/modules/shared/http";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { signInSchema } from "@/modules/auth/schemas";
import { signIn } from "@/modules/auth/service";
import { setSessionCookies } from "@/modules/auth/cookies";

export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const body = signInSchema.parse(await readJson(request));

  // Per-account first: this is the limit that stops credential stuffing against
  // one user. The IP limit catches broad spraying, and falls back to a loose
  // global ceiling when the IP isn't trustworthy.
  await consume(`login:acct:${body.email.toLowerCase()}`, 10, 15 * 60);
  await consumeByClient("login", ip, { perIp: 20, globalFallback: 600 }, 15 * 60);

  const session = await signIn({
    ...body,
    ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  await setSessionCookies(session.accessToken, session.refreshToken);
  return ok({ user: session.user });
});
