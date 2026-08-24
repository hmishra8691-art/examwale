import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as {
  __examwalePool?: Pool;
};

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.",
    );
  }
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

// Reused across hot reloads in dev so we don't exhaust Postgres connections.
export const pool: Pool = globalForDb.__examwalePool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.__examwalePool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
