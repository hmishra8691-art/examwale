import { redirect } from "next/navigation";
import { route } from "@/modules/shared/http";
import { NotFoundError } from "@/modules/shared/errors";
import { getCreativeTarget, recordAdEvent } from "@/modules/ads/service";

type Context = { params: Promise<{ id: string }> };

/**
 * Click-through.
 *
 * Counts the click as an aggregate and redirects. Nothing about who clicked is
 * recorded, and the destination comes from the creative row rather than from a
 * query parameter — a `?url=` redirector here would be an open redirect with
 * our domain's reputation attached to it.
 */
export const GET = route(async (_request: Request, context: Context) => {
  const { id } = await context.params;

  const target = await getCreativeTarget(id);
  if (!target) throw new NotFoundError("That link is no longer active.");

  await recordAdEvent({ creativeId: id, type: "CLICK" });
  redirect(target);
});
