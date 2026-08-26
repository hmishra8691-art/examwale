import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { cancelSession, completeSession, respondToSession } from "@/modules/mentors/service";
import { isRenderableUrl } from "@/modules/shared/params";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("respond"),
    decision: z.enum(["ACCEPTED", "DECLINED"]),
    note: z.string().trim().max(1000).nullish(),
    meetingUrl: z
      .string()
      .url()
      .max(500)
      // Scheme as well as shape: z.url() accepts javascript: and data:.
      .refine(isRenderableUrl, "Links must start with http:// or https://")
      .nullish(),
  }),
  z.object({ action: z.literal("complete") }),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().max(1000).optional() }),
]);

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  await consume(`mentorship:update:${session.sub}`, 120, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  if (body.action === "respond") {
    const updated = await respondToSession({
      sessionId: id,
      mentorUserId: session.sub,
      decision: body.decision,
      note: body.note ?? null,
      meetingUrl: body.meetingUrl ?? null,
    });
    return ok({ session: updated });
  }

  if (body.action === "complete") {
    return ok({ session: await completeSession(id, session.sub) });
  }

  return ok({ session: await cancelSession(id, session.sub, body.reason) });
});
