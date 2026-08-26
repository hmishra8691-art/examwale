"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Button, Callout } from "@/components/ui";

/**
 * Choose or remove a profile picture.
 *
 * Shows a local preview the moment a file is picked, before the upload
 * finishes — a square crop is a surprise if you only see it afterwards, and the
 * crop is attention-based rather than centred, so it is not always the crop
 * somebody expects.
 *
 * The note about EXIF is not boilerplate. Phone photos carry the location they
 * were taken, people upload them from home, and stripping that is a thing the
 * product does on their behalf that they would otherwise have no way to know
 * about.
 */
export function AvatarUpload({
  userId,
  name,
  hash,
}: {
  userId: string;
  name?: string | null;
  hash: string | null;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setError(null);
    // Revoked once the server's copy is in place, or on failure.
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/v1/users/me/avatar", { method: "POST", body });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error?.message ?? "That didn't upload.");
      router.refresh();
    } catch (caught) {
      setError((caught as Error).message);
      setPreview(null);
      URL.revokeObjectURL(localUrl);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await fetch("/api/v1/users/me/avatar", { method: "DELETE" });
      setPreview(null);
      router.refresh();
    } catch {
      setError("Couldn't remove that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="h-24 w-24 shrink-0 rounded-full object-cover opacity-70"
        />
      ) : (
        <Avatar userId={userId} name={name} hash={hash} size="lg" />
      )}

      <div className="min-w-0 flex-1">
        {error ? (
          <div className="mb-2">
            <Callout tone="danger">{error}</Callout>
          </div>
        ) : null}

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/tiff"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            {busy ? "Uploading…" : hash ? "Change picture" : "Add a picture"}
          </Button>
          {hash ? (
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={remove}>
              Remove
            </Button>
          ) : null}
        </div>

        <p className="mt-2 max-w-prose text-xs leading-relaxed text-faint">
          Cropped to a square and resized. Location data is stripped from the file — phone photos
          carry the coordinates they were taken at, and a profile picture should not publish where
          you live. JPEG, PNG, WebP, GIF, AVIF or TIFF, under 8 MB.
        </p>
      </div>
    </div>
  );
}
