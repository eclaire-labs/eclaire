/**
 * Database Queue Helper Functions
 *
 * Portable helper functions for database-backed job queue that work
 * across PostgreSQL, PGlite, and SQLite.
 */

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
