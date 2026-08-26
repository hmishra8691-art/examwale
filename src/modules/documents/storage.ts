import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { storageObjects } from "@/db/schema";
import { env } from "@/modules/shared/env";

/**
 * Object storage behind a three-method interface.
 *
 * Uploaded documents contain names, addresses and employment history, so no
 * driver may put them anywhere that is served statically — every read goes
 * through an authorised route.
 *
 * Two drivers, chosen by STORAGE_DRIVER:
 *
 *  - `postgres` (default) keeps the bytes in the database next to the metadata
 *    row that describes them. It needs no account, no second env var and no
 *    egress configuration, and it works unchanged on a serverless host.
 *    Résumés are capped at MAX_UPLOAD_BYTES, so the volume is measured in
 *    hundreds of megabytes, which Postgres holds without complaint.
 *  - `local` writes to disk. Useful in development because you can look at what
 *    was written; it cannot be used on a serverless host, and it now says so
 *    rather than accepting writes that evaporate.
 *
 * An object-store driver (S3, R2, B2) belongs here when the object count makes
 * a database table the wrong shape, or when reads want a CDN in front of them.
 * That is a new class implementing the three methods below plus a `case` in
 * `getStore` — no call site changes. It is deliberately not written yet: it
 * cannot be exercised without a live bucket, and an untested storage driver is
 * the same class of bug as the one this file exists to fix.
 *
 * The default used to be `local` regardless of environment. On Vercel that
 * meant uploads were written to an ephemeral, largely read-only filesystem —
 * they either failed or disappeared at the next cold start, with nothing in the
 * logs to say a document had been lost. Defaulting to the driver that works
 * everywhere is the difference between a deployment that stores files and one
 * that only appears to.
 */
export interface ObjectStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

export class StorageUnavailableError extends Error {}

class PostgresStore implements ObjectStore {
  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    await db
      .insert(storageObjects)
      .values({
        key,
        contentType,
        sizeBytes: data.byteLength,
        bytes: data,
      })
      // Re-uploading the same key replaces the object rather than failing, so a
      // retried request is idempotent instead of a duplicate-key error.
      .onConflictDoUpdate({
        target: storageObjects.key,
        set: {
          contentType,
          sizeBytes: data.byteLength,
          bytes: data,
          createdAt: new Date(),
        },
      });
  }

  async get(key: string): Promise<Buffer> {
    const [row] = await db
      .select({ bytes: storageObjects.bytes })
      .from(storageObjects)
      .where(eq(storageObjects.key, key))
      .limit(1);

    if (!row) throw new StorageUnavailableError(`No stored object for key ${key}`);
    return Buffer.from(row.bytes);
  }

  async remove(key: string): Promise<void> {
    await db.delete(storageObjects).where(eq(storageObjects.key, key));
  }
}

class LocalStore implements ObjectStore {
  private root = path.resolve(process.cwd(), env.storageLocalDir);

  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    // Compares against root + separator so a sibling directory (".storage-x")
    // can't satisfy a bare prefix check.
    if (target !== this.root && !target.startsWith(this.root + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }

  async get(key: string): Promise<Buffer> {
    return readFile(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    try {
      await unlink(this.resolve(key));
    } catch {
      // Already gone is a success for our purposes.
    }
  }
}

/**
 * True when the process is running somewhere with an ephemeral filesystem.
 *
 * Vercel and most other function hosts set a marker in the environment. This is
 * a heuristic, and it is only used to refuse a configuration that would lose
 * data silently — never to pick a driver behind the operator's back.
 */
function hasEphemeralFilesystem(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

let store: ObjectStore | null = null;

export function getStore(): ObjectStore {
  if (store) return store;

  const driver = env.storageDriver;
  switch (driver) {
    case "postgres":
      store = new PostgresStore();
      break;
    case "local":
      if (hasEphemeralFilesystem()) {
        // Refusing here costs one clear error. Accepting would cost every
        // document a user uploads, with no signal that anything went wrong.
        throw new StorageUnavailableError(
          "STORAGE_DRIVER=local cannot be used on a serverless host — uploads would " +
            "be written to a filesystem that is discarded between requests. Use " +
            "'postgres', which needs no extra configuration.",
        );
      }
      store = new LocalStore();
      break;
    default:
      throw new StorageUnavailableError(
        `Unknown STORAGE_DRIVER '${driver}'. Expected 'postgres' or 'local'.`,
      );
  }
  return store;
}

/** Test seam: forget the memoised driver so a changed env takes effect. */
export function resetStoreForTests(): void {
  store = null;
}

export function buildStorageKey(userId: string, filename: string): string {
  const extension = path.extname(filename).toLowerCase().slice(0, 8);
  const scope = createHash("sha256").update(userId).digest("hex").slice(0, 16);
  // Always forward slashes: this key is an S3 object name as often as it is a
  // path segment, and S3 does not treat a backslash as a separator.
  return `${scope}/${randomUUID()}${extension}`;
}

/**
 * Total bytes held by the Postgres driver, for the admin storage panel.
 *
 * Returns null under any other driver, where the number lives with the provider
 * rather than with us.
 */
export async function storageFootprint(): Promise<{ objects: number; bytes: number } | null> {
  if (env.storageDriver !== "postgres") return null;
  const [row] = await db
    .select({
      objects: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${storageObjects.sizeBytes}), 0)::bigint`,
    })
    .from(storageObjects);
  return { objects: Number(row?.objects ?? 0), bytes: Number(row?.bytes ?? 0) };
}
