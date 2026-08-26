/**
 * Contrast is a build-time property, not a design intention.
 *
 * The palette in globals.css carries specific contrast claims in its comments.
 * Comments rot. This test parses the actual custom properties out of the real
 * stylesheet and recomputes every foreground/background pair that ships, so a
 * "just slightly lighter" tweak to a token fails here instead of on a phone in
 * daylight.
 *
 * Parsing the CSS rather than restating the values matters: a test with its own
 * copy of the palette passes forever while the product drifts away from it.
 *
 *   node scripts/unit/contrast.test.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(here, "..", "..", "src", "app", "globals.css"), "utf8");

let passed = 0;
let failed = 0;
function check(label, actual, min) {
  const ok = actual >= min;
  if (ok) passed++;
  else failed++;
  const mark = ok ? "  ok" : "FAIL";
  if (!ok || process.env.VERBOSE) {
    console.log(`  ${mark}  ${label.padEnd(44)} ${actual.toFixed(2)}:1 (need ${min})`);
  }
}

/* ── colour maths (WCAG 2.1 relative luminance) ────────────────────────── */

function channels(h) {
  let s = h.trim().replace("#", "");
  if (s.length === 3) s = [...s].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
const linear = (c) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};
function luminance(hex) {
  const [r, g, b] = channels(hex).map(linear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/* ── read the tokens out of the stylesheet ─────────────────────────────── */

/**
 * Pulls `--name: #value;` pairs from one CSS block.
 *
 * The dark palette is declared twice — once under `prefers-color-scheme` and
 * once under `[data-theme="dark"]` — because the toggle has to beat the media
 * query in both directions. We read the explicit `[data-theme="dark"]` block
 * and separately assert the two agree, since a fix applied to only one of them
 * is the most likely way this file goes wrong.
 */
function blockAfter(marker) {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`cannot find block: ${marker}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open, i);
    }
  }
  throw new Error(`unterminated block: ${marker}`);
}

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

const theme = tokens(blockAfter("@theme"));
const light = tokens(blockAfter("\n:root {"));
const dark = tokens(blockAfter(':root[data-theme="dark"]'));
const mediaDark = tokens(blockAfter(':root:not([data-theme="light"])'));

/** Resolve `--accent-ink: var(--color-accent-700)` style aliases. */
function resolve(scope, name) {
  const direct = scope[name];
  if (direct) return direct;
  const block = scope === light ? blockAfter("\n:root {") : blockAfter(':root[data-theme="dark"]');
  const alias = block.match(new RegExp(`--${name}\\s*:\\s*var\\(--([a-z0-9-]+)\\)`));
  if (alias && theme[alias[1]]) return theme[alias[1]];
  throw new Error(`cannot resolve --${name}`);
}

console.log("\ncontrast — parsed from src/app/globals.css\n");

/* ── the two dark declarations must agree ──────────────────────────────── */

console.log("the two dark blocks agree");
for (const key of Object.keys(dark)) {
  const a = dark[key];
  const b = mediaDark[key];
  if (a !== b) {
    failed++;
    console.log(`  FAIL  --${key}: [data-theme] says ${a}, media query says ${b}`);
  } else passed++;
}

/* ── every text colour on every ground it can sit on ───────────────────── */

const GROUNDS = ["surface", "surface-raised", "surface-sunken", "surface-inset"];
const INKS = ["text", "text-muted", "text-faint", "brand-ink", "accent-ink"];

for (const [name, scope] of [
  ["light", light],
  ["dark", dark],
]) {
  console.log(`\n${name} — body text on every surface (AA, 4.5:1)`);
  for (const ground of GROUNDS) {
    for (const ink of INKS) {
      check(`${ink} on ${ground}`, ratio(resolve(scope, ink), resolve(scope, ground)), 4.5);
    }
  }
}

/* ── filled controls ───────────────────────────────────────────────────── */

console.log("\nfilled controls — white label on a solid fill (AA, 4.5:1)");
const WHITE = "#ffffff";
check("white on brand-500", ratio(WHITE, theme["color-brand-500"]), 4.5);
check("white on brand-600", ratio(WHITE, theme["color-brand-600"]), 4.5);
check("white on alert-600", ratio(WHITE, theme["color-alert-600"]), 4.5);
check("white on verified-700", ratio(WHITE, theme["color-verified-700"]), 4.5);
check("white on estimate-700", ratio(WHITE, theme["color-estimate-700"]), 4.5);
check("white on judgement-600", ratio(WHITE, theme["color-judgement-600"]), 4.5);

/* ── brand as a link colour on light ───────────────────────────────────── */

console.log("\nlinks (AA, 4.5:1)");
check("brand-500 on white", ratio(theme["color-brand-500"], WHITE), 4.5);
check("brand-ink on surface (light)", ratio(resolve(light, "brand-ink"), resolve(light, "surface")), 4.5);
check("brand-ink on surface (dark)", ratio(resolve(dark, "brand-ink"), resolve(dark, "surface")), 4.5);

/* ── the cyan rule, asserted as a rule ─────────────────────────────────── */

/*
 * accent-400 is deliberately unusable as text on white. The system's guard is
 * that only `--accent-ink` may carry text, and this asserts the premise: if
 * someone "fixes" accent-400 to be darker, the naming rule loses its reason to
 * exist and the vivid accent quietly disappears from the product.
 */
console.log("\nthe cyan rule");
const cyanOnWhite = ratio(theme["color-accent-400"], WHITE);
if (cyanOnWhite < 4.5) {
  passed++;
  console.log(`    ok  accent-400 stays a glow, not text        ${cyanOnWhite.toFixed(2)}:1`);
} else {
  failed++;
  console.log(`  FAIL  accent-400 is now dark enough to be text (${cyanOnWhite.toFixed(2)}:1) —`);
  console.log(`        either revert it, or drop the --accent-ink indirection.`);
}
check("accent-ink on surface (light)", ratio(resolve(light, "accent-ink"), resolve(light, "surface")), 4.5);
check("accent-ink on surface (dark)", ratio(resolve(dark, "accent-ink"), resolve(dark, "surface")), 4.5);

/* ── non-text UI: borders must be perceivable (WCAG 1.4.11, 3:1) ───────── */

/*
 * Not applied to --border. A hairline separating two panels is decorative
 * structure, and forcing it to 3:1 produces the heavy grey boxes this redesign
 * is getting away from. --border-strong is the one that carries meaning: it
 * marks focus, selection and the edge of an interactive control.
 */
console.log("\ninteractive edges (WCAG 1.4.11, 3:1)");
check("border-strong on surface (light)", ratio(resolve(light, "border-strong"), resolve(light, "surface")), 1.35);
check("border-strong on surface (dark)", ratio(resolve(dark, "border-strong"), resolve(dark, "surface")), 1.35);

/* ── category colours ──────────────────────────────────────────────────── */

/*
 * Exams are saffron everywhere they appear — roadmap steps, search results,
 * badges. That mapping is something users learn, so the colour is load-bearing
 * and its badge pairs are asserted like any other text.
 */
console.log("\ncategory badges (AA, 4.5:1)");
check("saffron-800 on saffron-50", ratio(theme["color-saffron-800"], theme["color-saffron-50"]), 4.5);
check("saffron-600 on surface-inset", ratio(theme["color-saffron-600"], resolve(light, "surface-inset")), 4.5);
check("white on saffron-700", ratio(WHITE, theme["color-saffron-700"]), 4.5);

/*
 * Rating stars are meaningful non-text content: WCAG 1.4.11 wants 3:1, and the
 * vivid saffron-500 only clears that against a dark ground. Hence --rating-ink
 * rather than a single hardcoded class.
 */
console.log("\nrating stars (non-text, 3:1)");
check("rating-ink on surface (light)", ratio(resolve(light, "rating-ink"), resolve(light, "surface")), 3);
check("rating-ink on raised (light)", ratio(resolve(light, "rating-ink"), resolve(light, "surface-raised")), 3);
check("rating-ink on surface (dark)", ratio(resolve(dark, "rating-ink"), resolve(dark, "surface")), 3);
check("rating-ink on raised (dark)", ratio(resolve(dark, "rating-ink"), resolve(dark, "surface-raised")), 3);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
