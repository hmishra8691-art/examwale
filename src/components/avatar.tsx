import { cx } from "@/components/ui";

const SIZE_CLASS = {
  xs: "h-7 w-7 text-[10px]",
  sm: "h-10 w-10 text-xs",
  md: "h-14 w-14 text-sm",
  lg: "h-24 w-24 text-xl",
} as const;

/** Which stored variant to request. The 128px one covers everything but `lg`. */
const VARIANT: Record<keyof typeof SIZE_CLASS, "sm" | "lg"> = {
  xs: "sm",
  sm: "sm",
  md: "sm",
  lg: "lg",
};

/**
 * Deterministic tint for the initials fallback.
 *
 * Derived from the name so the same person is the same colour everywhere, which
 * makes a list of avatars scannable even when nobody has uploaded a photo. Six
 * hues, all dark enough for white text to clear contrast at small sizes.
 */
const TINTS = [
  "bg-[#2F5D62]",
  "bg-[#5B4B8A]",
  "bg-[#7A4A3A]",
  "bg-[#2C5F8A]",
  "bg-[#6B4A6E]",
  "bg-[#3F6B45]",
];

function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function tintFor(seed: string): string {
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) total += seed.charCodeAt(index);
  return TINTS[total % TINTS.length];
}

/**
 * A person's picture, or their initials.
 *
 * The fallback is not a placeholder to be replaced later — most people never
 * upload a photo, so initials on a stable colour is the state this component is
 * usually in, and it is designed for that rather than treated as an error case.
 *
 * `hash` is the avatar's content hash. Passing it puts the hash in the URL, which
 * is what lets the response be cached for a year: a new picture is a new URL, so
 * a stale cache is impossible rather than merely unlikely. Without a hash the
 * component renders initials and makes no request at all.
 */
export function Avatar({
  userId,
  name,
  hash,
  size = "sm",
  className,
}: {
  userId: string;
  name?: string | null;
  hash?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const shared = cx(
    "shrink-0 overflow-hidden rounded-full object-cover",
    SIZE_CLASS[size],
    className,
  );

  if (!hash) {
    return (
      <span
        aria-hidden
        className={cx(
          shared,
          "inline-flex items-center justify-center font-semibold tracking-tight text-white",
          tintFor(userId),
        )}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    // A plain img rather than next/image: these are already exactly the size
    // they are served at, and routing a 128px WebP through an optimiser to
    // produce a 128px WebP is work for nothing.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/v1/users/${userId}/avatar?size=${VARIANT[size]}&v=${hash}`}
      alt=""
      width={size === "lg" ? 96 : 56}
      height={size === "lg" ? 96 : 56}
      loading="lazy"
      decoding="async"
      className={shared}
    />
  );
}
