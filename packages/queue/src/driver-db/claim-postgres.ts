/**
 * @eclaire/queue/driver-db - PostgreSQL job claiming
 *
 * Uses FOR UPDATE SKIP LOCKED for optimal concurrent claiming.
 */

import { eq, and, or, lte, lt, isNull, inArray, desc, asc, sql } from "drizzle-orm";
import type { QueueLogger } from "../core/types.js";
import { generateJobId } from "../core/utils.js";
import type { DbInstance, ClaimedJob, ClaimOptions } from "./types.js";

/**
 * Claim a job using PostgreSQL's FOR UPDATE SKIP LOCKED
 *
 * This is the most efficient way to claim jobs in PostgreSQL:
 * - Finds the next eligible job
 * - Locks it atomically (other workers skip it)
 * - Updates to processing status
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param queue - Queue name to claim from
 * @param options - Claim options (workerId, lockDuration)
 * @param logger - Logger instance
 * @returns Claimed job or null if none available
 */
export async function claimJobPostgres(
  db: DbInstance,
  queueJobs: any,
  queue: string,
  options: ClaimOptions,
  logger: QueueLogger,
): Promise<ClaimedJob | null> {
  const { workerId, lockDuration } = options;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockDuration);
  // Generate a unique fencing token for this claim
  const lockToken = generateJobId();

  try {
    // Use a single atomic UPDATE with subquery to avoid race condition
    // The subquery uses FOR UPDATE SKIP LOCKED to find and lock the job
    // The UPDATE happens in the same statement, so the lock is held
    const result = await (db as any).execute(sql`
      UPDATE ${queueJobs}
      SET
        status = 'processing',
        locked_by = ${workerId},
        locked_at = ${now},
        expires_at = ${expiresAt},
        lock_token = ${lockToken},
        attempts = attempts + 1,
        updated_at = ${now}
      WHERE id = (
        SELECT id FROM ${queueJobs}
        WHERE queue = ${queue}
        AND (
          (status = 'pending' AND (scheduled_for IS NULL OR scheduled_for <= ${now}))
          OR (status = 'retry_pending' AND (next_retry_at IS NULL OR next_retry_at <= ${now}))
          OR (status = 'processing' AND expires_at < ${now} AND attempts < max_attempts)
        )
        ORDER BY
          CASE WHEN status = 'processing' THEN 0 ELSE 1 END,
          priority DESC,
          created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    const job = result.rows?.[0];

    if (!job) {
      return null;
    }

    logger.debug(
      { jobId: job.id, queue, workerId, attempts: job.attempts },
      "Job claimed (PostgreSQL)",
    );

    return formatClaimedJob(job);
  } catch (error) {
    logger.error(
      {
        queue,
        workerId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to claim job",
    );
    throw error;
  }
}

/**
 * Convert a value to a Date object, handling both Date and string inputs
 */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

/**
 * Format database row to ClaimedJob interface
 * Handles both camelCase (drizzle ORM) and snake_case (raw SQL) column names
 * Normalizes all timestamp fields to Date objects
 */
function formatClaimedJob(row: any): ClaimedJob {
  return {
    id: row.id,
    queue: row.queue,
    key: row.key,
    data: row.data,
    status: row.status,
    priority: row.priority,
    scheduledFor: toDate(row.scheduledFor ?? row.scheduled_for),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts ?? row.max_attempts,
    nextRetryAt: toDate(row.nextRetryAt ?? row.next_retry_at),
    backoffMs: row.backoffMs ?? row.backoff_ms,
    backoffType: row.backoffType ?? row.backoff_type,
    lockedBy: row.lockedBy ?? row.locked_by,
    lockedAt: toDate(row.lockedAt ?? row.locked_at),
    expiresAt: toDate(row.expiresAt ?? row.expires_at),
    lockToken: row.lockToken ?? row.lock_token,
    errorMessage: row.errorMessage ?? row.error_message,
    errorDetails: row.errorDetails ?? row.error_details,
    createdAt: toDate(row.createdAt ?? row.created_at)!,
    updatedAt: toDate(row.updatedAt ?? row.updated_at)!,
    completedAt: toDate(row.completedAt ?? row.completed_at),
    // Multi-stage progress tracking
    stages: row.stages ?? null,
    currentStage: row.currentStage ?? row.current_stage ?? null,
    overallProgress: row.overallProgress ?? row.overall_progress ?? null,
    metadata: row.metadata ?? null,
  };
}
