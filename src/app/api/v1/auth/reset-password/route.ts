import { clientIp, ok, readJson, route } from "@/modules/shared/http";
import { consumeByClient } from "@/modules/shared/rate-limit";
import { resetPasswordSchema } from "@/modules/auth/schemas";
import { resetPassword } from "@/modules/auth/service";

export const POST = route(async (request: Request) => {
  await consumeByClient("reset", clientIp(request), { perIp: 10, globalFallback: 300 }, 15 * 60);
  const { token, password } = resetPasswordSchema.parse(await readJson(request));
  await resetPassword(token, password);
  return ok({ message: "Password updated. You can sign in now." });
});
