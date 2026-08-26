import { created, clientIp, readJson, route } from "@/modules/shared/http";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { signUpSchema } from "@/modules/auth/schemas";
import { signUp } from "@/modules/auth/service";
import { setSessionCookies } from "@/modules/auth/cookies";

export const POST = route(async (request: Request) => {
  const ip = clientIp(request);
  const body = signUpSchema.parse(await readJson(request));

  // Per-email is the limit that actually matters here — it stops repeated
  // attempts against one address. The IP limit is the burst guard, and it
  // loosens to a global ceiling when no trusted proxy makes the IP knowable.
  await consume(`signup:email:${body.email.toLowerCase()}`, 5, 15 * 60);
  await consumeByClient("signup", ip, { perIp: 5, globalFallback: 300 }, 15 * 60);

  const session = await signUp({
    ...body,
    ip,
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  await setSessionCookies(session.accessToken, session.refreshToken);
  return created({ user: session.user });
});
