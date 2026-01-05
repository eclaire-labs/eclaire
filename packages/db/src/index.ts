/**
 * @eclaire/db - Database abstraction for Eclaire applications
 *
 * Provides unified database access across PostgreSQL, PGlite, and SQLite.
 * Includes schemas, transaction management, and configuration helpers.
 */

import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import type { Logger } from "@eclaire/logger";
import type { PGlite } from "@electric-sql/pglite";
import type Database from "better-sqlite3";
import type postgres from "postgres";
import {
	createSqliteClient,
	createPgliteClient,
	createPostgresClient,
} from "./clients.js";
import {
	getDatabaseUrl,
	getDatabaseType,
	getPGlitePath,
	getSqlitePath,
} from "./config.js";
import * as pgSchema from "./schema/postgres.js";
import * as sqliteSchema from "./schema/sqlite.js";
import type {
	TransactionManager,
	DbCapabilities,
	DbInstance,
	DbDialect,
	PostgresDbInstance,
	PgliteDbInstance,
	SqliteDbInstance,
} from "./types.js";
import { createPgTransactionManager } from "./adapters/postgres/tx.js";
import { createSqliteTransactionManager } from "./adapters/sqlite/tx.js";

// Re-export everything from submodules
export * from "./types.js";
export * from "./config.js";
export * from "./utils.js";
export * from "./clients.js";
export { pgSchema, sqliteSchema };
export { createPgTransactionManager } from "./adapters/postgres/tx.js";
export { createSqliteTransactionManager } from "./adapters/sqlite/tx.js";

/**
 * Configuration interface for database initialization.
 * If not provided, values are read from environment variables.
 */
export interface DatabaseConfig {
	/** Database type: postgresql, pglite, or sqlite */
	type?: DbDialect;
	/** PostgreSQL connection URL (for postgresql type) */
	url?: string;
	/** File path for pglite or sqlite databases */
	path?: string;
	/** Logger instance for database operations */
	logger?: Logger;
}

/**
 * Result of database initialization
 */
export interface DatabaseInitResult {
	/** Drizzle ORM database instance */
	db: DbInstance;
	/** Transaction manager for atomic operations */
	txManager: TransactionManager;
	/** Database capabilities based on dialect */
	capabilities: DbCapabilities;
	/** Active schema (postgres or sqlite) */
	schema: typeof pgSchema | typeof sqliteSchema;
	/** Database dialect identifier */
	dbType: DbDialect;
}

// Singleton instances
let dbInstance: DbInstance | null = null;
let txManagerInstance: TransactionManager | null = null;
let capabilitiesInstance: DbCapabilities | null = null;
let rawClient: postgres.Sql | Database.Database | PGlite | null = null;
let currentDbType: DbDialect | null = null;

/**
 * Get database capabilities based on database type
 */
function getDatabaseCapabilities(dbType: DbDialect): DbCapabilities {
	switch (dbType) {
		case "postgres":
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
 * Initialize the database based on configuration or environment variables.
 *
 * This function creates database connections, transaction managers, and returns
 * all necessary objects for database operations. It maintains singleton instances
 * so calling multiple times returns the same instances.
 *
 * @param config - Optional configuration. Falls back to env vars if not provided.
 * @returns Database instance, transaction manager, capabilities, schema, and type
 *
 * @example
 * ```typescript
 * // Using environment variables
 * const { db, txManager, schema } = initializeDatabase();
 *
 * // With explicit configuration
 * const { db, txManager } = initializeDatabase({
 *   type: 'sqlite',
 *   path: './data/app.db',
 *   logger: myLogger
 * });
 * ```
 */
export function initializeDatabase(config?: DatabaseConfig): DatabaseInitResult {
	if (dbInstance && txManagerInstance && capabilitiesInstance) {
		const dbType = config?.type ?? getDatabaseType();
		return {
			db: dbInstance,
			txManager: txManagerInstance,
			capabilities: capabilitiesInstance,
			schema: dbType === "sqlite" ? sqliteSchema : pgSchema,
			dbType,
		};
	}

	const dbType = config?.type ?? getDatabaseType();
	capabilitiesInstance = getDatabaseCapabilities(dbType);

	const logger = config?.logger;

	if (dbType === "sqlite") {
		// Initialize SQLite (file-based, synchronous)
		const sqlitePath = config?.path ?? getSqlitePath();
		logger?.info({ path: sqlitePath }, "Initializing SQLite database");

		const client = createSqliteClient(sqlitePath);
		rawClient = client;
		currentDbType = dbType;
		dbInstance = drizzleSqlite(client, { schema: sqliteSchema }) as any;
		txManagerInstance = createSqliteTransactionManager(
			dbInstance as SqliteDbInstance,
			sqliteSchema,
		);

		logger?.info({ path: sqlitePath }, "SQLite database initialized with WAL mode");

		return {
			db: dbInstance!,
			txManager: txManagerInstance!,
			capabilities: capabilitiesInstance!,
			schema: sqliteSchema,
			dbType,
		};
	} else if (dbType === "pglite") {
		// Initialize PGlite (file-based, single connection)
		const pglitePath = config?.path ?? getPGlitePath();
		logger?.info({ path: pglitePath }, "Initializing PGlite database");

		const client = createPgliteClient(pglitePath);
		rawClient = client;
		currentDbType = dbType;
		dbInstance = drizzlePglite(client, { schema: pgSchema }) as any;
		txManagerInstance = createPgTransactionManager(
			dbInstance as PgliteDbInstance,
		);

		logger?.info({ path: pglitePath }, "PGlite database initialized");

		return {
			db: dbInstance!,
			txManager: txManagerInstance!,
			capabilities: capabilitiesInstance!,
			schema: pgSchema,
			dbType,
		};
	} else {
		// Initialize PostgreSQL (with connection pooling)
		const dbUrl = config?.url ?? getDatabaseUrl();
		logger?.info(
			{ dbUrl: dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") ? "local" : "remote" },
			"Initializing PostgreSQL database connection",
		);

		const client = createPostgresClient(dbUrl);
		rawClient = client;
		currentDbType = dbType;
		dbInstance = drizzlePostgres(client, { schema: pgSchema });
		txManagerInstance = createPgTransactionManager(
			dbInstance as PostgresDbInstance,
		);

		logger?.info(
			{ dbUrl: dbUrl.includes("localhost") || dbUrl.includes("127.0.0.1") ? "local" : "remote" },
			"PostgreSQL database connection initialized",
		);

		return {
			db: dbInstance!,
			txManager: txManagerInstance!,
			capabilities: capabilitiesInstance!,
			schema: pgSchema,
			dbType,
		};
	}
}

/**
 * Reset singleton instances. Useful for testing.
 */
export function resetDatabaseInstance(): void {
	dbInstance = null;
	txManagerInstance = null;
	capabilitiesInstance = null;
	rawClient = null;
	currentDbType = null;
}

/**
 * Close the database connection gracefully.
 *
 * @param options - Optional settings for closing the connection
 * @param options.timeout - Timeout in seconds for PostgreSQL connections (default: 5)
 */
export async function closeDatabase(options?: { timeout?: number }): Promise<void> {
	if (!rawClient) return;

	if (currentDbType === "postgres") {
		await (rawClient as postgres.Sql).end({ timeout: options?.timeout ?? 5 });
	} else if (currentDbType === "sqlite") {
		(rawClient as Database.Database).close();
	} else if (currentDbType === "pglite") {
		await (rawClient as PGlite).close();
	}

	resetDatabaseInstance();
}
