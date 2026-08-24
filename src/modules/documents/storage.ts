import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/modules/shared/env";

/**
 * Object storage behind a two-method interface.
 *
 * The local driver writes under a directory that is never served statically —
 * uploaded documents contain names, addresses and employment history, and must
 * only be reachable through an authorised route. Swapping in S3 means
 * implementing this interface, not touching any call site.
 */
export interface ObjectStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
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

let store: ObjectStore | null = null;

export function getStore(): ObjectStore {
  if (!store) store = new LocalStore();
  return store;
}

export function buildStorageKey(userId: string, filename: string): string {
  const extension = path.extname(filename).toLowerCase().slice(0, 8);
  const scope = createHash("sha256").update(userId).digest("hex").slice(0, 16);
  return path.join(scope, `${randomUUID()}${extension}`);
}
