/** Moderator decisions on one service listing. */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/shared/errors";
import { consume } from "@/modules/shared/rate-limit";
import { moderateService } from "@/modules/services/service";

const reason = (verb: string) =>
  z
    .string({ message: `Say why. A ${verb} without a reason is not actionable.` })
    .trim()
    .min(5, `Say why. A ${verb} without a reason is not actionable.`)
    .max(2000);

const bodySchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("start_review") }),
  z.object({ decision: z.literal("approve"), reason: z.string().trim().max(2000).optional() }),
  z.object({ decision: z.literal("request_changes"), reason: reason("change request") }),
  z.object({ decision: z.literal("reject"), reason: reason("refusal") }),
  z.object({ decision: z.literal("suspend"), reason: reason("suspension") }),
]);

type Context = { params: Promise<{ id: string }> };

export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  if (!["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.role)) {
    throw new ForbiddenError("Moderator access is required.");
  }
  await consume(`admin:services:${session.sub}`, 300, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));
  return ok(
    await moderateService({
      serviceId: id,
      moderatorId: session.sub,
      decision: body.decision,
      reason: "reason" in body ? (body.reason ?? null) : null,
    }),
  );
});
