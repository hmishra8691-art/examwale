import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { isSaved, listSaved, toggleSaved } from "@/modules/users/service";

const bodySchema = z.object({
  itemType: z.enum(["career", "job", "exam", "course", "business", "organisation"]),
  itemId: z.string().min(1),
  label: z.string().max(200).optional(),
});

export const GET = route(async (request: Request) => {
  const session = await requireSession();
  const url = new URL(request.url);
  const itemType = url.searchParams.get("itemType");
  const itemId = url.searchParams.get("itemId");

  if (itemType && itemId) {
    return ok({ saved: await isSaved(session.sub, itemType, itemId) });
  }
  return ok({ items: await listSaved(session.sub, itemType ?? undefined) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  const body = bodySchema.parse(await readJson(request));
  const result = await toggleSaved({ userId: session.sub, ...body });
  return ok(result);
});
