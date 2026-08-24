import { clientIp, ok, readJson, route } from "@/modules/shared/http";
import { consume, consumeByClient } from "@/modules/shared/rate-limit";
import { forgotPasswordSchema } from "@/modules/auth/schemas";
import { requestPasswordReset } from "@/modules/auth/service";
import { env } from "@/modules/shared/env";

export const POST = route(async (request: Request) => {
  const { email } = forgotPasswordSchema.parse(await readJson(request));
  consume(`forgot:email:${email.toLowerCase()}`, 3, 15 * 60);
  consumeByClient("forgot", clientIp(request), { perIp: 5, globalFallback: 200 }, 15 * 60);
  const { token } = await requestPasswordReset(email);

  // Identical response whether or not the address exists.
  return ok({
    message: "If that email has an account, a reset link is on its way.",
    // Development convenience only: with no mail provider wired up, the token
    // is returned so the flow can be completed locally.
    ...(env.isProduction ? {} : { devResetToken: token }),
  });
});
