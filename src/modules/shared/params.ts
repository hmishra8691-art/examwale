/**
 * Query-string parsing for page components.
 *
 * Anything from a URL is user input, including on a page nobody is attacking:
 * a hand-edited `?page=x` reaching a SQL `OFFSET` as NaN is a 500 error page
 * for an ordinary visitor. These helpers return undefined for anything that
 * isn't usable, so the caller falls back to its default instead of crashing.
 */

export type RawParam = string | string[] | undefined;

export function one(value: RawParam): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.trim() || undefined;
}

export function many(value: RawParam): string[] | undefined {
  if (!value) return undefined;
  const list = Array.isArray(value) ? value : value.split(",");
  const cleaned = list.map((item) => item.trim()).filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

/** A finite integer within bounds, or undefined. Never NaN. */
export function int(
  value: RawParam,
  options: { min?: number; max?: number } = {},
): number | undefined {
  const raw = one(value);
  if (raw === undefined) return undefined;

  // Number("") is 0 and Number("1,000") is NaN; require plain digits.
  if (!/^-?\d+$/.test(raw)) return undefined;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return undefined;
  if (options.min !== undefined && parsed < options.min) return options.min;
  if (options.max !== undefined && parsed > options.max) return options.max;
  return parsed;
}

/** A value from a fixed set, or undefined. */
export function oneOf<T extends string>(value: RawParam, allowed: readonly T[]): T | undefined {
  const raw = one(value);
  return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

export function flag(value: RawParam): boolean {
  return one(value) === "1" || one(value) === "true";
}
