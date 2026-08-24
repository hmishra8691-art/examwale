import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { getFullProfile, profileSchema, updateProfile } from "@/modules/users/service";
import { recordAudit } from "@/modules/shared/audit";

export const GET = route(async () => {
  const session = await requireSession();
  return ok(await getFullProfile(session.sub));
});

export const PATCH = route(async (request: Request) => {
  const session = await requireSession();
  const input = profileSchema.parse(await readJson(request));
  const profile = await updateProfile(session.sub, input);

  await recordAudit({
    actorType: "user",
    actorId: session.sub,
    action: "profile.updated",
    entityType: "user_profile",
    entityId: session.sub,
    after: { fields: Object.keys(input) },
  });

  return ok(profile);
});
