/**
 * Database utility functions
 */

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
	if (typeof date === "string") return new Date(date).toISOString();
	if (typeof date === "number") return new Date(date).toISOString();
	return date.toISOString();
}

/**
 * Parse an ISO 8601 string to a Date object.
 */
export function fromISOString(iso: string): Date {
	return new Date(iso);
}

/**
 * Convert a Date to SQLite timestamp (Unix epoch in milliseconds).
 */
export function toSqliteTimestamp(date: Date | string | number): number {
	if (typeof date === "string") return new Date(date).getTime();
	if (typeof date === "number") return date;
	return date.getTime();
}

/**
 * Convert SQLite timestamp (Unix epoch in milliseconds) to Date.
 */
export function fromSqliteTimestamp(epochMs: number): Date {
	return new Date(epochMs);
}

/**
 * Get current timestamp as a Date object.
 */
export function sqliteNow(): Date {
	return new Date();
}
