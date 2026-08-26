/**
 * Bookable slot generation.
 *
 * One function turns a mentor's weekly availability rules into concrete UTC
 * instants, and the booking endpoint validates against that same function's
 * output. That shared path is the point: the previous arrangement had the
 * browser build the slot list and the server re-derive whether a slot was
 * valid, using different clocks, so the two could disagree — and did. Now a
 * request is accepted if and only if the instant appears in the list the
 * generator produces, which makes "the slot you were offered" and "the slot the
 * server accepts" the same sentence rather than two computations that have to
 * be kept in step by hand.
 *
 * Availability rows store wall-clock minutes plus the zone they were written
 * in. That zone is authoritative: a mentor who says 10:00 means 10:00 where
 * they are, whatever zone the server or the seeker happens to be in.
 */
import { formatInZone, zonedParts, zonedTimeExists, zonedTimeToUtc } from "@/modules/shared/timezone";

export type AvailabilityWindow = {
  weekday: number;
  startMinute: number;
  endMinute: number;
  timezone: string;
};

/**
 * A departure from the weekly pattern, for one calendar date.
 *
 * `startMinute`/`endMinute` null means the whole day. UNAVAILABLE beats
 * everything, including EXTRA, so a mentor who blocks a day and then forgets an
 * old one-off window on it stays blocked.
 */
export type AvailabilityException = {
  kind: "UNAVAILABLE" | "EXTRA";
  /** YYYY-MM-DD in the mentor's timezone. */
  onDate: string;
  startMinute: number | null;
  endMinute: number | null;
};

/**
 * How a slot is doing, derived rather than stored.
 *
 * The brief asks for slot statuses — available, pending, booked. Those are facts
 * about the *session* at that instant, not about the slot: a slot with nothing
 * booked against it is available, and there is no row to hold that state. So the
 * status is computed from whatever session exists, which means it cannot drift
 * from the sessions table the way a materialised copy would.
 */
export type SlotStatus = "AVAILABLE" | "PENDING" | "BOOKED";

/** Instants that are already spoken for, and how. */
export type SlotOccupancy = Map<string, SlotStatus>;

export type BookableSlot = {
  /** The canonical value. Everything else here is presentation. */
  startUtc: string;
  /** What the mentor's own calendar reads, with the zone named. */
  mentorLabel: string;
  /** What the seeker's calendar reads, with the zone named. */
  viewerLabel: string;
  /** True when both parties are in the same zone, so one label will do. */
  sameZone: boolean;
  status: SlotStatus;
};

export const SLOT_HORIZON_DAYS = 28;
/**
 * How many slots a picker shows. Presentation only — validation runs
 * uncapped, so a mentor with wide availability does not find most of it
 * unbookable because the list had to be trimmed for a dropdown.
 */
const DEFAULT_SLOT_LIMIT = 60;

/**
 * Concrete slots over the next `horizonDays`, soonest first.
 *
 * Walks forward one day at a time in the *mentor's* zone, because that is the
 * calendar the weekday numbers refer to. A seeker in Dubai asking about a
 * Kolkata mentor's Monday gets that mentor's Monday, not their own.
 */
/** YYYY-MM-DD for a set of zoned parts, matching how exceptions are stored. */
function dateKey(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** ISO week key, for the per-week cap. */
function weekKey(instant: Date, timeZone: string): string {
  // Monday-anchored: shift so Monday is 0, then step back to it.
  const parts = zonedParts(instant, timeZone);
  const dayOfWeek = (parts.weekday + 6) % 7;
  const monday = new Date(instant.getTime() - dayOfWeek * 86_400_000);
  return dateKey(zonedParts(monday, timeZone));
}

/**
 * Whether a window on one date survives the exceptions for that date.
 *
 * Returns the minute ranges that remain. An UNAVAILABLE exception covering the
 * whole day removes everything; a partial one carves a hole, which can split one
 * window into two.
 */
function applyExceptions(
  window: { startMinute: number; endMinute: number },
  exceptions: AvailabilityException[],
): { startMinute: number; endMinute: number }[] {
  let ranges = [{ ...window }];

  for (const exception of exceptions) {
    if (exception.kind !== "UNAVAILABLE") continue;

    // Whole day off.
    if (exception.startMinute == null || exception.endMinute == null) return [];

    const next: typeof ranges = [];
    for (const range of ranges) {
      // No overlap: keep it as-is.
      if (exception.endMinute <= range.startMinute || exception.startMinute >= range.endMinute) {
        next.push(range);
        continue;
      }
      // Overlap: keep whatever falls outside the blocked minutes. Both halves
      // can survive, which is why this returns a list rather than one range.
      if (exception.startMinute > range.startMinute) {
        next.push({ startMinute: range.startMinute, endMinute: exception.startMinute });
      }
      if (exception.endMinute < range.endMinute) {
        next.push({ startMinute: exception.endMinute, endMinute: range.endMinute });
      }
    }
    ranges = next;
    if (ranges.length === 0) return [];
  }

  return ranges;
}

export function generateSlots(input: {
  availability: AvailabilityWindow[];
  sessionMinutes: number;
  viewerZone: string;
  now?: Date;
  horizonDays?: number;
  /** Instants already taken, as ISO strings, so they are not offered twice. */
  taken?: Iterable<string>;
  /**
   * Instants already taken *with their status*, so the picker can show a slot as
   * pending rather than simply omitting it. Supersedes `taken` when given.
   */
  occupancy?: SlotOccupancy;
  /** Departures from the weekly pattern. */
  exceptions?: AvailabilityException[];
  /** Gap after each session before the next may start. */
  bufferMinutes?: number;
  /** Zero or undefined means no cap. */
  maxPerDay?: number;
  maxPerWeek?: number;
  /** Cap on returned slots. Pass Infinity when validating rather than showing. */
  limit?: number;
}): BookableSlot[] {
  const now = input.now ?? new Date();
  const horizon = input.horizonDays ?? SLOT_HORIZON_DAYS;
  const occupancy: SlotOccupancy = input.occupancy ?? new Map();
  for (const iso of input.taken ?? []) {
    if (!occupancy.has(iso)) occupancy.set(iso, "BOOKED");
  }
  const limit = input.limit ?? DEFAULT_SLOT_LIMIT;
  const step = input.sessionMinutes + Math.max(0, input.bufferMinutes ?? 0);
  const slots: BookableSlot[] = [];
  const seen = new Set<string>();

  if (input.availability.length === 0 || input.sessionMinutes <= 0) return slots;

  // Exceptions indexed by date, so a 28-day walk does not rescan the list daily.
  const exceptionsByDate = new Map<string, AvailabilityException[]>();
  for (const exception of input.exceptions ?? []) {
    const list = exceptionsByDate.get(exception.onDate) ?? [];
    list.push(exception);
    exceptionsByDate.set(exception.onDate, list);
  }

  /*
   * Caps count what is *already booked*, not what is offered.
   *
   * A mentor who allows three sessions a day and has two booked should be
   * offered every remaining slot for that day, not one — the cap limits how many
   * they end up doing, and pre-emptively hiding slots would leave the third one
   * unbookable if the seeker picked the "wrong" time.
   */
  const bookedPerDay = new Map<string, number>();
  const bookedPerWeek = new Map<string, number>();
  const primaryZone = input.availability[0]?.timezone ?? "UTC";
  for (const [iso, status] of occupancy) {
    if (status === "AVAILABLE") continue;
    const instant = new Date(iso);
    const day = dateKey(zonedParts(instant, primaryZone));
    bookedPerDay.set(day, (bookedPerDay.get(day) ?? 0) + 1);
    const week = weekKey(instant, primaryZone);
    bookedPerWeek.set(week, (bookedPerWeek.get(week) ?? 0) + 1);
  }

  for (let dayOffset = 0; dayOffset <= horizon && slots.length < limit; dayOffset += 1) {
    // Step in whole days from the current instant, then read the calendar date
    // in each rule's own zone — two mentors with different zones can share a
    // generator run without one of them being shifted.
    const cursor = new Date(now.getTime() + dayOffset * 86_400_000);

    for (const window of input.availability) {
      const wall = zonedParts(cursor, window.timezone);
      const date = dateKey(wall);
      const dayExceptions = exceptionsByDate.get(date) ?? [];

      // The weekly pattern applies unless an EXTRA window covers this exact
      // date, which is how a one-off Sunday morning becomes bookable.
      const extras = dayExceptions.filter(
        (e) => e.kind === "EXTRA" && e.startMinute != null && e.endMinute != null,
      );
      const baseRanges: { startMinute: number; endMinute: number }[] = [];
      if (wall.weekday === window.weekday) {
        baseRanges.push({ startMinute: window.startMinute, endMinute: window.endMinute });
      }
      // Extras are attached to the first window's zone, so they are added once
      // per date rather than once per weekly rule.
      if (window === input.availability[0]) {
        for (const extra of extras) {
          baseRanges.push({ startMinute: extra.startMinute!, endMinute: extra.endMinute! });
        }
      }
      if (baseRanges.length === 0) continue;

      for (const base of baseRanges) {
        for (const range of applyExceptions(base, dayExceptions)) {
          for (
            let minute = range.startMinute;
            minute + input.sessionMinutes <= range.endMinute;
            minute += step
          ) {
            const target = {
              year: wall.year,
              month: wall.month,
              day: wall.day,
              minuteOfDay: minute,
            };

            // A clock time inside a spring-forward gap is not a time. Offering it
            // would book a session for an instant that does not exist.
            if (!zonedTimeExists(target, window.timezone)) continue;

            const startUtc = zonedTimeToUtc(target, window.timezone);
            const iso = startUtc.toISOString();

            if (startUtc.getTime() <= now.getTime()) continue;
            if (seen.has(iso)) continue;

            const status = occupancy.get(iso);
            if (status === "BOOKED") continue;

            // Caps: a day or week already at its limit offers nothing further.
            if (input.maxPerDay && (bookedPerDay.get(date) ?? 0) >= input.maxPerDay) continue;
            const week = weekKey(startUtc, primaryZone);
            if (input.maxPerWeek && (bookedPerWeek.get(week) ?? 0) >= input.maxPerWeek) continue;

            seen.add(iso);
            slots.push({
              startUtc: iso,
              mentorLabel: formatInZone(startUtc, window.timezone, { withDate: true }),
              viewerLabel: formatInZone(startUtc, input.viewerZone, { withDate: true }),
              sameZone: window.timezone === input.viewerZone,
              status: status === "PENDING" ? "PENDING" : "AVAILABLE",
            });
          }
        }
      }
    }
  }

  slots.sort((a, b) => a.startUtc.localeCompare(b.startUtc));
  return Number.isFinite(limit) ? slots.slice(0, limit) : slots;
}

/**
 * Whether an instant is one this mentor is actually offering.
 *
 * Deliberately implemented against `generateSlots` rather than by re-deriving
 * the arithmetic: a second implementation is a second chance to be wrong about
 * timezones, and this is the check that decides whether a booking is accepted.
 */
export function isOfferedSlot(input: {
  availability: AvailabilityWindow[];
  sessionMinutes: number;
  requested: Date;
  now?: Date;
  horizonDays?: number;
  exceptions?: AvailabilityException[];
  bufferMinutes?: number;
  maxPerDay?: number;
  maxPerWeek?: number;
  occupancy?: SlotOccupancy;
}): boolean {
  const iso = input.requested.toISOString();
  return generateSlots({
    availability: input.availability,
    sessionMinutes: input.sessionMinutes,
    viewerZone: "UTC",
    now: input.now,
    horizonDays: input.horizonDays,
    exceptions: input.exceptions,
    bufferMinutes: input.bufferMinutes,
    maxPerDay: input.maxPerDay,
    maxPerWeek: input.maxPerWeek,
    occupancy: input.occupancy,
    // Uncapped: a slot is valid because the mentor offers it, not because it
    // was near enough the front of the list to be displayed.
    limit: Number.POSITIVE_INFINITY,
  }).some((slot) => slot.startUtc === iso && slot.status === "AVAILABLE");
}
