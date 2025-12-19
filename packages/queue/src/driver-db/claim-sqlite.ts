/**
 * @eclaire/queue/driver-db - SQLite job claiming
 *
 * Uses a single-statement UPDATE...RETURNING with subquery for atomic claiming.
 * SQLite doesn't support SKIP LOCKED, but serializes writes so only
 * one worker can successfully claim a job at a time.
 *
 * Requires SQLite 3.35+ (March 2021) for RETURNING support.
 */

import { sql } from "drizzle-orm";
import type { QueueLogger, JobStage } from "../core/types.js";
import { generateJobId } from "../core/utils.js";
import type { DbInstance, ClaimedJob, ClaimOptions } from "./types.js";

/**
 * Claim a job using SQLite's single-statement atomic pattern
 *
 * Uses UPDATE ... WHERE id = (SELECT id ... LIMIT 1) RETURNING * to atomically
 * find, claim, and return a job in one statement. SQLite serializes writes,
 * so only one worker will successfully update when there's contention.
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param queue - Queue name to claim from
 * @param options - Claim options (workerId, lockDuration)
 * @param logger - Logger instance
 * @returns Claimed job or null if none available
 */
export async function claimJobSqlite(
  db: DbInstance,
  queueJobs: any,
  queue: string,
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
    // Single atomic statement: UPDATE with subquery + RETURNING
    // SQLite stores timestamps as integers (milliseconds)
    // Uses db.all() to get the RETURNING result (db.run() only returns changes count)
    const result = await (db as any).all(sql`
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
        WHERE queue = ${queue}
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
      RETURNING *
    `);

    // No job available if empty result
    if (!result || result.length === 0) {
      return null;
    }

    const job = result[0];

    logger.debug(
      { jobId: job.id, queue, workerId, attempts: job.attempts },
      "Job claimed (SQLite)",
    );

    // Raw SQL RETURNING returns snake_case columns
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
 * Convert a value to a Date object, handling both Date and timestamp inputs
 */
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  return new Date(value as string | number);
}

/**
 * Parse JSON if it's a string, otherwise return as-is
 * SQLite stores JSON as TEXT, so raw SQL returns strings
 */
function parseJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
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
    data: parseJson(row.data),
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
    errorDetails: parseJson(row.errorDetails ?? row.error_details),
    createdAt: toDate(row.createdAt ?? row.created_at)!,
    updatedAt: toDate(row.updatedAt ?? row.updated_at)!,
    completedAt: toDate(row.completedAt ?? row.completed_at),
    // Multi-stage progress tracking
    stages: (parseJson(row.stages) as JobStage[] | null) ?? null,
    currentStage: row.currentStage ?? row.current_stage ?? null,
    overallProgress: row.overallProgress ?? row.overall_progress ?? null,
    metadata: (parseJson(row.metadata) as Record<string, unknown> | null) ?? null,
  };
}
