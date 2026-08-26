/**
 * Report a message or a person.
 *
 * `alsoBlock` defaults on, because reporting harassment and wanting it to stop
 * now are almost always the same intention.
 */
import { z } from "zod";
import { created, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { REPORT_REASONS, reportContent } from "@/modules/messaging/service";

const bodySchema = z.object({
  subjectType: z.enum(["MESSAGE", "USER"]),
  subjectId: z.string().min(1).max(64),
  reason: z.enum(Object.keys(REPORT_REASONS) as [string, ...string[]]),
  detail: z.string().trim().max(2000).nullish(),
  alsoBlock: z.boolean().optional(),
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  // Loose: somebody being harassed across several messages should be able to
  // report each one. Tight enough to stop the queue being used as a weapon.
  await consume(`reports:file:${session.sub}`, 40, 24 * 60 * 60);

  const body = bodySchema.parse(await readJson(request));
  const report = await reportContent({
    reporterId: session.sub,
    subjectType: body.subjectType,
    subjectId: body.subjectId,
    reason: body.reason as keyof typeof REPORT_REASONS,
    detail: body.detail ?? null,
    alsoBlock: body.alsoBlock,
  });
  return created({ report });
});
