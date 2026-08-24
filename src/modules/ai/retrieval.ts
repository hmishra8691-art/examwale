/**
 * Retrieval-augmented generation.
 *
 * Retrieval runs BEFORE generation and the results are injected as ground
 * truth. The model is never the source of a fact the database already holds —
 * that rule is the whole reason this file exists.
 *
 * Ranking uses Postgres full-text search, which needs no embedding provider and
 * no vector index to work. When an embedding provider is configured the same
 * interface can rank by cosine distance instead; call sites don't change.
 */
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Citation } from "@/db/schema";
import { getCountryIso } from "@/modules/geo/service";

export type RetrievedChunk = {
  entityType: string;
  entitySlug: string;
  title: string;
  content: string;
  metadata: Record<string, unknown> | null;
  rank: number;
};

const STOPWORDS = new Set([
  "what","which","who","whom","how","why","when","where","should","could","would","can","do","does",
  "did","is","are","was","were","be","been","am","i","me","my","we","our","you","your","the","a","an",
  "and","or","but","if","then","than","that","this","these","those","of","in","on","for","to","with",
  "about","after","before","from","by","as","at","it","its","also","want","need","get","becoming",
  "become","tell","explain","please","help",
]);

export function extractTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9₹\s+#.-]/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((token) => token.length > 1 && !STOPWORDS.has(token))
    .slice(0, 12);
}

export async function retrieve(input: {
  query: string;
  countryIso?: string;
  entityTypes?: string[];
  limit?: number;
}): Promise<RetrievedChunk[]> {
  const terms = extractTerms(input.query);
  if (!terms.length) return [];

  const limit = input.limit ?? 6;
  const countryIso = input.countryIso ?? (await getCountryIso());
  // OR-joined so a multi-word question still matches records covering part of it.
  const tsQuery = terms.join(" | ");
  // Built with sql.join rather than `= ANY(${array})`: the template interpolates
  // a JS array as separate placeholders, which Postgres rejects as a non-array
  // right-hand side. Each value is still a bound parameter.
  const typeFilter = input.entityTypes?.length
    ? sql`AND entity_type IN (${sql.join(
        input.entityTypes.map((type) => sql`${type}`),
        sql`, `,
      )})`
    : sql``;

  const result = await db.execute<{
    entity_type: string;
    entity_slug: string;
    title: string;
    content: string;
    metadata: Record<string, unknown> | null;
    rank: number;
  }>(sql`
    SELECT entity_type, entity_slug, title, content, metadata,
           ts_rank(to_tsvector('english', title || ' ' || content),
                   to_tsquery('english', ${tsQuery})) AS rank
    FROM knowledge_chunks
    WHERE country_iso = ${countryIso}
      ${typeFilter}
      AND to_tsvector('english', title || ' ' || content) @@ to_tsquery('english', ${tsQuery})
    ORDER BY rank DESC
    LIMIT ${limit}
  `);

  return result.rows.map((row) => ({
    entityType: row.entity_type,
    entitySlug: row.entity_slug,
    title: row.title,
    content: row.content,
    metadata: row.metadata,
    rank: Number(row.rank),
  }));
}

const HREF_BY_TYPE: Record<string, string> = {
  career: "/careers",
  exam: "/exams",
  business: "/business",
  resource: "/careers",
  job: "/jobs",
};

export function toCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk) => ({
    label: chunk.title,
    kind: (chunk.entityType as Citation["kind"]) ?? "career",
    slug: chunk.entitySlug,
    sourceName: (chunk.metadata?.sourceName as string) ?? undefined,
    sourceUrl: (chunk.metadata?.sourceUrl as string) ?? undefined,
    lastVerifiedAt: (chunk.metadata?.lastVerifiedAt as string) ?? undefined,
  }));
}

export function citationHref(citation: Citation): string {
  const base = HREF_BY_TYPE[citation.kind] ?? "/search";
  return `${base}/${citation.slug}`;
}

/** Renders retrieved records into the block the system prompt wraps in <retrieved>. */
export function renderContext(chunks: RetrievedChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((chunk, index) => {
      const verified = chunk.metadata?.lastVerifiedAt
        ? ` (last verified ${String(chunk.metadata.lastVerifiedAt).slice(0, 10)})`
        : "";
      return `[${index + 1}] ${chunk.title} — /${chunk.entityType}s/${chunk.entitySlug}${verified}\n${chunk.content}`;
    })
    .join("\n\n");
}
