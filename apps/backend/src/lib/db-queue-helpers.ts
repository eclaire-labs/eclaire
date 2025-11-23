/**
 * Database Queue Helper Functions
 *
 * Portable helper functions for database-backed job queue that work
 * across PostgreSQL, PGlite, and SQLite.
 */

/**
 * Get current timestamp
 * Returns a Date object representing the current time in UTC
 */
export function getCurrentTimestamp(): Date {
	return new Date();
}

/**
 * Get expiration timestamp
 * @param minutes - Number of minutes from now
 * @returns Date object for expiration time
 */
export function getExpirationTime(minutes: number): Date {
	return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Get scheduled time
 * @param delayMs - Delay in milliseconds from now
 * @returns Date object for scheduled time
 */
export function getScheduledTime(delayMs: number): Date {
	return new Date(Date.now() + delayMs);
}

/**
 * Check if a job is expired
 * @param expiresAt - Job expiration timestamp
 * @returns true if job has expired
 */
export function isJobExpired(expiresAt: Date | null): boolean {
	if (!expiresAt) return false;
	return new Date() > expiresAt;
}

/**
 * Check if a job is ready to be processed
 * @param scheduledFor - Job scheduled time
 * @returns true if job should be processed now
 */
export function isJobReady(scheduledFor: Date | null): boolean {
	if (!scheduledFor) return true;
	return new Date() >= scheduledFor;
}

/**
 * Claimed job result type
 */
export interface ClaimedJob {
	id: string;
	asset_type: string;
	asset_id: string;
	user_id: string;
	job_type: string;
	status: string;
	job_data: any;
	locked_by: string | null;
	locked_at: Date | null;
	expires_at: Date | null;
	retry_count: number;
	max_retries: number;
	created_at: Date;
}

/**
 * Format a database row into a ClaimedJob result
 * @param row - Database row from assetProcessingJobs
 * @returns Formatted ClaimedJob or null
 */
export function formatJobResult(row: any): ClaimedJob | null {
	if (!row) return null;

	return {
		id: row.id,
		asset_type: row.assetType,
		asset_id: row.assetId,
		user_id: row.userId,
		job_type: row.jobType || "processing",
		status: row.status,
		job_data: row.jobData,
		locked_by: row.lockedBy,
		locked_at: row.lockedAt,
		expires_at: row.expiresAt,
		retry_count: row.retryCount,
		max_retries: row.maxRetries,
		created_at: row.createdAt,
	};
}
