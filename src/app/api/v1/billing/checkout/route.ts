import { z } from "zod";
import { randomUUID } from "node:crypto";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { startCheckout } from "@/modules/billing/service";

const bodySchema = z.object({
  planCode: z.string().trim().min(2).max(60),
  /**
   * Supplied by the client so a double-submitted form reuses the same key and
   * the second attempt replays rather than charging twice. Generated here when
   * absent, which still protects against server-side retries.
   */
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`billing:checkout:${session.sub}`, 10, 60 * 60);

  const body = bodySchema.parse(await readJson(request));

  const result = await startCheckout({
    userId: session.sub,
    planCode: body.planCode,
    idempotencyKey: body.idempotencyKey ?? randomUUID(),
  });

  return created(result);
});
