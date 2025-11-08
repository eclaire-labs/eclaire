import { config } from "dotenv";
import type { Config } from "drizzle-kit";

// Load environment variables from .env.dev in development
if (process.env.NODE_ENV === "development") {
  config({ path: ".env.dev" });
}

const dbType = process.env.DATABASE_TYPE?.toLowerCase();

// For PGlite, use the configured path or default
const pglitePath = process.env.PGLITE_DATA_DIR || "./data/db/pglite";

// For SQLite, use the configured path or default
const sqlitePath = process.env.SQLITE_DATA_DIR || "./data/db/sqlite.db";

// Determine schema, dialect, and output based on database type
const isSqlite = dbType === "sqlite";

export default {
  schema: isSqlite ? "./src/db/schema/sqlite.ts" : "./src/db/schema/postgres.ts",
  out: isSqlite ? "./src/db/migrations-sqlite" : "./src/db/migrations-postgres",
  dialect: isSqlite ? "sqlite" : "postgresql",
  dbCredentials: isSqlite
    ? {
        url: sqlitePath,
      }
    : dbType === "pglite"
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
