/**
 * Database configuration helpers
 *
 * Reads configuration from environment variables with sensible defaults.
 */

export const isDev = process.env.NODE_ENV === "development";

/**
 * Get the PostgreSQL database URL from environment variables.
 * Falls back to constructing URL from individual components or defaults.
 */
export function getDatabaseUrl(): string {
	if (process.env.DATABASE_URL) {
		return process.env.DATABASE_URL;
	}

	// Fall back to individual components (using DATABASE_* naming to match compose.yaml)
	const host = process.env.DATABASE_HOST || "127.0.0.1";
	const port = process.env.DATABASE_PORT || "5432";
	const database = process.env.DATABASE_NAME || "eclaire";
	const username = process.env.DATABASE_USER || "eclaire";
	const password = process.env.DATABASE_PASSWORD || "eclaire";

	return `postgresql://${username}:${password}@${host}:${port}/${database}`;
}

/**
 * Get the database auth token (for Turso/LibSQL or other auth-token based DBs)
 */
export function getDatabaseAuthToken(): string | undefined {
	return process.env.DATABASE_AUTH_TOKEN;
}

/**
 * Get the database type from environment.
 * Defaults to PostgreSQL if not specified.
 */
export function getDatabaseType(): "postgresql" | "pglite" | "sqlite" {
	const type = process.env.DATABASE_TYPE?.toLowerCase();
	if (type === "pglite") return "pglite";
	if (type === "sqlite") return "sqlite";
	return "postgresql";
}

/**
 * Get the PGlite data directory path.
 * Defaults to ./data/pglite
 */
export function getPGlitePath(): string {
	return process.env.PGLITE_DATA_DIR || "./data/pglite";
}

/**
 * Get the SQLite database file path.
 * Defaults to ./data/sqlite/sqlite.db
 */
export function getSqlitePath(): string {
	return process.env.SQLITE_DB_PATH || "./data/sqlite/sqlite.db";
}
