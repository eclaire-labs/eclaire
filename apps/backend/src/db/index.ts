import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createChildLogger } from "../lib/logger";
import {
	getDatabaseUrl,
	getDatabaseType,
	getPGlitePath,
	getSqlitePath,
} from "./config";
import * as pgSchema from "./schema/postgres";
import * as sqliteSchema from "./schema/sqlite";
import type { TransactionManager, DbCapabilities } from "@/ports/tx";
import { createPgTransactionManager } from "./adapters/postgres/tx";
import { createSqliteTransactionManager } from "./adapters/sqlite/tx";

const logger = createChildLogger("db");

// Singleton instances
type PostgresDbInstance = ReturnType<typeof drizzlePostgres<typeof pgSchema>>;
type PgliteDbInstance = ReturnType<typeof drizzlePglite<typeof pgSchema>>;
type SqliteDbInstance = ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>;

// Union type for all possible database instances
type DbInstance = PostgresDbInstance | PgliteDbInstance | SqliteDbInstance;

let dbInstance: DbInstance | null = null;
let txManagerInstance: TransactionManager | null = null;
let capabilitiesInstance: DbCapabilities | null = null;

/**
 * Get database capabilities based on database type
 */
function getDatabaseCapabilities(
	dbType: "postgresql" | "pglite" | "sqlite",
): DbCapabilities {
	switch (dbType) {
		case "postgresql":
			return {
				jsonIndexing: true, // JSONB with GIN indexes
				fts: "builtin", // Built-in tsvector full-text search
				notify: true, // LISTEN/NOTIFY support
				skipLocked: true, // FOR UPDATE SKIP LOCKED support
			};
		case "pglite":
			return {
				jsonIndexing: true, // JSONB with GIN indexes
				fts: "builtin", // tsvector support
				notify: false, // No LISTEN/NOTIFY (embedded)
				skipLocked: true, // FOR UPDATE SKIP LOCKED support
			};
		case "sqlite":
			return {
				jsonIndexing: false, // No native JSONB indexing
				fts: "builtin", // FTS5 available
				notify: false, // No LISTEN/NOTIFY
				skipLocked: false, // No SKIP LOCKED support
			};
	}
}

/**
 * Initialize the database client based on DATABASE_TYPE
 */
function initializeDatabase(): {
	db: DbInstance;
	txManager: TransactionManager;
	capabilities: DbCapabilities;
} {
	if (dbInstance && txManagerInstance && capabilitiesInstance) {
		return {
			db: dbInstance,
			txManager: txManagerInstance,
			capabilities: capabilitiesInstance,
		};
	}

	const dbType = getDatabaseType();
	capabilitiesInstance = getDatabaseCapabilities(dbType);

	if (dbType === "sqlite") {
		// Initialize SQLite (file-based, synchronous)
		const sqlitePath = getSqlitePath();
		logger.info({ path: sqlitePath }, "Initializing SQLite database");

		// Ensure parent directory exists
		const dir = dirname(sqlitePath);
		mkdirSync(dir, { recursive: true });

		const client = new Database(sqlitePath);

		// Configure SQLite for better concurrency with WAL mode
		client.pragma("journal_mode = WAL");
		client.pragma("synchronous = NORMAL");
		client.pragma("busy_timeout = 5000");
		client.pragma("foreign_keys = ON");

		dbInstance = drizzleSqlite(client, { schema: sqliteSchema }) as any;
		txManagerInstance = createSqliteTransactionManager(
			dbInstance as SqliteDbInstance,
			sqliteSchema,
		);

		logger.info({ path: sqlitePath }, "SQLite database initialized with WAL mode");
	} else if (dbType === "pglite") {
		// Initialize PGlite (file-based, single connection)
		const pglitePath = getPGlitePath();
		logger.info({ path: pglitePath }, "Initializing PGlite database");

		const client = new PGlite(pglitePath);
		dbInstance = drizzlePglite(client, { schema: pgSchema }) as any;
		txManagerInstance = createPgTransactionManager(
			dbInstance as PgliteDbInstance,
		);

		logger.info({ path: pglitePath }, "PGlite database initialized");
	} else {
		// Initialize PostgreSQL (with connection pooling)
		const dbUrl = getDatabaseUrl();
		logger.info(
			{ dbUrl: dbUrl.includes("localhost") ? "local" : "remote" },
			"Initializing PostgreSQL database connection",
		);

		const client = postgres(dbUrl, {
			max: 10, // Maximum number of connections
			idle_timeout: 20, // Seconds before idle connection is closed
			connect_timeout: 10, // Seconds before connection timeout
			connection: {
				client_encoding: "UTF8",
			},
		});

		dbInstance = drizzlePostgres(client, { schema: pgSchema });
		txManagerInstance = createPgTransactionManager(
			dbInstance as PostgresDbInstance,
		);

		logger.info(
			{ dbUrl: dbUrl.includes("localhost") ? "local" : "remote" },
			"PostgreSQL database connection initialized",
		);
	}

	return {
		db: dbInstance!,
		txManager: txManagerInstance!,
		capabilities: capabilitiesInstance!,
	};
}

// Export database type for conditional logic if needed
export const dbType = getDatabaseType();

// Initialize and export database, transaction manager, and capabilities
const { db: dbExport, txManager: txMgr, capabilities } = initializeDatabase();

// Export db instance directly
// Direct initialization provides better TypeScript type inference
// Type assertion to avoid union type issues in consuming code
// All three DB types (PostgreSQL, PGlite, SQLite) implement compatible interfaces
export const db = dbExport as PostgresDbInstance;

// Export transaction manager and capabilities
export const txManager = txMgr;
export const dbCapabilities = capabilities;

// Export the schemas for migrations and other uses
// Use type assertion to avoid union type issues in consuming code
export const schema = (dbType === "sqlite" ? sqliteSchema : pgSchema) as typeof pgSchema;
