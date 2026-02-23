/**
 * Database Queue Helper Functions
 *
 * Portable helper functions for database-backed job queue that work
 * across PostgreSQL, PGlite, and SQLite.
 */

import type { ClaimedJob } from "./types.js";

// Re-export from @eclaire/core for backwards compatibility
export { getCurrentTimestamp } from "@eclaire/core";

/**
 * Get scheduled time
 * @param delay - Delay from now (milliseconds)
 * @returns Date object for scheduled time
 */
export function getScheduledTime(delay: number): Date {
  return new Date(Date.now() + delay);
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
 * Format a database row into a ClaimedJob result
 * @param row - Database row from queueJobs
 * @returns Formatted ClaimedJob or null
 */
// biome-ignore lint/suspicious/noExplicitAny: raw database row — column names vary by ORM mapping
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
