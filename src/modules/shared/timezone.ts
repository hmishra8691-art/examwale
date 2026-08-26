/**
 * Timezone primitives.
 *
 * The rule for the whole codebase: an instant in the database is a UTC instant
 * (`timestamp with time zone`), and a *wall-clock* time — "Monday 10:00", the
 * thing a mentor types into an availability form — is meaningless without the
 * zone it was typed in. Those two are different kinds of value and converting
 * between them requires the zone explicitly, every time.
 *
 * What this replaces: code that called `date.getDay()` and `date.getHours()` to
 * interpret a stored wall-clock number. Those methods use whatever zone the
 * process happens to run in — the browser's for a seeker, UTC for a serverless
 * function — so a mentor in Asia/Kolkata offering 10:00–13:00 had that window
 * enforced against UTC clock time, five and a half hours out.
 *
 * No dependency: `Intl.DateTimeFormat` already carries the IANA database.
 */

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export type ZonedParts = {
  year: number;
  month: number;
  /** 1-31 */
  day: number;
  /** 0 = Sunday, matching `mentor_availability.weekday`. */
  weekday: number;
  hour: number;
  minute: number;
  /** Minutes since midnight in the target zone. */
  minuteOfDay: number;
};

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let cached = partsCache.get(timeZone);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    partsCache.set(timeZone, cached);
  }
  return cached;
}

/** True when the string is an IANA zone this runtime knows. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Break a UTC instant into its wall-clock parts *in the given zone*.
 *
 * This is the operation every "does this instant fall inside the mentor's
 * Monday window?" check needs, and the one `Date.prototype.getDay` cannot do.
 */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const parts = partsFormatter(timeZone).formatToParts(instant);
  const lookup: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") lookup[part.type] = part.value;
  }

  // Intl renders midnight as "24" under hour12:false in some runtimes.
  const hour = Number(lookup.hour) % 24;
  const minute = Number(lookup.minute);

  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    weekday: WEEKDAY_INDEX[lookup.weekday] ?? 0,
    hour,
    minute,
    minuteOfDay: hour * 60 + minute,
  };
}

/**
 * The zone's offset from UTC, in minutes, at a given instant.
 *
 * Positive east of Greenwich (Asia/Kolkata → +330). Derived by asking what
 * wall-clock time the zone shows for the instant and differencing, which is DST
 * correct because Intl applies the rule in force on that date.
 */
export function offsetMinutes(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  // Seconds and milliseconds are not in the formatted parts, so compare on the
  // minute boundary the parts do carry.
  const flooredInstant = Math.floor(instant.getTime() / 60_000) * 60_000;
  return (asUtc - flooredInstant) / 60_000;
}

/**
 * Turn a wall-clock time in a zone into the UTC instant it denotes.
 *
 * Two passes. The first guesses by treating the wall-clock fields as if they
 * were UTC and subtracting the offset that applies near that guess; the second
 * re-measures the offset at the guessed instant and corrects. The second pass
 * matters at DST boundaries, where the offset at the guess differs from the
 * offset at the answer.
 *
 * Two wall-clock times are not instants at all. On a spring-forward date the
 * hour that is skipped never happens, and on an autumn-fold date the repeated
 * hour happens twice. This function still returns something for both — the
 * nearest valid instant — but the direction it lands is an artefact of the
 * offset arithmetic, not a promise.
 *
 * So callers that care must ask `zonedTimeExists` first. A booking system is
 * exactly such a caller: quietly moving a session to the hour either side of
 * the one the mentor published is worse than never offering it, because nobody
 * involved finds out until one of them is sitting in an empty call.
 */
export function zonedTimeToUtc(
  wall: { year: number; month: number; day: number; minuteOfDay: number },
  timeZone: string,
): Date {
  const naive = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    Math.floor(wall.minuteOfDay / 60),
    wall.minuteOfDay % 60,
  );

  const firstGuess = new Date(naive - offsetMinutes(new Date(naive), timeZone) * 60_000);
  const correction = offsetMinutes(firstGuess, timeZone);
  return new Date(naive - correction * 60_000);
}

/**
 * Whether a wall-clock time is a real instant in that zone.
 *
 * Implemented as a round trip: convert to UTC, convert back, and see whether
 * the clock reads what we asked for. A skipped hour cannot round-trip, so this
 * returns false exactly for the times a calendar should refuse to offer.
 */
export function zonedTimeExists(
  wall: { year: number; month: number; day: number; minuteOfDay: number },
  timeZone: string,
): boolean {
  const back = zonedParts(zonedTimeToUtc(wall, timeZone), timeZone);
  return (
    back.year === wall.year &&
    back.month === wall.month &&
    back.day === wall.day &&
    back.minuteOfDay === wall.minuteOfDay
  );
}

const labelCache = new Map<string, Intl.DateTimeFormat>();

/**
 * Render an instant for a human, in a stated zone, with the zone named.
 *
 * The zone name is not optional decoration. "10:00 AM" between a mentor in
 * Kolkata and a seeker in Dubai is the single most expensive ambiguity this
 * product can ship, so every rendered session time carries its zone.
 */
export function formatInZone(
  instant: Date,
  timeZone: string,
  options: { withDate?: boolean } = {},
): string {
  const key = `${timeZone}|${options.withDate ? "d" : "t"}`;
  let formatter = labelCache.get(key);
  if (!formatter) {
    // en-IN renders "IST" and "GST" where en-GB and en-US both fall back to
    // "GMT+5:30" for Kolkata. Both are unambiguous; only one is what an Indian
    // or Gulf reader recognises at a glance. A zone with no local abbreviation
    // still degrades to an explicit offset, which is the property that matters.
    formatter = new Intl.DateTimeFormat("en-IN", {
      timeZone,
      ...(options.withDate
        ? { weekday: "short", day: "numeric", month: "short" }
        : {}),
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
      timeZoneName: "short",
    });
    labelCache.set(key, formatter);
  }
  return formatter.format(instant).replace(/\s+/g, " ").trim();
}

/** A short zone label on its own, e.g. "IST" or "GMT+4". */
export function zoneAbbreviation(instant: Date, timeZone: string): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    timeZoneName: "short",
  }).formatToParts(instant);
  return formatted.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

/**
 * The zone to show a given viewer, falling back sensibly.
 *
 * A stored preference wins; otherwise the country's principal zone; otherwise
 * UTC, which is wrong for everybody but ambiguous for nobody.
 */
export const COUNTRY_DEFAULT_ZONE: Record<string, string> = {
  IN: "Asia/Kolkata",
  AE: "Asia/Dubai",
};

export function resolveViewerZone(
  stored: string | null | undefined,
  countryIso: string | null | undefined,
): string {
  if (stored && isValidTimeZone(stored)) return stored;
  const byCountry = countryIso ? COUNTRY_DEFAULT_ZONE[countryIso.toUpperCase()] : undefined;
  if (byCountry) return byCountry;
  return "UTC";
}

/**
 * The zone to use for one user, reading their stored preference first.
 *
 * The fallback chain is: their own setting, then their provider profile's
 * setting, then their country's principal zone, then UTC. Stage 1 shipped only
 * the last two, and noted the gap: inferring a zone from a country is right for
 * two markets and wrong for anyone working from a third. This closes it.
 *
 * One query, and it is worth it. The alternative — showing a session time in a
 * zone the person does not live in — is the failure this whole module exists to
 * prevent.
 */
export async function zoneForUserId(
  userId: string | null | undefined,
  fallbackCountryIso?: string | null,
): Promise<string> {
  if (!userId) return resolveViewerZone(null, fallbackCountryIso);

  const { db } = await import("@/db/client");
  const { sql } = await import("drizzle-orm");

  const result = await db.execute<{
    profile_tz: string | null;
    provider_tz: string | null;
    iso: string | null;
  }>(sql`
    SELECT up.timezone AS profile_tz,
           pp.timezone AS provider_tz,
           c.iso_code  AS iso
    FROM users u
    LEFT JOIN user_profiles up ON up.user_id = u.id
    LEFT JOIN provider_profiles pp ON pp.user_id = u.id
    LEFT JOIN countries c ON c.id = up.country_id
    WHERE u.id = ${userId}
    LIMIT 1
  `);

  const row = result.rows?.[0];
  return resolveViewerZone(
    row?.profile_tz ?? row?.provider_tz ?? null,
    row?.iso ?? fallbackCountryIso ?? null,
  );
}
