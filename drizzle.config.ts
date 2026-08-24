import type { Config } from "drizzle-kit";
import { config } from "dotenv";

config({ path: ".env", quiet: true });

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: false,
  verbose: false,
} satisfies Config;
