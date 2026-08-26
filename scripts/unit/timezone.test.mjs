/**
 * Unit tests for the timezone primitives and slot generation.
 *
 * Run with `npm run test:unit`. These are here rather than in the smoke suite
 * because they need no server and no database — they are pure functions, and
 * they are the functions that decide whether a mentor's published hours mean
 * what the mentor typed. The smoke suite checks the same behaviour through the
 * API; this checks the arithmetic directly, including cases a fixture cannot
 * easily reach (daylight-saving gaps, seven zones, a year of dates).
 *
 * Transpiled on the fly so there is no build step between editing a module and
 * running its tests.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "../../node_modules/typescript/lib/typescript.js";

const OUT = join(tmpdir(), "examwale-unit");
mkdirSync(OUT, { recursive: true });

function load(relativePath, name) {
  let code = ts.transpileModule(readFileSync(relativePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  code = code.replace('"@/modules/shared/timezone"', `"${join(OUT, "timezone.mjs")}"`);
  const target = join(OUT, name);
  writeFileSync(target, code);
  return import(target);
}

const tz = await load("src/modules/shared/timezone.ts", "timezone.mjs");
const { generateSlots, isOfferedSlot } = await load(
  "src/modules/mentors/slots.ts",
  "slots.mjs",
);

let pass = 0;
let fail = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want);
  if (ok) {
    pass += 1;
    process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
  } else {
    fail += 1;
    process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n        got  ${got}\n        want ${want}\n`);
  }
};

console.log("\n── timezone primitives ──────────────────────────────────────────");
// 1. zonedParts must read the MENTOR's clock, not the process clock.
// 2026-08-25T04:30:00Z is 10:00 on Tuesday in Kolkata (+5:30).
const i = new Date('2026-08-25T04:30:00Z');
const k = tz.zonedParts(i, 'Asia/Kolkata');
t('Kolkata weekday (Tue=2)', k.weekday, 2);
t('Kolkata minuteOfDay (10:00=600)', k.minuteOfDay, 600);
const u = tz.zonedParts(i, 'UTC');
t('same instant in UTC is 04:30 (=270)', u.minuteOfDay, 270);
t('offset difference is 330 min', k.minuteOfDay - u.minuteOfDay, 330);

// The day can differ too: 19:00 UTC Monday is Tuesday 00:30 in Kolkata.
const cross = new Date('2026-08-24T19:00:00Z');
t('cross-midnight weekday rolls forward', tz.zonedParts(cross,'Asia/Kolkata').weekday, 2);
t('  ...and is Monday in UTC', tz.zonedParts(cross,'UTC').weekday, 1);

// 3. Round-trip: wall clock -> UTC -> wall clock must be identity.
for (const zone of ['Asia/Kolkata','Asia/Dubai','UTC','America/New_York','Europe/London','Australia/Adelaide','Asia/Kathmandu']) {
  for (const [m,d,mod] of [[1,15,540],[6,21,0],[8,25,600],[11,3,1439],[3,29,150]]) {
    const inst = tz.zonedTimeToUtc({year:2026,month:m,day:d,minuteOfDay:mod}, zone);
    const back = tz.zonedParts(inst, zone);
    const ok = back.minuteOfDay===mod && back.day===d && back.month===m;
    ok?pass++:fail++;
    if(!ok) console.log(`FAIL  round-trip ${zone} ${m}/${d} ${mod} -> got ${back.month}/${back.day} ${back.minuteOfDay}`);
  }
}
console.log(`  ok  round-trips across 7 zones x 5 dates`);

// 4. DST: New York spring-forward 8 Mar 2026 02:00-03:00 does not exist.
t('skipped hour reported as nonexistent', tz.zonedTimeExists({year:2026,month:3,day:8,minuteOfDay:150},'America/New_York'), false);
t('the hour before it exists', tz.zonedTimeExists({year:2026,month:3,day:8,minuteOfDay:90},'America/New_York'), true);
t('the hour after it exists', tz.zonedTimeExists({year:2026,month:3,day:8,minuteOfDay:210},'America/New_York'), true);
t('autumn fold exists (resolves to one of the two)', tz.zonedTimeExists({year:2026,month:11,day:1,minuteOfDay:90},'America/New_York'), true);
t('a normal time in a no-DST zone exists', tz.zonedTimeExists({year:2026,month:3,day:8,minuteOfDay:150},'Asia/Kolkata'), true);

// 5. DST offsets differ across the year in a DST zone.
t('NY offset in January', tz.offsetMinutes(new Date('2026-01-15T12:00:00Z'),'America/New_York'), -300);
t('NY offset in July', tz.offsetMinutes(new Date('2026-07-15T12:00:00Z'),'America/New_York'), -240);
t('Kolkata never shifts (Jan)', tz.offsetMinutes(new Date('2026-01-15T12:00:00Z'),'Asia/Kolkata'), 330);
t('Kolkata never shifts (Jul)', tz.offsetMinutes(new Date('2026-07-15T12:00:00Z'),'Asia/Kolkata'), 330);

// 6. Labels must name the zone.
const lab = tz.formatInZone(i,'Asia/Kolkata',{withDate:true});
console.log(`  --  label: "${lab}"`);
t('label carries a zone name', /IST|GMT\+5/.test(lab), 'true');
t('Dubai label differs from Kolkata', tz.formatInZone(i,'Asia/Dubai')!==tz.formatInZone(i,'Asia/Kolkata'), 'true');

// 7. Validation + viewer resolution.
t('rejects nonsense zone', tz.isValidTimeZone('Mars/Olympus'), false);
t('accepts real zone', tz.isValidTimeZone('Asia/Dubai'), true);
t('viewer zone from country', tz.resolveViewerZone(null,'AE'), 'Asia/Dubai');
t('stored preference wins', tz.resolveViewerZone('Europe/London','AE'), 'Europe/London');
t('nonsense preference ignored', tz.resolveViewerZone('Mars/Olympus','IN'), 'Asia/Kolkata');
t('unknown country -> UTC', tz.resolveViewerZone(null,'ZZ'), 'UTC');


console.log("\n── slot generation ──────────────────────────────────────────────");
// A Kolkata mentor offers Tuesdays 10:00-13:00 IST, 30-minute sessions.
const avail = [{ weekday:2, startMinute:600, endMinute:780, timezone:'Asia/Kolkata' }];
// "Now" is a Monday, and the server clock is UTC — the situation that broke.
const now = new Date('2026-08-24T12:00:00Z');

const slots = generateSlots({ availability:avail, sessionMinutes:30, viewerZone:'Asia/Dubai', now });
t('six 30-min slots in a 3-hour window', slots.length % 6, 0);
t('first slot is 10:00 IST', /10:00/.test(slots[0].mentorLabel), 'true');
t('first slot is 04:30 UTC', slots[0].startUtc, '2026-08-25T04:30:00.000Z');
t('last slot of the day starts 12:30 IST, not 13:00', /12:30/.test(slots[5].mentorLabel), 'true');
console.log(`  --  mentor sees: ${slots[0].mentorLabel}`);
console.log(`  --  Dubai seeker sees: ${slots[0].viewerLabel}`);
t('labels differ across zones', slots[0].mentorLabel !== slots[0].viewerLabel, 'true');
t('sameZone flag false for Dubai viewer', slots[0].sameZone, false);
t('Dubai label reads 08:30 (IST+5:30 - GST+4:00 = 90min)', /08:30/.test(slots[0].viewerLabel), 'true');

// THE ORIGINAL BUG: the old code did scheduledAt.getHours() on a UTC server.
// 04:30 UTC is 10:00 IST and inside availability; the old check saw 270 minutes
// (04:30) against a 600-780 window and refused it.
t('REGRESSION: 10:00 IST is accepted', isOfferedSlot({availability:avail,sessionMinutes:30,requested:new Date('2026-08-25T04:30:00.000Z'),now}), true);
// And the converse: 10:00 UTC is 15:30 IST, outside the window, but the old
// code saw 600 minutes and accepted it.
t('REGRESSION: 15:30 IST is refused', isOfferedSlot({availability:avail,sessionMinutes:30,requested:new Date('2026-08-25T10:00:00.000Z'),now}), false);

// Off-grid times inside the window must still be refused.
t('10:07 IST refused (not on the grid)', isOfferedSlot({availability:avail,sessionMinutes:30,requested:new Date('2026-08-25T04:37:00.000Z'),now}), false);
// Wrong weekday.
t('same clock time on Wednesday refused', isOfferedSlot({availability:avail,sessionMinutes:30,requested:new Date('2026-08-26T04:30:00.000Z'),now}), false);
// Past.
t('a slot in the past is not offered', slots.every(s=>new Date(s.startUtc)>now), true);

// Taken slots drop out of the offer.
const withTaken = generateSlots({availability:avail,sessionMinutes:30,viewerZone:'Asia/Kolkata',now,taken:['2026-08-25T04:30:00.000Z']});
t('a taken slot is not offered', withTaken.some(s=>s.startUtc==='2026-08-25T04:30:00.000Z'), false);
t('sameZone true when zones match', withTaken[0].sameZone, true);

// A mentor in a DST zone across the spring-forward boundary.
const ny = [{ weekday:0, startMinute:60, endMinute:240, timezone:'America/New_York' }];
const beforeDst = new Date('2026-03-02T12:00:00Z');
const nySlots = generateSlots({availability:ny,sessionMinutes:60,viewerZone:'UTC',now:beforeDst,horizonDays:7});
const onGapDay = nySlots.filter(s=>s.startUtc.startsWith('2026-03-08'));
console.log(`  --  8 Mar (spring forward) offers: ${onGapDay.map(s=>s.mentorLabel).join(' | ') || 'nothing'}`);
t('the nonexistent 02:00 hour is not offered', onGapDay.some(s=>/02:00/.test(s.mentorLabel)), false);
t('01:00 and 03:00 still offered on the gap day', onGapDay.length, 2);

// Two mentors in different zones generated together must not shift each other.
const mixed = [
  { weekday:2, startMinute:600, endMinute:660, timezone:'Asia/Kolkata' },
  { weekday:2, startMinute:600, endMinute:660, timezone:'Asia/Dubai' },
];
const mixedSlots = generateSlots({availability:mixed,sessionMinutes:60,viewerZone:'UTC',now});
t('same wall time in two zones = two distinct instants', new Set(mixedSlots.map(s=>s.startUtc)).size >= 2, true);

// Empty availability offers nothing rather than throwing.
t('no availability -> no slots', generateSlots({availability:[],sessionMinutes:30,viewerZone:'UTC',now}).length, 0);


console.log("\n── availability exceptions, buffers and caps ────────────────────");

// Tuesdays 10:00-13:00 IST, 30-minute sessions, from a Monday.
const AV = [{ weekday:2, startMinute:600, endMinute:780, timezone:'Asia/Kolkata' }];
const MON = new Date('2026-08-24T12:00:00Z');
const gen = (extra={}) => generateSlots({ availability:AV, sessionMinutes:30, viewerZone:'Asia/Kolkata', now:MON, ...extra });

t('baseline: 6 slots on the first Tuesday', gen({horizonDays:2}).length, 6);

// A whole day blocked removes every slot on it.
t('a whole-day block removes that Tuesday',
  gen({horizonDays:2, exceptions:[{kind:'UNAVAILABLE',onDate:'2026-08-25',startMinute:null,endMinute:null}]}).length, 0);

// A partial block carves a hole and can split one window in two.
const carved = gen({horizonDays:2, exceptions:[{kind:'UNAVAILABLE',onDate:'2026-08-25',startMinute:660,endMinute:720}]});
t('a midday block leaves the ends', carved.length, 4);
t('  ...and removes exactly the blocked hour',
  carved.some(s=>/11:00|11:30/.test(s.mentorLabel)), false);
t('  ...while keeping 10:00', carved.some(s=>/10:00/.test(s.mentorLabel)), true);
t('  ...and keeping 12:00', carved.some(s=>/12:00/.test(s.mentorLabel)), true);

// A block that only clips the start.
t('a block over the first hour leaves 4',
  gen({horizonDays:2, exceptions:[{kind:'UNAVAILABLE',onDate:'2026-08-25',startMinute:600,endMinute:660}]}).length, 4);

// An EXTRA window opens a day the weekly pattern does not cover.
const extra = gen({horizonDays:3, exceptions:[{kind:'EXTRA',onDate:'2026-08-26',startMinute:540,endMinute:600}]});
t('an EXTRA window opens a Wednesday', extra.some(s=>/26 Aug/.test(s.mentorLabel)), true);
t('  ...for exactly its length (2 slots)', extra.filter(s=>/26 Aug/.test(s.mentorLabel)).length, 2);

// UNAVAILABLE must beat EXTRA on the same date, whichever order they arrive in.
for (const order of [['UNAVAILABLE','EXTRA'],['EXTRA','UNAVAILABLE']]) {
  const ex = order.map(kind => kind==='EXTRA'
    ? {kind:'EXTRA',onDate:'2026-08-25',startMinute:540,endMinute:600}
    : {kind:'UNAVAILABLE',onDate:'2026-08-25',startMinute:null,endMinute:null});
  t(`UNAVAILABLE beats EXTRA (${order.join(' then ')})`,
    gen({horizonDays:2, exceptions:ex}).filter(s=>/25 Aug/.test(s.mentorLabel)).length, 0);
}

// Buffer widens the step without changing session length.
t('a 30-minute buffer halves the slots', gen({horizonDays:2, bufferMinutes:30}).length, 3);
t('  ...starting at 10:00, 11:00, 12:00',
  gen({horizonDays:2, bufferMinutes:30}).map(s=>s.mentorLabel.match(/\d\d:\d\d/)[0]).join(','), '10:00,11:00,12:00');
t('a 15-minute buffer gives 4', gen({horizonDays:2, bufferMinutes:15}).length, 4);

// Caps count what is booked, not what is offered.
const twoBooked = new Map([
  ['2026-08-25T04:30:00.000Z','BOOKED'],
  ['2026-08-25T05:00:00.000Z','BOOKED'],
]);
t('no cap: the rest of the day is still offered',
  gen({horizonDays:2, occupancy:new Map(twoBooked)}).length, 4);
t('maxPerDay=2 with 2 booked offers nothing more that day',
  gen({horizonDays:2, occupancy:new Map(twoBooked), maxPerDay:2}).length, 0);
t('maxPerDay=3 with 2 booked still offers the rest',
  gen({horizonDays:2, occupancy:new Map(twoBooked), maxPerDay:3}).length, 4);
t('maxPerWeek=2 with 2 booked closes the week',
  gen({horizonDays:2, occupancy:new Map(twoBooked), maxPerWeek:2}).length, 0);
// The following week must be unaffected by this week's cap.
t('  ...but not the following week',
  gen({horizonDays:9, occupancy:new Map(twoBooked), maxPerWeek:2}).some(s=>/1 Sep/.test(s.mentorLabel)), true);

// A held slot is shown as pending rather than hidden, so a seeker can see it is
// being taken rather than wondering why it vanished.
const pending = gen({horizonDays:2, occupancy:new Map([['2026-08-25T04:30:00.000Z','PENDING']])});
t('a held slot is still listed', pending.length, 6);
t('  ...marked PENDING', pending.find(s=>s.startUtc==='2026-08-25T04:30:00.000Z').status, 'PENDING');
t('  ...and the rest are AVAILABLE', pending.filter(s=>s.status==='AVAILABLE').length, 5);
// But a pending slot must not be bookable.
t('a PENDING slot is not offered for booking',
  isOfferedSlot({availability:AV,sessionMinutes:30,requested:new Date('2026-08-25T04:30:00.000Z'),now:MON,
    occupancy:new Map([['2026-08-25T04:30:00.000Z','PENDING']])}), false);
t('  ...while a free one is',
  isOfferedSlot({availability:AV,sessionMinutes:30,requested:new Date('2026-08-25T05:00:00.000Z'),now:MON}), true);

// Validation must apply the same exceptions and buffer as the offer.
t('a blocked instant is not offered',
  isOfferedSlot({availability:AV,sessionMinutes:30,requested:new Date('2026-08-25T04:30:00.000Z'),now:MON,
    exceptions:[{kind:'UNAVAILABLE',onDate:'2026-08-25',startMinute:null,endMinute:null}]}), false);
t('an off-buffer-grid instant is not offered',
  isOfferedSlot({availability:AV,sessionMinutes:30,requested:new Date('2026-08-25T05:00:00.000Z'),now:MON,
    bufferMinutes:30}), false);
t('  ...while the on-grid one after it is',
  isOfferedSlot({availability:AV,sessionMinutes:30,requested:new Date('2026-08-25T05:30:00.000Z'),now:MON,
    bufferMinutes:30}), true);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
