/**
 * Database utilities for ID generation and timestamp handling
 */

/**
 * Get current UTC timestamp as ISO 8601 string
 * This format is portable across PostgreSQL and SQLite
 */
export function nowUtc(): string {
	return new Date().toISOString();
}

/**
 * Convert a Date to ISO 8601 string for database storage
 */
export function toISOString(date: Date | string | number): string {
	if (typeof date === "string") {
		return new Date(date).toISOString();
	}
	if (typeof date === "number") {
		return new Date(date).toISOString();
	}
	return date.toISOString();
}

/**
 * Parse ISO 8601 string to Date
 */
export function fromISOString(iso: string): Date {
	return new Date(iso);
}
