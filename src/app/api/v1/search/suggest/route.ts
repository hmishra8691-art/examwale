import { z } from "zod";
import { clientIp, ok, route } from "@/modules/shared/http";
import { consumeByClient } from "@/modules/shared/rate-limit";
import { universalSearch } from "@/modules/search/service";

const querySchema = z.object({
  q: z.string().max(200),
  limit: z.coerce.number().int().min(1).max(12).default(8),
});

/**
 * Typeahead for the header search box.
 *
 * Deliberately the same `universalSearch` the results page uses, capped
 * shorter. A separate "suggestions index" would eventually disagree with the
 * page it previews, and a dropdown that shows a result the page then fails to
 * find is worse than no dropdown.
 *
 * Rate-limited by client rather than by user: the box fires while signed-out
 * visitors type, and typing is exactly when the limit must not bite.
 */
export const GET = route(async (request: Request) => {
  const url = new URL(request.url);
  const { q, limit } = querySchema.parse({
    q: url.searchParams.get("q") ?? "",
    limit: url.searchParams.get("limit") ?? undefined,
  });

  const query = q.trim();
  if (query.length < 2) return ok({ hits: [], query });

  await consumeByClient("suggest", clientIp(request), { perIp: 240, globalFallback: 20_000 }, 60 * 5);

  const { hits } = await universalSearch({ query, limit });

  return ok({
    query,
    hits: hits.map((hit) => ({
      kind: hit.kind,
      slug: hit.slug,
      title: hit.title,
      meta: hit.meta,
    })),
  });
});
