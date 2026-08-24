/**
 * Universal search across careers, exams and jobs.
 *
 * Two things happen on every query. First, a natural-language pass pulls out
 * structured intent — "government jobs for a 25-year-old commerce graduate"
 * carries an age, a category and a stream, and a search that ignores those is
 * just a keyword match pretending to be understanding. Second, the extracted
 * filters are applied to a normal ranked search.
 *
 * No model involved: this is deterministic, instant and free, which is what a
 * search box needs to be.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getCountryIso } from "@/modules/geo/service";

export type SearchIntent = {
  age?: number;
  category?: string;
  stream?: string;
  wantsGovernment: boolean;
  wantsRemote: boolean;
  wantsBusiness: boolean;
  budget?: number;
  experienceYears?: number;
  cleanedQuery: string;
};

const STREAM_WORDS: Record<string, string> = {
  commerce: "commerce",
  "b.com": "commerce",
  bcom: "commerce",
  science: "science",
  pcm: "science",
  pcb: "science",
  arts: "arts",
  humanities: "arts",
  engineering: "engineering",
  "b.tech": "engineering",
  btech: "engineering",
  medical: "medical",
};

export function parseIntent(query: string): SearchIntent {
  const text = query.toLowerCase();

  const age = (() => {
    const explicit = text.match(/\b(\d{2})[\s-]*(?:year|yr)s?[\s-]*old\b/);
    if (explicit) return Number(explicit[1]);
    const aged = text.match(/\bage(?:d)?\s*(\d{2})\b/);
    if (aged) return Number(aged[1]);
    const iAm = text.match(/\bi am (\d{2})\b/);
    if (iAm) return Number(iAm[1]);
    return undefined;
  })();

  const budget = (() => {
    const lakh = text.match(/₹?\s?(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|l)\b/);
    if (lakh) return Math.round(Number(lakh[1]) * 100_000);
    const thousand = text.match(/₹?\s?(\d+(?:\.\d+)?)\s*(?:thousand|k)\b/);
    if (thousand) return Math.round(Number(thousand[1]) * 1_000);
    const plain = text.match(/₹\s?([\d,]{4,9})\b/);
    if (plain) return Number(plain[1].replace(/,/g, ""));
    return undefined;
  })();

  const experienceYears = (() => {
    const match = text.match(/\b(\d{1,2})\s*(?:\+)?\s*(?:years?|yrs?)\s*(?:of\s*)?experience\b/);
    return match ? Number(match[1]) : undefined;
  })();

  const stream = Object.entries(STREAM_WORDS).find(([word]) =>
    new RegExp(`(^|[^a-z])${word.replace(/\./g, "\\.")}([^a-z]|$)`).test(text),
  )?.[1];

  const category = (() => {
    if (/\b(upsc|ias|ips|civil services)\b/.test(text)) return "civil-services";
    if (/\b(ssc|cgl|chsl)\b/.test(text)) return "ssc";
    if (/\b(bank|ibps|sbi|rbi)\b/.test(text)) return "banking";
    if (/\b(railway|rrb|ntpc)\b/.test(text)) return "railways";
    if (/\b(defence|army|navy|air force|nda|cds)\b/.test(text)) return "defence";
    if (/\b(teach|tet|ctet|professor)\b/.test(text)) return "teaching";
    if (/\b(police|constable|si\b)/.test(text)) return "police";
    return undefined;
  })();

  const noise = [
    /\b\d{2}[\s-]*(?:year|yr)s?[\s-]*old\b/g,
    /\bi am \d{2}\b/g,
    /\bfor a\b/g,
    /\bwith a\b/g,
    /\bwhat\b/g,
    /\bwhich\b/g,
    /\bcan i\b/g,
    /\bshould i\b/g,
  ];
  let cleaned = text;
  for (const pattern of noise) cleaned = cleaned.replace(pattern, " ");

  return {
    age,
    category,
    stream,
    budget,
    experienceYears,
    wantsGovernment: /\b(government|govt|sarkari|public sector|psu)\b/.test(text),
    wantsRemote: /\b(remote|work from home|wfh)\b/.test(text),
    wantsBusiness: /\b(business|startup|self[- ]employ|entrepreneur|shop)\b/.test(text),
    cleanedQuery: cleaned.replace(/\s+/g, " ").trim(),
  };
}

export type SearchHit = {
  kind: "career" | "exam" | "job" | "business";
  slug: string;
  title: string;
  subtitle: string;
  meta: string;
  rank: number;
};

export async function universalSearch(input: {
  query: string;
  countryIso?: string;
  limit?: number;
}): Promise<{ intent: SearchIntent; hits: SearchHit[] }> {
  const intent = parseIntent(input.query);
  const limit = input.limit ?? 20;
  const countryIso = input.countryIso ?? (await getCountryIso());

  const terms = intent.cleanedQuery
    .replace(/[^a-z0-9\s.+#-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .slice(0, 8);

  if (!terms.length && !intent.category && !intent.wantsGovernment) {
    return { intent, hits: [] };
  }

  const pattern = terms.length ? `%${terms.join("%")}%` : "%";
  const tsQuery = terms.length ? terms.join(" | ") : null;

  const [careerRows, examRows, jobRows, businessRows] = await Promise.all([
    db.execute<{ slug: string; title: string; subtitle: string; meta: string; rank: number }>(sql`
      SELECT cp.slug,
             o.name AS title,
             LEFT(cp.summary, 160) AS subtitle,
             og.name AS meta,
             GREATEST(
               CASE WHEN lower(o.name) LIKE ${pattern} THEN 1.0 ELSE 0 END,
               ${tsQuery ? sql`ts_rank(to_tsvector('english', o.name || ' ' || cp.summary), to_tsquery('english', ${tsQuery}))` : sql`0`},
               -- Floor for rows the LIKE matched: a partial token can match the
               -- WHERE clause while scoring zero on ts_rank, and dropping those
               -- tells the user "no results" for a query that did match.
               0.05
             ) AS rank
      FROM career_profiles cp
      JOIN occupations o ON o.id = cp.occupation_id
      JOIN occupation_groups og ON og.id = o.group_id
      JOIN countries c ON c.id = cp.country_id
      WHERE cp.status = 'PUBLISHED' AND c.iso_code = ${countryIso}
        AND (lower(o.name) LIKE ${pattern} OR lower(cp.summary) LIKE ${pattern} OR lower(og.name) LIKE ${pattern})
      ORDER BY rank DESC
      LIMIT ${limit}
    `),

    db.execute<{ slug: string; title: string; subtitle: string; meta: string; rank: number }>(sql`
      SELECT e.slug,
             e.name AS title,
             LEFT(e.description, 160) AS subtitle,
             go.short_name AS meta,
             CASE WHEN lower(e.short_name) LIKE ${pattern} THEN 1.0 ELSE 0.5 END AS rank
      FROM exams e
      JOIN gov_organisations go ON go.id = e.organisation_id
      JOIN countries c ON c.id = e.country_id
      WHERE e.status = 'PUBLISHED' AND c.iso_code = ${countryIso}
        AND (
          ${intent.category ? sql`e.category = ${intent.category}` : sql`FALSE`}
          OR lower(e.name) LIKE ${pattern}
          OR lower(e.short_name) LIKE ${pattern}
          OR lower(e.description) LIKE ${pattern}
          OR ${intent.wantsGovernment ? sql`TRUE` : sql`FALSE`}
        )
        ${intent.age ? sql`AND COALESCE((e.age_limit ->> 'max')::int, 999) >= ${intent.age} AND COALESCE((e.age_limit ->> 'min')::int, 0) <= ${intent.age}` : sql``}
      ORDER BY rank DESC
      LIMIT ${limit}
    `),

    db.execute<{ slug: string; title: string; subtitle: string; meta: string; rank: number }>(sql`
      SELECT j.slug,
             j.title,
             LEFT(j.description, 160) AS subtitle,
             co.name AS meta,
             0.6 AS rank
      FROM job_postings j
      JOIN companies co ON co.id = j.company_id
      JOIN countries c ON c.id = co.country_id
      WHERE j.status = 'ACTIVE' AND c.iso_code = ${countryIso}
        AND (lower(j.title) LIKE ${pattern} OR lower(co.name) LIKE ${pattern} OR lower(j.skills_required::text) LIKE ${pattern})
        ${intent.wantsRemote ? sql`AND j.remote_type = 'REMOTE'` : sql``}
      ORDER BY j.posted_at DESC
      LIMIT ${limit}
    `),

    intent.wantsBusiness
      ? db.execute<{ slug: string; title: string; subtitle: string; meta: string; rank: number }>(sql`
          SELECT b.slug, b.name AS title, LEFT(b.summary, 160) AS subtitle,
                 bc.name AS meta, 0.7 AS rank
          FROM business_model_templates b
          JOIN business_categories bc ON bc.id = b.category_id
          JOIN countries c ON c.id = b.country_id
          WHERE b.status = 'PUBLISHED' AND c.iso_code = ${countryIso}
            ${intent.budget ? sql`AND b.startup_cost_min <= ${intent.budget}` : sql``}
          ORDER BY b.startup_cost_min ASC
          LIMIT ${limit}
        `)
      : Promise.resolve({ rows: [] as never[] }),
  ]);

  const hits: SearchHit[] = [
    ...careerRows.rows.map((row) => ({ ...row, kind: "career" as const, rank: Number(row.rank) })),
    ...examRows.rows.map((row) => ({ ...row, kind: "exam" as const, rank: Number(row.rank) })),
    ...jobRows.rows.map((row) => ({ ...row, kind: "job" as const, rank: Number(row.rank) })),
    ...businessRows.rows.map((row) => ({ ...row, kind: "business" as const, rank: Number(row.rank) })),
  ]
    .filter((hit) => hit.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  return { intent, hits };
}

export function describeIntent(intent: SearchIntent): string[] {
  const parts: string[] = [];
  if (intent.age) parts.push(`age ${intent.age}`);
  if (intent.stream) parts.push(`${intent.stream} background`);
  if (intent.category) parts.push(intent.category.replace(/-/g, " "));
  if (intent.wantsGovernment) parts.push("government roles");
  if (intent.wantsRemote) parts.push("remote work");
  if (intent.budget) parts.push(`budget around ₹${intent.budget.toLocaleString("en-IN")}`);
  if (intent.experienceYears != null) parts.push(`${intent.experienceYears} years experience`);
  return parts;
}
