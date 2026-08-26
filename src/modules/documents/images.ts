import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import { ValidationError } from "@/modules/shared/errors";

/**
 * Avatar processing.
 *
 * The governing rule: **never serve back the bytes somebody uploaded.** Every
 * image is decoded and re-encoded, and the original is discarded. That single
 * decision handles most of what makes user-supplied images dangerous:
 *
 *  - **EXIF is dropped.** A photo taken on a phone carries GPS coordinates. A
 *    mentor uploading a selfie from home would otherwise publish their address
 *    to anyone who ran `exiftool` on their profile picture. This is the reason
 *    that matters most here, and it is invisible to everybody involved.
 *  - **Polyglots stop working.** A file that is a valid JPEG *and* a valid HTML
 *    document is a stored-XSS vector the moment a browser guesses the wrong
 *    content type. Re-encoding produces a file that is only an image.
 *  - **The content type becomes true.** We serve what we wrote, not what the
 *    upload claimed to be.
 *
 * SVG is refused outright rather than sanitised. It is a scripting format that
 * happens to draw pictures, and every sanitiser for it has a history of bypasses.
 *
 * Two fixed sizes, both square. Avatars appear in lists at ~40px and on a profile
 * at ~160px; serving one 2000px original to a page showing thirty mentors is how
 * a directory page comes to weigh twenty megabytes.
 */

export const AVATAR_SIZES = {
  /** Lists, cards, message threads. */
  sm: 128,
  /** Profile headers, and retina for the above. */
  lg: 512,
} as const;

export type AvatarSize = keyof typeof AVATAR_SIZES;

export function isAvatarSize(value: string): value is AvatarSize {
  return value === "sm" || value === "lg";
}

/** WebP everywhere: markedly smaller than JPEG at the same quality, and universal since 2020. */
export const AVATAR_CONTENT_TYPE = "image/webp";

/** Generous for a photo, mean enough that a 40-megapixel original is refused. */
export const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

/**
 * Ceiling on decoded pixels, which is not the same as file size.
 *
 * A few kilobytes of PNG can decode to gigabytes — the classic decompression
 * bomb. sharp enforces this during decode, so the memory is never allocated.
 * 50 megapixels is more than any phone camera and far below anything dangerous.
 */
const MAX_INPUT_PIXELS = 50_000_000;

const ACCEPTED_INPUT = new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"]);

export type ProcessedAvatar = {
  /** Content hash of the source, so a re-upload of the same photo is idempotent. */
  hash: string;
  variants: { size: AvatarSize; buffer: Buffer; bytes: number }[];
};

/**
 * Decode, square-crop, resize and re-encode.
 *
 * Cropping is `cover` with attention-based positioning: sharp finds the region
 * with the most detail rather than taking the centre, which for a photo of a
 * person is usually their face. Centre-cropping a portrait-orientation photo
 * frequently produces a picture of somebody's chest.
 */
export async function processAvatar(input: Buffer): Promise<ProcessedAvatar> {
  if (input.byteLength === 0) throw new ValidationError("That file is empty.");
  if (input.byteLength > MAX_AVATAR_BYTES) {
    throw new ValidationError(
      `Profile pictures need to be under ${Math.round(MAX_AVATAR_BYTES / (1024 * 1024))} MB.`,
    );
  }

  let metadata: Metadata;
  try {
    metadata = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (error) {
    /*
     * Two different refusals wear the same exception, and telling them apart
     * matters: somebody uploading a 200-megapixel scan of a certificate has a
     * real image and needs to be told it is too big, not that their file is
     * unreadable — advice that would send them looking for a converter.
     */
    const message = error instanceof Error ? error.message : "";
    if (/pixel|limitInputPixels/i.test(message)) {
      throw new ValidationError(
        `That image is enormous — over ${MAX_INPUT_PIXELS / 1_000_000} megapixels once decoded. Scale it down and try again.`,
      );
    }
    // sharp refusing to parse it is the answer, whatever the extension said.
    throw new ValidationError("That doesn't look like an image we can read. Try a JPEG or PNG.");
  }

  if (!metadata.format || !ACCEPTED_INPUT.has(metadata.format)) {
    throw new ValidationError(
      metadata.format === "svg"
        ? "SVG files aren't accepted for profile pictures — they can carry scripts. Export it as a PNG."
        : "We accept JPEG, PNG, WebP, GIF, AVIF and TIFF images.",
    );
  }
  if (!metadata.width || !metadata.height) {
    throw new ValidationError("That image has no readable dimensions.");
  }
  if (metadata.width < 64 || metadata.height < 64) {
    throw new ValidationError("That image is smaller than 64 pixels. It would look poor at any size.");
  }

  const hash = createHash("sha256").update(input).digest("hex").slice(0, 32);

  const variants: ProcessedAvatar["variants"] = [];
  for (const [size, pixels] of Object.entries(AVATAR_SIZES) as [AvatarSize, number][]) {
    const buffer = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      // An animated GIF becomes its first frame: an animated avatar in a list of
      // thirty is a distraction nobody chose, and the seeker reading the page did
      // not consent to it moving.
      .rotate() // Applies the EXIF orientation flag before the tag is discarded.
      .resize(pixels, pixels, { fit: "cover", position: sharp.strategy.attention })
      .webp({ quality: 82 })
      .toBuffer();
    variants.push({ size, buffer, bytes: buffer.byteLength });
  }

  return { hash, variants };
}

/**
 * Where a variant lives in the object store.
 *
 * Content-addressed, so a new picture gets a new key and the old one can be
 * cached forever. The user id is hashed rather than embedded: object keys end up
 * in logs and error messages, and a key that reads back as a user identifier is
 * an identifier that has leaked.
 */
export function avatarStorageKey(userId: string, hash: string, size: AvatarSize): string {
  const scope = createHash("sha256").update(userId).digest("hex").slice(0, 16);
  return `avatars/${scope}/${hash}-${size}.webp`;
}
