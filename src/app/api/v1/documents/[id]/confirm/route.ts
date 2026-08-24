import { z } from "zod";
import { ok, readJson, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { confirmExtraction } from "@/modules/documents/service";

const bodySchema = z.object({
  acceptedSkills: z.array(z.string().trim().max(60)).max(100).default([]),
});

type Context = { params: Promise<{ id: string }> };

/**
 * The confirmation step. Nothing extracted from a document reaches the user's
 * profile until this endpoint is called with the fields they actually accepted.
 */
export const POST = route(async (request: Request, context: Context) => {
  const session = await requireSession();
  const { id } = await context.params;
  const body = bodySchema.parse(await readJson(request));

  const result = await confirmExtraction({
    userId: session.sub,
    documentId: id,
    acceptedSkills: body.acceptedSkills,
  });

  return ok(result);
});
