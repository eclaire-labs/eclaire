/**
 * Timestamp adapter utilities for SQLite
 *
 * SQLite stores timestamps as INTEGER (Unix epoch milliseconds)
 * PostgreSQL uses TIMESTAMP/TIMESTAMPTZ
 *
 * With Drizzle's `mode: 'timestamp_ms'`, both databases now expose Date objects
 * in JavaScript, making the application database-agnostic.
 */

/**
 * Convert a Date object to SQLite timestamp (Unix epoch milliseconds)
 * Note: With `mode: 'timestamp_ms'`, this is rarely needed as Drizzle handles the conversion
 */
export function toSqliteTimestamp(date: Date | null | undefined): number | null {
  if (!date) return null;
  return date.getTime();
}

/**
 * Convert SQLite timestamp (Unix epoch milliseconds) to Date object
 * Note: With `mode: 'timestamp_ms'`, this is rarely needed as Drizzle handles the conversion
 */
export function fromSqliteTimestamp(epochMs: number | null | undefined): Date | null {
  if (epochMs === null || epochMs === undefined) return null;
  return new Date(epochMs);
}

/**
 * Get current timestamp as a Date object for default values.
 * With `mode: 'timestamp_ms'`, Drizzle expects Date objects, not numbers.
 */
export function sqliteNow(): Date {
  return new Date();
}
