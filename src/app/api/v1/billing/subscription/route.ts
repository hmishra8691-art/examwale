import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { cancelSubscription, getBillingOverview, resumeSubscription } from "@/modules/billing/service";

const bodySchema = z.object({
  action: z.enum(["cancel", "resume"]),
  reason: z.string().trim().max(1000).optional(),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok(await getBillingOverview(session.sub));
});

export const PATCH = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`billing:subscription:${session.sub}`, 20, 60 * 60);

  const body = bodySchema.parse(await readJson(request));

  const subscription =
    body.action === "cancel"
      ? await cancelSubscription(session.sub, body.reason)
      : await resumeSubscription(session.sub);

  return ok({ subscription });
});
