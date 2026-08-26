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


/**
 * Build a safe `LIKE` pattern from a person's search box.
 *
 * Two problems with `%${input}%`, and neither is SQL injection — Drizzle binds
 * the value, so the query is never malformed. The problems are inside the
 * pattern:
 *
 *  - **The filter becomes attacker-controlled.** A query of `%` matches every
 *    row, so a search that is supposed to narrow returns the lot.
 *  - **It is a CPU-exhaustion lever.** Postgres backtracks on alternating
 *    `%`-and-literal patterns, so `%a%a%a…%b` against a column of 4000-character
 *    biographies costs exponentially more than it looks like it should. The
 *    mentor search takes no session and had no rate limit, so a handful of
 *    concurrent requests was enough to occupy the database.
 *
 * Escaping the three metacharacters fixes both, and the length cap means one
 * request cannot ask for unbounded work regardless. Found by an adversarial
 * pass across every search surface.
 */
export function likePattern(input: string, maxLength = 80): string {
  const trimmed = input.trim().slice(0, maxLength);
  const escaped = trimmed
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
  return `%${escaped.toLowerCase()}%`;
}


/**
 * Whether a stored URL is one we are willing to render as a link.
 *
 * `z.string().url()` accepts `javascript:`, `data:` and `vbscript:` — it checks
 * shape, not scheme. React currently neuters those in an `href`, which is the
 * only reason this was not already exploitable, and depending on a framework
 * behaviour for a security property is how it breaks the day the framework
 * changes. The provider-links validator already did this check; five other
 * fields that end up in an anchor did not.
 */
export function isRenderableUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
