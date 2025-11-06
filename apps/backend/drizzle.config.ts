import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Load environment variables from .env.dev in development
if (process.env.NODE_ENV === "development") {
  config({ path: ".env.dev" });
}

const dbType = process.env.DATABASE_TYPE?.toLowerCase();

// For PGlite, use the configured path or default
const pglitePath = process.env.PGLITE_DATA_DIR || "./data/db/pglite";

export default {
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql", // PGlite uses PostgreSQL dialect
  dbCredentials:
    dbType === "pglite"
      ? {
          url: pglitePath,
        }
      : {
          url:
            process.env.DATABASE_URL ||
            "postgresql://eclaire:eclaire@localhost:5432/eclaire",
        },
  verbose: true,
  strict: true,
} satisfies Config;
