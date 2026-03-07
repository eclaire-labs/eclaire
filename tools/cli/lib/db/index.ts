/**
 * Lazy database initialization for CLI commands that need DB access.
 * Only connects when first called (not on startup).
 */

import "@eclaire/core/env-loader";

import {
  initializeDatabase,
  closeDatabase,
  type DatabaseInitResult,
} from "@eclaire/db";

let _result: DatabaseInitResult | null = null;

/**
 * Get a database connection, initializing on first call.
 * Uses environment variables for configuration (DATABASE_TYPE, DATABASE_URL, etc.)
 */
export function getDb(): DatabaseInitResult {
  if (!_result) {
    _result = initializeDatabase();
  }
  return _result;
}

/**
 * Close the database connection gracefully.
 */
export async function closeDb(): Promise<void> {
  if (_result) {
    await closeDatabase();
    _result = null;
  }
}
