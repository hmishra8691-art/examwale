import { ok, route } from "@/modules/shared/http";
import { int, one } from "@/modules/shared/params";
import { listProviders } from "@/modules/courses/service";

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const providers = await listProviders({
    search: one(url.searchParams.getAll("q")),
    limit: int(url.searchParams.getAll("limit"), { min: 1, max: 200 }),
  });
  return ok({ providers });
});
