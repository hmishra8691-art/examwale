/** Session length, the gap between sessions, and how many a mentor will take. */
import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { setBookingRules } from "@/modules/mentors/service";

const bodySchema = z.object({
  sessionMinutes: z.number().int().min(15).max(180).optional(),
  bufferMinutes: z.number().int().min(0).max(120).optional(),
  maxPerDay: z.number().int().min(0).max(100).optional(),
  maxPerWeek: z.number().int().min(0).max(100).optional(),
});

export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`mentor:rules:${session.sub}`, 60, 60 * 60);
  const body = bodySchema.parse(await readJson(request));
  return ok({ mentor: await setBookingRules({ userId: session.sub, ...body }) });
});
