/** A moderator's decision on one report. */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { ForbiddenError } from "@/modules/shared/errors";
import { consume } from "@/modules/shared/rate-limit";
import { decideReport } from "@/modules/messaging/service";

const bodySchema = z.object({
  status: z.enum(["UPHELD", "DISMISSED"]),
  note: z
    .string({ message: "Record why. A decision nobody can review is not moderation." })
    .trim()
    .min(5, "Record why. A decision nobody can review is not moderation.")
    .max(2000),
  lockConversation: z.boolean().optional(),
});

type Context = { params: Promise<{ id: string }> };

export const PATCH = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  if (!["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.role)) {
    throw new ForbiddenError("Moderator access is required.");
  }
  await consume(`admin:reports:${session.sub}`, 300, 60 * 60);

  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));
  await decideReport({
    reportId: id,
    moderatorId: session.sub,
    status: body.status,
    note: body.note,
    lockConversation: body.lockConversation,
  });
  return ok({ status: body.status });
});
