import type { Config } from "drizzle-kit";

const dbType = process.env.DATABASE_TYPE?.toLowerCase();
const isSqlite = dbType === "sqlite";

// For PGlite, use the configured path or default
const pglitePath = process.env.PGLITE_DATA_DIR || "./data/pglite";

// For SQLite, use the configured path or default
const sqlitePath = process.env.SQLITE_DB_PATH || "./data/sqlite/sqlite.db";

export default {
	schema: isSqlite ? "./src/schema/sqlite.ts" : "./src/schema/postgres.ts",
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
						"postgresql://eclaire:eclaire@localhost:5432/eclaire",
				},
	verbose: true,
	strict: true,
} satisfies Config;
