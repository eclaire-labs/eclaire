/**
 * Database configuration helpers
 *
 * Reads configuration from environment variables with sensible defaults.
 */

import { resolve } from "node:path";

export const isDev = process.env.NODE_ENV === "development";

/**
 * Get the PostgreSQL database URL from environment variables.
 * Falls back to constructing URL from individual components or defaults.
 * Returns null for sqlite/pglite since they use file paths, not connection URLs.
 */
export function getDatabaseUrl(): string | null {
  // If explicitly set, always use it
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // For file-based databases, there's no connection URL
  const dbType = getDatabaseType();
  if (dbType === "sqlite" || dbType === "pglite") {
    return null;
  }

  // Postgres: build connection URL from components
  // Default host based on runtime context
  // In containers, use Docker service name; locally use localhost
  const isContainer = process.env.ECLAIRE_RUNTIME === "container";
  const defaultHost = isContainer ? "postgres" : "127.0.0.1";

  // Fall back to individual components (using DATABASE_* naming to match compose.yaml)
  const host = process.env.DATABASE_HOST || defaultHost;
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
 * Defaults to postgres for dev/prod parity.
 * Accepts both "postgres" and "postgresql" for backwards compatibility.
 */
export function getDatabaseType(): "postgres" | "pglite" | "sqlite" {
  const type = process.env.DATABASE_TYPE?.toLowerCase();
  if (type === "sqlite") return "sqlite";
  if (type === "pglite") return "pglite";
  // Default to postgres (handles "postgres", "postgresql", or unset)
  return "postgres";
}

/**
 * Get the PGlite data directory path.
 * Defaults to data/pglite in repo root.
 */
export function getPGlitePath(): string {
  if (process.env.PGLITE_DATA_DIR) {
    return process.env.PGLITE_DATA_DIR;
  }
  // Use ECLAIRE_HOME if set (container mode), otherwise use __dirname relative path (dev mode)
  const home = process.env.ECLAIRE_HOME;
  if (home) {
    return resolve(home, "data/pglite");
  }
  // Dev mode: relative to repo root from packages/db/src/
  return resolve(import.meta.dirname, "../../../data/pglite");
}

/**
 * Get the SQLite data directory path.
 * Defaults to data/sqlite in repo root.
 */
export function getSqliteDataDir(): string {
  if (process.env.SQLITE_DATA_DIR) {
    return process.env.SQLITE_DATA_DIR;
  }
  // Use ECLAIRE_HOME if set (container mode), otherwise use __dirname relative path (dev mode)
  const home = process.env.ECLAIRE_HOME;
  if (home) {
    return resolve(home, "data/sqlite");
  }
  // Dev mode: relative to repo root from packages/db/src/
  return resolve(import.meta.dirname, "../../../data/sqlite");
}

/**
 * Get the SQLite database file path.
 */
export function getSqlitePath(): string {
  return resolve(getSqliteDataDir(), "sqlite.db");
}
