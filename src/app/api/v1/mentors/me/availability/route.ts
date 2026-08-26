import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { setAvailability } from "@/modules/mentors/service";

const bodySchema = z.object({
  slots: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        startMinute: z.number().int().min(0).max(1439),
        endMinute: z.number().int().min(1).max(1440),
        timezone: z.string().max(60).optional(),
      }),
    )
    .max(40),
});

export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`mentor:availability:${session.sub}`, 60, 60 * 60);

  const body = bodySchema.parse(await readJson(request));
  const availability = await setAvailability({ userId: session.sub, slots: body.slots });

  return ok({ availability });
});
