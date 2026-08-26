/**
 * Applies the Drizzle schema to the database.
 *
 * Uses drizzle-kit push under the hood for the tables, then layers on the
 * extras Drizzle's schema DSL can't express: extensions, the full-text search
 * index used by the retrieval layer, and the optional pgvector column.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";

const reset = process.argv.includes("--reset");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString: url });

  console.log("• ensuring extensions");
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
  let hasVector = false;
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
    hasVector = true;
  } catch {
    console.log("  pgvector unavailable — retrieval will use the lexical index only");
  }

  if (reset) {
    console.log("• dropping public schema");
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    if (hasVector) await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  }

  await pool.end();

  console.log("• pushing schema");
  execFileSync("npx", ["drizzle-kit", "push", "--force"], {
    stdio: "inherit",
    env: process.env,
  });

  const pool2 = new Pool({ connectionString: url });

  /*
   * Index predicates drizzle-kit push does not diff.
   *
   * `push` compares columns and index membership but not a partial index's WHERE
   * clause, so narrowing one silently leaves the old definition in place. This
   * one matters: unconditional, it let a cancelled or declined session reserve
   * its slot forever, and the symptom looked exactly like a legitimate
   * double-booking conflict. Dropped and recreated explicitly.
   */
  console.log("• enforcing partial index predicates");
  await pool2.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE indexname = 'mentorship_slot_uq'
          AND indexdef NOT LIKE '%WHERE%'
      ) THEN
        DROP INDEX mentorship_slot_uq;
      END IF;
    END $$;
  `);
  await pool2.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS mentorship_slot_uq
      ON mentorship_sessions (mentor_id, scheduled_at)
      WHERE status IN ('HELD', 'REQUESTED', 'ACCEPTED');
  `);

  console.log("• creating search indexes");
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_fts_idx
      ON knowledge_chunks USING GIN (to_tsvector('english', title || ' ' || content));
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_trgm_idx
      ON knowledge_chunks USING GIN (content gin_trgm_ops);
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS career_profiles_fts_idx
      ON career_profiles USING GIN (to_tsvector('english', summary || ' ' || day_to_day));
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS exams_fts_idx
      ON exams USING GIN (to_tsvector('english', name || ' ' || short_name || ' ' || description));
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS messages_fts_idx
      ON messages USING GIN (to_tsvector('english', body));
  `);
  await pool2.query(`
    CREATE INDEX IF NOT EXISTS jobs_fts_idx
      ON job_postings USING GIN (to_tsvector('english', title || ' ' || description));
  `);

  if (hasVector) {
    console.log("• adding pgvector column");
    await pool2.query(`
      ALTER TABLE knowledge_chunks
        ADD COLUMN IF NOT EXISTS embedding vector(1536);
    `);
  }

  await pool2.end();
  console.log("✓ schema ready");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
