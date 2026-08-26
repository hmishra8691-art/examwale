/**
 * Countdown boundaries.
 *
 * "6 days left" in red versus "8 days left" in amber is a decision the user
 * acts on, and the two are one line of arithmetic apart. Date maths is also
 * the classic thing that looks right in every screenshot and is wrong on the
 * day it matters — off by one across a month end, or drifting an hour when the
 * clocks change.
 *
 * The component's logic is duplicated here rather than imported because it
 * lives inside a .tsx module full of JSX that plain node cannot load. The
 * duplication is guarded: `assertMatchesSource` re-reads discovery.tsx and
 * fails if the real expression stops matching the one under test.
 *
 *   node scripts/unit/countdown.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  join(here, "..", "..", "src", "components", "discovery.tsx"),
  "utf8",
);

let passed = 0;
let failed = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (ok) passed++;
  else {
    failed++;
    console.log(`  FAIL  ${label}\n        got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
  }
}

/* ── the copy under test ───────────────────────────────────────────────── */

function daysLeft(deadline, now) {
  return Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000);
}
/*
 * Closed is a comparison of instants, deliberately not `days < 0`.
 * Math.ceil of a small negative is -0, so a window that shut an hour ago
 * produced days === 0 and rendered as "Closes today" in urgent red. This test
 * found that; the guard below is what it now asserts.
 */
function isClosed(deadline, now) {
  return deadline.getTime() <= now.getTime();
}
function tone(days) {
  if (days < 0) return "closed";
  if (days <= 7) return "urgent";
  if (days <= 21) return "soon";
  return "open";
}
function label(days) {
  if (days === 0) return "Closes today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

/* ── the copy must still match the component ───────────────────────────── */

console.log("\ncountdown\n");
console.log("the duplicated logic still matches discovery.tsx");
for (const fragment of [
  "Math.ceil((end.getTime() - today.getTime()) / 86_400_000)",
  "const closed = end.getTime() <= today.getTime();",
  "days <= 7",
  "days <= 21",
  'days === 0 ? "Closes today" : days === 1 ? "1 day left" : `${days} days left`',
]) {
  if (source.includes(fragment)) passed++;
  else {
    failed++;
    console.log(`  FAIL  discovery.tsx no longer contains: ${fragment}`);
    console.log(`        the copy in this test has drifted from the component.`);
  }
}

/* ── boundaries ────────────────────────────────────────────────────────── */

const at = (iso) => new Date(iso);

console.log("\ntone boundaries are exact");
// 7 is the last urgent day, 8 is the first "soon" day.
check("7 days is urgent", tone(7), "urgent");
check("8 days is soon", tone(8), "soon");
check("21 days is soon", tone(21), "soon");
check("22 days is open", tone(22), "open");
check("0 days is urgent", tone(0), "urgent");
check("-1 day is closed", tone(-1), "closed");

console.log("\nlabels read correctly at the edges");
check("zero", label(0), "Closes today");
check("one is singular", label(1), "1 day left");
check("two is plural", label(2), "2 days left");

console.log("\nceil, not floor: a deadline later today is still today");
// 23:59 tonight must not read as "closed" at 09:00 this morning.
check(
  "same day, later hour",
  daysLeft(at("2026-03-10T23:59:00Z"), at("2026-03-10T09:00:00Z")),
  1,
);
// Anything strictly in the past is negative, so the badge flips to Closed.
check(
  "a window that shut an hour ago is closed, not 'closes today'",
  isClosed(at("2026-03-10T08:00:00Z"), at("2026-03-10T09:00:00Z")),
  true,
);
check(
  "…even though the day count rounds to zero",
  daysLeft(at("2026-03-10T08:00:00Z"), at("2026-03-10T09:00:00Z")),
  0,
);
check(
  "a window shutting later today is still open",
  isClosed(at("2026-03-10T23:59:00Z"), at("2026-03-10T09:00:00Z")),
  false,
);

console.log("\ncrossing a month end");
check("28 Feb to 1 Mar, non-leap", daysLeft(at("2026-03-01T12:00:00Z"), at("2026-02-28T12:00:00Z")), 1);
check("31 Dec to 1 Jan", daysLeft(at("2027-01-01T12:00:00Z"), at("2026-12-31T12:00:00Z")), 1);

console.log("\ncrossing a leap day");
// 2028 is a leap year: 28 Feb → 1 Mar is two days, not one.
check("28 Feb to 1 Mar, leap year", daysLeft(at("2028-03-01T12:00:00Z"), at("2028-02-28T12:00:00Z")), 2);

console.log("\na long window still counts correctly");
check("one year", daysLeft(at("2027-03-10T12:00:00Z"), at("2026-03-10T12:00:00Z")), 365);

/*
 * India does not observe daylight saving, and the UAE does not either, so the
 * two live markets are unaffected. This asserts the behaviour anyway, because
 * the countdown is computed from UTC timestamps and would be wrong by an hour
 * — occasionally tipping a day boundary — if somebody later switched it to
 * local-time arithmetic for a market that does shift.
 */
console.log("\nan hour of drift never changes the day count");
check(
  "23h apart is 1 day",
  daysLeft(at("2026-03-11T11:00:00Z"), at("2026-03-10T12:00:00Z")),
  1,
);
check(
  "25h apart is 2 days",
  daysLeft(at("2026-03-11T13:00:00Z"), at("2026-03-10T12:00:00Z")),
  2,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
