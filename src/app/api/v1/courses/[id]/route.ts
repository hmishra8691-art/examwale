import { ok, route } from "@/modules/shared/http";
import { getCourseById } from "@/modules/courses/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;
  return ok(await getCourseById(id));
});
