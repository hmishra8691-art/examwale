import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { getPreferences, setPreference } from "@/modules/notifications/service";

const bodySchema = z.object({
  type: z.string().trim().min(1).max(80),
  channel: z.enum(["IN_APP", "EMAIL", "PUSH"]),
  enabled: z.boolean(),
});

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ preferences: await getPreferences(session.sub) });
});

export const PUT = route(async (request: Request) => {
  const session = await requireSession();
  await consume(`notifications:prefs:${session.sub}`, 200, 60 * 60);

  const body = bodySchema.parse(await readJson(request));
  await setPreference({ userId: session.sub, ...body });

  return ok({ preferences: await getPreferences(session.sub) });
});
