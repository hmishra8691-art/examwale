/**
 * Upload or remove your own profile picture.
 *
 * Multipart rather than a JSON data URL: base64 inflates by a third, and a
 * multi-megabyte string through a JSON parser is a needless way to spend memory.
 */
import { noContent, ok, route } from "@/modules/shared/http";
import { requireSession } from "@/modules/auth/session";
import { consume } from "@/modules/shared/rate-limit";
import { ValidationError } from "@/modules/shared/errors";
import { clearAvatar, setAvatar } from "@/modules/users/avatar";
import { MAX_AVATAR_BYTES } from "@/modules/documents/images";

export const POST = route(async (request: Request) => {
  const session = await requireSession();
  // Each upload decodes and re-encodes two images, so this is a CPU limit as
  // much as an abuse one.
  await consume(`avatar:upload:${session.sub}`, 20, 60 * 60);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    throw new ValidationError("Attach an image file under the field name 'file'.");
  }
  if (file.size > MAX_AVATAR_BYTES) {
    throw new ValidationError(
      `Profile pictures need to be under ${Math.round(MAX_AVATAR_BYTES / (1024 * 1024))} MB.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { hash } = await setAvatar(session.sub, buffer);
  return ok({ hash, url: `/api/v1/users/${session.sub}/avatar?v=${hash}` });
});

export const DELETE = route(async () => {
  const session = await requireSession();
  await clearAvatar(session.sub);
  return noContent();
});
