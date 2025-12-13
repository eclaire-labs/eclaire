/**
 * Database initialization for Eclaire backend
 *
 * This file uses @eclaire/db package for all database functionality.
 *
 * NOTE: Types are cast to postgres for simplicity. App code should be
 * database-agnostic and use only drizzle operators (eq, and, sql, etc.)
 * that work across all dialects. The actual database type is determined
 * at runtime via the DATABASE_TYPE environment variable.
 */

import {
	initializeDatabase as pkgInitializeDatabase,
	pgSchema,
	sqliteSchema,
	getDatabaseType,
	type TransactionManager,
	type DbCapabilities,
	type DbDialect,
} from "@eclaire/db";
import { createChildLogger } from "../lib/logger.js";

// Re-export types for convenience
export type {
	Tx,
	TransactionManager,
	BaseRepository,
	DbCapabilities,
	DbDialect,
} from "@eclaire/db";
export { pgSchema, sqliteSchema };

const logger = createChildLogger("db");

// Initialize database using the package
const { db: dbExport, txManager: txMgr, capabilities, dbType: detectedDbType, schema: activeSchema } = pkgInitializeDatabase({
	logger,
});

// Export database type
export const dbType = detectedDbType;

// Export with proper types - cast to postgres type for compatibility
export const db = dbExport as ReturnType<typeof import("drizzle-orm/postgres-js").drizzle<typeof pgSchema>>;
export const txManager = txMgr;
export const dbCapabilities = capabilities;
export const schema = activeSchema as typeof pgSchema;
