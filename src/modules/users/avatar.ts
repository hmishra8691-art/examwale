/**
 * Profile pictures.
 *
 * Storage goes through the same `ObjectStore` as documents, which since Stage 1
 * means the Postgres driver by default — so avatars work on a serverless host
 * with nothing to configure, and the same swap to S3 later covers both.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getStore } from "@/modules/documents/storage";
import {
  AVATAR_CONTENT_TYPE,
  avatarStorageKey,
  processAvatar,
  type AvatarSize,
} from "@/modules/documents/images";
import { NotFoundError } from "@/modules/shared/errors";
import { recordAudit } from "@/modules/shared/audit";

export async function setAvatar(userId: string, input: Buffer) {
  const processed = await processAvatar(input);
  const store = getStore();

  for (const variant of processed.variants) {
    await store.put(
      avatarStorageKey(userId, processed.hash, variant.size),
      variant.buffer,
      AVATAR_CONTENT_TYPE,
    );
  }

  const [previous] = await db
    .select({ hash: users.avatarHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db
    .update(users)
    .set({ avatarHash: processed.hash, avatarUpdatedAt: new Date() })
    .where(eq(users.id, userId));

  /*
   * The old variants are removed only after the new ones are stored and the row
   * points at them. Deleting first would leave a window where the profile
   * references bytes that are already gone; this order fails towards a few
   * orphaned objects instead, which cost storage rather than breaking a page.
   */
  if (previous?.hash && previous.hash !== processed.hash) {
    await removeVariants(userId, previous.hash);
  }

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "user.avatar_set",
    entityType: "user",
    entityId: userId,
    after: { hash: processed.hash, bytes: processed.variants.map((v) => v.bytes) },
  });

  return { hash: processed.hash };
}

export async function clearAvatar(userId: string) {
  const [current] = await db
    .select({ hash: users.avatarHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!current?.hash) return;

  await db
    .update(users)
    .set({ avatarHash: null, avatarUpdatedAt: new Date() })
    .where(eq(users.id, userId));
  await removeVariants(userId, current.hash);

  await recordAudit({
    actorType: "user",
    actorId: userId,
    action: "user.avatar_cleared",
    entityType: "user",
    entityId: userId,
  });
}

async function removeVariants(userId: string, hash: string) {
  const store = getStore();
  for (const size of ["sm", "lg"] as AvatarSize[]) {
    await store.remove(avatarStorageKey(userId, hash, size)).catch(() => {
      // Already gone is fine, and a failure here must not undo the change the
      // person actually asked for.
    });
  }
}

export async function readAvatar(
  userId: string,
  hash: string,
  size: AvatarSize,
): Promise<Buffer> {
  try {
    return await getStore().get(avatarStorageKey(userId, hash, size));
  } catch {
    throw new NotFoundError("No picture there.");
  }
}
