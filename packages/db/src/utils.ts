/**
 * Database utility functions
 */

import type { SQL } from "drizzle-orm";
import type { DbDialect, DbInstance } from "./types.js";

/**
 * Execute a raw SQL query and return rows.
 * Abstracts the difference between SQLite (.all) and PostgreSQL (.execute).
 *
 * Use this for SELECT queries that return data.
 * For DDL/DML statements, let Drizzle migrations handle them.
 */
export async function executeQuery<T = Record<string, unknown>>(
  db: DbInstance,
  dbType: DbDialect,
  query: SQL,
): Promise<T[]> {
  if (dbType === "sqlite") {
    // biome-ignore lint/suspicious/noExplicitAny: vendor-specific .all() on DbInstance union
    return (db as any).all(query) as T[];
  } else {
    // biome-ignore lint/suspicious/noExplicitAny: vendor-specific .execute() on DbInstance union
    const result = await (db as any).execute(query);
    // postgres-js returns array, pglite returns { rows: [] }
    return Array.isArray(result) ? result : (result.rows ?? []);
  }
}

/**
 * Get the current UTC timestamp as an ISO 8601 string.
 */
export function nowUtc(): string {
  return new Date().toISOString();
}

/**
 * Convert a Date, string, or number to an ISO 8601 string.
 */
export function toISOString(date: Date | string | number): string {
  return (date instanceof Date ? date : new Date(date)).toISOString();
}

/**
 * Convert a Date to SQLite timestamp (Unix epoch in milliseconds).
 */
export function toSqliteTimestamp(date: Date | string | number): number {
  return typeof date === "number" ? date : new Date(date).getTime();
}

/**
 * Convert SQLite timestamp (Unix epoch in milliseconds) to Date.
 */
export function fromSqliteTimestamp(epochMs: number): Date {
  return new Date(epochMs);
}
