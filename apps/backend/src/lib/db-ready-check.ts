/**
 * Lightweight database readiness check for development mode
 *
 * This module checks if the database is migrated BEFORE initializing Drizzle ORM.
 * This prevents cascade errors from modules trying to use unmigrated tables.
 *
 * IMPORTANT: This module must NOT import anything that triggers DB initialization.
 * It uses native database libraries directly for synchronous checks.
 */

import { getDatabaseType, getPGlitePath, getSqlitePath } from "@eclaire/db";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";

// Create require for CommonJS modules in ESM context
const require = createRequire(import.meta.url);

export interface DatabaseReadyResult {
  ready: boolean;
  message: string;
}

/**
 * Check if the database is ready (migrated).
 * Returns { ready: true } if database is ready, { ready: false, message } if not.
 *
 * For SQLite: Synchronous check using better-sqlite3
 * For PGlite: Check if data directory exists
 * For PostgreSQL: Skip check (async-only, Docker handles this)
 */
export function checkDatabaseReady(): DatabaseReadyResult {
  const dbType = getDatabaseType();

  try {
    if (dbType === "sqlite") {
      return checkSqliteReady();
    } else if (dbType === "pglite") {
      return checkPgliteReady();
    } else {
      // PostgreSQL - can't do sync check, assume ready
      // Docker entrypoint handles the check for container mode
      return { ready: true, message: "PostgreSQL (skipped sync check)" };
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return {
      ready: false,
      message: `Database check failed: ${errMsg}`,
    };
  }
}

function checkSqliteReady(): DatabaseReadyResult {
  const sqlitePath = getSqlitePath();

  // If file doesn't exist, clearly not ready
  if (!existsSync(sqlitePath)) {
    return {
      ready: false,
      message: `SQLite database file not found at ${sqlitePath}`,
    };
  }

  // Use better-sqlite3 directly (synchronous) to check for tables
  // This avoids initializing Drizzle ORM
  const Database = require("better-sqlite3");
  const db = new Database(sqlitePath, { readonly: true });

  try {
    // Check if __drizzle_migrations table exists
    const result = db
      .prepare(
        `
			SELECT name FROM sqlite_master
			WHERE type='table' AND name='__drizzle_migrations'
		`,
      )
      .get();

    if (!result) {
      return {
        ready: false,
        message: "Database file exists but is not migrated",
      };
    }

    return { ready: true, message: "Database is ready" };
  } finally {
    db.close();
  }
}

function checkPgliteReady(): DatabaseReadyResult {
  const pglitePath = getPGlitePath();

  // PGlite stores data in a directory
  if (!existsSync(pglitePath)) {
    return {
      ready: false,
      message: `PGlite data directory not found at ${pglitePath}`,
    };
  }

  // Check for PGlite's pg_wal directory as a proxy for initialization
  const pgWalPath = `${pglitePath}/pg_wal`;
  if (!existsSync(pgWalPath)) {
    return {
      ready: false,
      message: "PGlite data directory exists but database not initialized",
    };
  }

  // Can't easily do a sync table check for PGlite without async
  // Trust that if pg_wal exists, some initialization happened
  return { ready: true, message: "PGlite appears ready" };
}

/**
 * Print a user-friendly error message and exit
 */
export function exitWithMigrationMessage(): never {
  console.error("");
  console.error(
    "===============================================================",
  );
  console.error("  DATABASE NOT INITIALIZED");
  console.error(
    "===============================================================",
  );
  console.error("");
  console.error("  The database has not been set up yet. Please run:");
  console.error("");
  console.error("    pnpm setup:dev");
  console.error("");
  console.error(
    "===============================================================",
  );
  console.error("");

  process.exit(1);
}
