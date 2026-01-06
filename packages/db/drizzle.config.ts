import type { Config } from "drizzle-kit";

const dbType = process.env.DATABASE_TYPE?.toLowerCase();
const isSqlite = dbType === "sqlite";

// For PGlite, use the configured path or default
const pglitePath = process.env.PGLITE_DATA_DIR || "./data/pglite";

// For SQLite, use the configured directory or default, then append filename
const sqliteDataDir = process.env.SQLITE_DATA_DIR || "./data/sqlite";
const sqlitePath = `${sqliteDataDir}/sqlite.db`;

export default {
  // Include both app schema AND queue schema for migrations
  // Queue schema is split by dialect to avoid mixing pgTable and sqliteTable
  schema: isSqlite
    ? ["./src/schema/sqlite.ts", "../queue/src/driver-db/schema/sqlite.ts"]
    : ["./src/schema/postgres.ts", "../queue/src/driver-db/schema/postgres.ts"],
  out: isSqlite ? "./src/migrations/sqlite" : "./src/migrations/postgres",
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
            "postgresql://eclaire:eclaire@127.0.0.1:5432/eclaire",
        },
  verbose: true,
  strict: true,
} satisfies Config;
