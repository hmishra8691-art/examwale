import { ok, route } from "@/modules/shared/http";
import { getSession, isAdmin } from "@/modules/auth/session";
import { getMentorById } from "@/modules/mentors/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await getSession();
  const { id } = await context.params;

  return ok(
    await getMentorById(id, { userId: session?.sub ?? null, isAdmin: isAdmin(session) }),
  );
});
