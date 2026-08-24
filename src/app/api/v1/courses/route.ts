import { ok, route } from "@/modules/shared/http";
import { int, many, one, flag, oneOf } from "@/modules/shared/params";
import { listCourses } from "@/modules/courses/service";

const SORTS = ["relevance", "fee", "starting-soon"] as const;

export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const get = (key: string) => url.searchParams.getAll(key);

  const result = await listCourses({
    search: one(get("q")),
    mode: many(get("mode")),
    examId: one(get("exam")),
    careerSlug: one(get("career")),
    city: one(get("city")),
    maxFee: int(get("maxFee"), { min: 0, max: 100_000_000 }),
    freeOnly: flag(get("free")),
    providerId: one(get("provider")),
    page: int(get("page"), { min: 1, max: 5000 }),
    perPage: int(get("perPage"), { min: 6, max: 48 }),
    sort: oneOf(get("sort"), SORTS),
  });

  return ok(result);
});
