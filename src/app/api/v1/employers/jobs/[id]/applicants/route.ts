import { ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { listApplicants } from "@/modules/employers/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  return ok({ applicants: await listApplicants(id, session.sub) });
});
