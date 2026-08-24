import { z } from "zod";
import { created, ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { ingestDocument, listDocuments } from "@/modules/documents/service";
import { documentTypeEnum } from "@/db/schema";

const documentTypeSchema = z.enum(documentTypeEnum.enumValues);

export const GET = route(async () => {
  const session = await requireSession();
  return ok({ documents: await listDocuments(session.sub) });
});

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  consume(`upload:${session.sub}`, 20, 60 * 60);

  const form = await request.formData().catch(() => null);
  if (!form) throw new ValidationError("Send the file as multipart form data.");

  const file = form.get("file");
  if (!(file instanceof File)) throw new ValidationError("No file was attached.");

  // Validated against the enum rather than cast: an unrecognised value would
  // otherwise reach Postgres, fail the insert, and leave the uploaded file on
  // disk with no row referencing it.
  const declaredType = form.get("type");
  const parsedType = documentTypeSchema.safeParse(declaredType);

  const result = await ingestDocument({
    userId: session.sub,
    file,
    declaredType: parsedType.success ? parsedType.data : undefined,
  });

  return created(result);
});
