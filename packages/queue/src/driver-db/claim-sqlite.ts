/**
 * @eclaire/queue/driver-db - SQLite job claiming
 *
 * Uses a single-statement UPDATE with subquery for atomic claiming.
 * SQLite doesn't support SKIP LOCKED, but serializes writes so only
 * one worker can successfully claim a job at a time.
 */

import { sql } from "drizzle-orm";
import type { QueueLogger } from "../core/types.js";
import { generateJobId } from "../core/utils.js";
import type { DbInstance, ClaimedJob, ClaimOptions } from "./types.js";

/**
 * Claim a job using SQLite's single-statement atomic pattern
 *
 * Uses UPDATE ... WHERE id = (SELECT id ... LIMIT 1) to atomically
 * find and claim a job in one statement. SQLite serializes writes,
 * so only one worker will successfully update when there's contention.
 *
 * This is cleaner than the two-step SELECT then UPDATE approach
 * because there's no window between SELECT and UPDATE where another
 * worker could claim the same job.
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param name - Queue name to claim from
 * @param options - Claim options (workerId, lockDuration)
 * @param logger - Logger instance
 * @returns Claimed job or null if none available
 */
export async function claimJobSqlite(
  db: DbInstance,
  queueJobs: any,
  name: string,
  options: ClaimOptions,
  logger: QueueLogger,
): Promise<ClaimedJob | null> {
  const { workerId, lockDuration } = options;
  const now = new Date();
  const nowMs = now.getTime();
  const expiresAtMs = nowMs + lockDuration;
  // Generate a unique fencing token for this claim
  const lockToken = generateJobId();

  try {
    // Single atomic statement: UPDATE with subquery to find the job
    // SQLite stores timestamps as integers (milliseconds)
    const result = await (db as any).run(sql`
      UPDATE ${queueJobs}
      SET
        status = 'processing',
        locked_by = ${workerId},
        locked_at = ${nowMs},
        expires_at = ${expiresAtMs},
        lock_token = ${lockToken},
        attempts = attempts + 1,
        updated_at = ${nowMs}
      WHERE id = (
        SELECT id FROM ${queueJobs}
        WHERE name = ${name}
        AND (
          (status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= ${nowMs}))
          OR (status = 'retry_pending' AND (next_retry_at IS NULL OR next_retry_at <= ${nowMs}))
          OR (status = 'processing' AND expires_at < ${nowMs} AND attempts < max_attempts)
        )
        ORDER BY
          CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
          priority DESC,
          created_at ASC
        LIMIT 1
      )
    `);

    // Check if any row was updated
    // better-sqlite3 returns { changes: number }
    const changes = result?.changes ?? result?.rowsAffected ?? 0;
    if (changes === 0) {
      return null;
    }

    // Fetch the claimed job to return it
    // We need to SELECT because SQLite's UPDATE doesn't have RETURNING in older versions
    // and drizzle's sql.run() doesn't support RETURNING
    // Additional filters (locked_by, status) prevent edge cases from token collision
    const [claimedJob] = await (db as any)
      .select()
      .from(queueJobs)
      .where(
        sql`${queueJobs.lockToken} = ${lockToken}
          AND ${queueJobs.lockedBy} = ${workerId}
          AND ${queueJobs.status} = 'processing'`,
      )
      .limit(1);

    if (!claimedJob) {
      // This shouldn't happen - we just claimed it
      logger.warn({ name, workerId, lockToken }, "Claimed job not found after UPDATE");
      return null;
    }

    logger.debug(
      { jobId: claimedJob.id, name, workerId, attempts: claimedJob.attempts },
      "Job claimed (SQLite)",
    );

    return formatClaimedJob(claimedJob);
  } catch (error) {
    logger.error(
      {
        name,
        workerId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to claim job",
    );
    throw error;
  }
}

/**
 * Convert a value to a Date object, handling both Date and timestamp inputs
 */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

/**
 * Format database row to ClaimedJob interface
 * Normalizes all timestamp fields to Date objects
 */
function formatClaimedJob(row: any): ClaimedJob {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    data: row.data,
    status: row.status,
    priority: row.priority,
    scheduledFor: toDate(row.scheduledFor),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextRetryAt: toDate(row.nextRetryAt),
    backoffMs: row.backoffMs,
    backoffType: row.backoffType,
    lockedBy: row.lockedBy,
    lockedAt: toDate(row.lockedAt),
    expiresAt: toDate(row.expiresAt),
    lockToken: row.lockToken,
    errorMessage: row.errorMessage,
    errorDetails: row.errorDetails,
    createdAt: toDate(row.createdAt)!,
    updatedAt: toDate(row.updatedAt)!,
    completedAt: toDate(row.completedAt),
  };
}
