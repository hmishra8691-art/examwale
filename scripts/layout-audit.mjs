/**
 * Layout audit — measured in a real browser, not asserted.
 *
 * Two questions, across every important route and a spread of viewports:
 *
 *   1. Does anything scroll sideways, and if so which element is too wide?
 *      `document.scrollingElement.scrollWidth > innerWidth` is the symptom;
 *      the culprit is found by walking the tree for boxes whose right edge
 *      passes the viewport. Reporting the culprit matters — the symptom alone
 *      sends you looking at the wrong element.
 *
 *   2. Does content begin at the same x on every page? The header logo is the
 *      reference: if a page's first heading does not share its left edge, the
 *      page has its own container and the eye sees the jump when navigating.
 *
 * Run against a built server: npm start, then node scripts/layout-audit.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";

const VIEWPORTS = [
  { w: 320, h: 720, name: "320  small phone" },
  { w: 375, h: 812, name: "375  phone" },
  { w: 414, h: 896, name: "414  large phone" },
  { w: 768, h: 1024, name: "768  tablet" },
  { w: 1024, h: 768, name: "1024 small laptop" },
  { w: 1280, h: 800, name: "1280 laptop" },
  { w: 1440, h: 900, name: "1440 desktop" },
  { w: 1920, h: 1080, name: "1920 wide" },
];

const PUBLIC = [
  "/", "/careers", "/exams", "/jobs", "/courses", "/mentors",
  "/pricing", "/pathways", "/guidance", "/search", "/business", "/services",
];
// The shells — where the sidebar/blank-space problems lived.
const PRIVATE = [
  "/dashboard", "/dashboard/saved", "/dashboard/profile", "/dashboard/notifications",
  "/admin", "/admin/careers", "/admin/countries", "/admin/users", "/admin/audit",
];

/*
 * Header controls, checked separately from document overflow.
 *
 * `overflow-x: clip` on the document means a header that is too wide does NOT
 * scroll — it silently swallows whatever sits past the right edge. Sign out
 * disappeared that way twice. So the header is measured on its own terms: every
 * link and button must lie fully inside the viewport.
 */
const HEADER_PROBE = `(() => {
  const row = document.querySelector("header > div");
  const vw = window.innerWidth;
  const clipped = [];
  for (const el of document.querySelectorAll("header a, header button")) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    if (b.left < -1 || b.right > vw + 1) {
      clipped.push((el.getAttribute("aria-label") || el.textContent.trim() || "?").slice(0, 24));
    }
  }
  return {
    clipped,
    over: row ? Math.max(0, row.scrollWidth - Math.round(row.getBoundingClientRect().width)) : 0,
  };
})()`;

/** Widest offender past the right edge, if any. */
const PROBE = `(() => {
  const de = document.scrollingElement;
  const vw = window.innerWidth;
  const over = de.scrollWidth - vw;
  let worst = null;
  if (over > 1) {
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const past = Math.round(r.right - vw);
      if (past > 1 && (!worst || past > worst.past)) {
        worst = {
          past,
          tag: el.tagName.toLowerCase(),
          cls: (typeof el.className === "string" ? el.className : "").slice(0, 90),
        };
      }
    }
  }
  // Reference edge: the header's brand link. Content edge: first heading in main.
  const brand = document.querySelector("header a[href='/']");
  const head = document.querySelector("main h1, main h2");
  return {
    over: Math.max(0, over),
    worst,
    brandX: brand ? Math.round(brand.getBoundingClientRect().left) : null,
    contentX: head ? Math.round(head.getBoundingClientRect().left) : null,
  };
})()`;

/*
 * The pinned Playwright build and the browser bundle on this machine can be a
 * revision apart, which makes the default headless-shell path miss. Point at
 * the chromium that is actually installed rather than downloading a second one.
 */
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
});
const ctx = await browser.newContext();

// Sign in so the shells, sidebars and the admin header icons are exercised.
const login = await ctx.request.post(`${BASE}/api/v1/auth/login`, {
  data: { email: "admin@examwale.test", password: "examwale-admin-2026" },
});
const signedIn = login.ok();
console.log(signedIn ? "signed in as admin\n" : `NOT signed in (${login.status()}) — public routes only\n`);

const routes = signedIn ? [...PUBLIC, ...PRIVATE] : PUBLIC;
const page = await ctx.newPage();

let overflows = 0;
let misaligned = 0;
let clippedHeaders = 0;
let checks = 0;
const drift = new Map(); // viewport -> set of content x positions

for (const vp of VIEWPORTS) {
  await page.setViewportSize({ width: vp.w, height: vp.h });
  const seen = new Map();
  const bad = [];

  for (const route of routes) {
    const res = await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    if (!res || res.status() >= 400) {
      bad.push(`${route} -> HTTP ${res ? res.status() : "?"}`);
      continue;
    }
    const r = await page.evaluate(PROBE);
    const h = await page.evaluate(HEADER_PROBE);
    checks++;

    if (h.clipped.length) {
      clippedHeaders++;
      bad.push(`${route} header cuts off: ${h.clipped.join(", ")}${h.over ? ` (row ${h.over}px over)` : ""}`);
    }

    if (r.over > 1) {
      overflows++;
      const w = r.worst;
      bad.push(
        `${route} scrolls ${r.over}px` +
          (w ? `  <- <${w.tag}> ${w.past}px past the edge  class="${w.cls}"` : ""),
      );
    }
    /*
     * Pages are compared within their own shell, not across shells. An admin
     * page's heading is legitimately inset by the sidebar; what must not vary
     * is where two pages of the *same* section begin, because that is the jump
     * you see when navigating. The shell key is the first path segment.
     */
    if (r.contentX != null) {
      const shell = route === "/" ? "public" : route.split("/")[1];
      const key = shell === "admin" || shell === "dashboard" || shell === "provider" ? shell : "public";
      if (!seen.has(key)) seen.set(key, new Map());
      const g = seen.get(key);
      if (!g.has(r.contentX)) g.set(r.contentX, []);
      g.get(r.contentX).push(route);
    }
  }

  drift.set(vp.name, seen);
  const split = [...seen.entries()].filter(([, g]) => g.size > 1);
  const aligned = split.length === 0;
  if (!aligned) misaligned++;

  const summary = [...seen.entries()]
    .map(([shell, g]) => `${shell} ${[...g.keys()].join("/")}px`)
    .join("  ");
  const mark = bad.length === 0 && aligned ? "ok  " : "FAIL";
  console.log(
    `${mark} ${vp.name.padEnd(20)} ${bad.length === 0 ? "no sideways scroll" : bad.length + " problem(s)"}   ${summary}`,
  );
  for (const line of bad) console.log(`       ${line}`);
  for (const [shell, g] of split) {
    console.log(`       ${shell} pages disagree on where content begins:`);
    for (const [x, rs] of g) console.log(`         x=${x}px  ${rs.join(" ")}`);
  }
}

await browser.close();

console.log(
  `\n${checks} page renders measured across ${VIEWPORTS.length} viewports` +
    `\n${overflows} with sideways scroll` +
    `\n${clippedHeaders} with a header control cut off` +
    `\n${misaligned} viewport(s) where pages of one section disagree on the left edge\n`,
);
process.exit(overflows || misaligned || clippedHeaders ? 1 : 0);
