/**
 * Raw database client creation helpers.
 *
 * These are used by scripts (migrations, seeding) that need direct access
 * to the underlying database client rather than the Drizzle ORM instance.
 */

import { PGlite } from "@electric-sql/pglite";
import Database from "better-sqlite3";
import postgres from "postgres";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Create a SQLite client with proper configuration.
 * Sets up WAL mode and other pragmas for better concurrency.
 *
 * @param path - Path to the SQLite database file
 * @returns Configured better-sqlite3 Database instance
 */
export function createSqliteClient(path: string): Database.Database {
	// Ensure parent directory exists
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });

	const client = new Database(path);

	// Configure SQLite for better concurrency with WAL mode
	client.pragma("journal_mode = WAL");
	client.pragma("synchronous = NORMAL");
	client.pragma("busy_timeout = 5000");
	client.pragma("foreign_keys = ON");

	return client;
}

/**
 * Create a PGlite client (embedded PostgreSQL).
 *
 * @param path - Path to the PGlite data directory
 * @returns PGlite instance
 */
export function createPgliteClient(path: string): PGlite {
	// Ensure parent directory exists
	const dir = dirname(path);
	mkdirSync(dir, { recursive: true });

	return new PGlite(path);
}

/**
 * Create a PostgreSQL client with connection pooling.
 *
 * @param url - PostgreSQL connection URL
 * @param options - Optional postgres.js options
 * @returns postgres.js client instance
 */
export function createPostgresClient(
	url: string,
	options?: postgres.Options<Record<string, postgres.PostgresType>>,
): postgres.Sql {
	const defaultOptions: postgres.Options<Record<string, postgres.PostgresType>> = {
		max: 10, // Maximum number of connections
		idle_timeout: 20, // Seconds before idle connection is closed
		connect_timeout: 10, // Seconds before connection timeout
		connection: {
			client_encoding: "UTF8",
		},
	};

	return postgres(url, { ...defaultOptions, ...options });
}
