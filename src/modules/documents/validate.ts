import { env } from "@/modules/shared/env";
import { ValidationError } from "@/modules/shared/errors";

const ALLOWED: Record<string, { extensions: string[]; label: string }> = {
  "application/pdf": { extensions: [".pdf"], label: "PDF" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    extensions: [".docx"],
    label: "Word document",
  },
  "text/plain": { extensions: [".txt"], label: "Text file" },
  "image/png": { extensions: [".png"], label: "PNG image" },
  "image/jpeg": { extensions: [".jpg", ".jpeg"], label: "JPEG image" },
};

/** Magic bytes, checked because a client-supplied MIME type proves nothing. */
const SIGNATURES: { bytes: number[]; mime: string }[] = [
  { bytes: [0x25, 0x50, 0x44, 0x46], mime: "application/pdf" },
  { bytes: [0x50, 0x4b, 0x03, 0x04], mime: "application/zip" }, // docx is a zip
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
];

export type ValidatedUpload = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  sizeBytes: number;
};

export async function validateUpload(file: File): Promise<ValidatedUpload> {
  if (file.size === 0) throw new ValidationError("That file is empty.");
  if (file.size > env.maxUploadBytes) {
    const limitMb = Math.round(env.maxUploadBytes / (1024 * 1024));
    throw new ValidationError(`Files need to be under ${limitMb} MB. Try compressing it first.`);
  }

  const declared = file.type || "application/octet-stream";
  const allowed = ALLOWED[declared];
  if (!allowed) {
    throw new ValidationError(
      "We accept PDF, Word (.docx), plain text, PNG and JPEG files. Convert your file and try again.",
    );
  }

  const dotIndex = file.name.lastIndexOf(".");
  if (dotIndex <= 0) {
    throw new ValidationError(
      `That file has no extension. Rename it to end in ${allowed.extensions[0]} and try again.`,
    );
  }

  const extension = file.name.slice(dotIndex).toLowerCase();
  if (!allowed.extensions.includes(extension)) {
    throw new ValidationError(
      `That looks like a ${allowed.label}, but the file extension doesn't match. Rename it to ${allowed.extensions[0]} or re-export it.`,
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  assertSignature(buffer, declared);
  assertNoActiveContent(buffer, declared);

  return {
    buffer,
    mimeType: declared,
    originalName: sanitiseName(file.name),
    sizeBytes: buffer.length,
  };
}

function assertSignature(buffer: Buffer, declared: string) {
  if (declared === "text/plain") return;

  const match = SIGNATURES.find((signature) =>
    signature.bytes.every((byte, index) => buffer[index] === byte),
  );

  const expected =
    declared === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ? "application/zip"
      : declared;

  if (!match || match.mime !== expected) {
    throw new ValidationError(
      "That file's contents don't match its type. Re-export it from the original application and try again.",
    );
  }
}

/**
 * Cheap structural screen for the classes of active content that make a
 * document dangerous downstream. Not a substitute for a real AV scanner —
 * production should put one in front of this — but it catches the obvious.
 */
function assertNoActiveContent(buffer: Buffer, declared: string) {
  if (declared !== "application/pdf") return;
  const head = buffer.subarray(0, Math.min(buffer.length, 200_000)).toString("latin1");
  const dangerous = ["/JavaScript", "/JS ", "/Launch", "/EmbeddedFile", "/OpenAction"];
  const found = dangerous.find((marker) => head.includes(marker));
  if (found) {
    throw new ValidationError(
      "That PDF contains embedded scripts or attachments, so we won't process it. Print it to a fresh PDF and upload that.",
    );
  }
}

function sanitiseName(name: string): string {
  return name
    .replace(/[/\\]/g, "_")
    .replace(/[^\w.\- ]/g, "")
    .slice(0, 180)
    .trim() || "document";
}
