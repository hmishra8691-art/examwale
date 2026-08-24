import { noContent, ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { deleteDocument, getDocument } from "@/modules/documents/service";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  return ok(await getDocument(id, session.sub));
});

export const DELETE = route(async (_request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  await deleteDocument(id, session.sub);
  return noContent();
});
