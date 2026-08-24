import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * Sortable, URL-safe, collision-resistant id.
 * Timestamp prefix keeps rows roughly insertion-ordered on disk, which keeps
 * range scans on created_at cheap without a second index.
 */
export function createId(): string {
  const time = Date.now().toString(36).padStart(9, "0");
  const bytes = randomBytes(12);
  let random = "";
  for (const byte of bytes) random += ALPHABET[byte % ALPHABET.length];
  return `${time}${random}`;
}

/** Deterministic slug from arbitrary text. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
