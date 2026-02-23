/**
 * @eclaire/queue/driver-db - Database QueueClient implementation
 */

import { and, count, eq, or, sql } from "drizzle-orm";
import {
  isPermanentError,
  isRateLimitError,
  JobAlreadyActiveError,
  type RateLimitError,
} from "../core/errors.js";
import {
  calculateOverallProgress,
  initializeStages,
} from "../core/progress.js";
import type {
  BackoffStrategy,
  Job,
  JobOptions,
  JobStage,
  QueueClient,
  QueueStats,
} from "../core/types.js";
import {
  calculateBackoff,
  DEFAULT_BACKOFF,
  generateJobId,
} from "../core/utils.js";
import type { DbQueueClientConfig } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  maxAttempts: 3,
  backoff: DEFAULT_BACKOFF,
};

/**
 * Create a database-backed QueueClient
 *
 * @param config - Client configuration
 * @returns QueueClient implementation
 */
export function createDbQueueClient(config: DbQueueClientConfig): QueueClient {
  const {
    db,
    schema,
    capabilities,
    logger,
    notifyEmitter,
    defaultBackoff = DEFAULTS.backoff,
    defaultMaxAttempts = DEFAULTS.maxAttempts,
  } = config;

  const { queueJobs } = schema;

  return {
    /**
     * Enqueue a job
     */
    async enqueue<T>(
      queue: string,
      data: T,
      options: JobOptions = {},
    ): Promise<string> {
      const {
        key,
        priority = 0,
        delay,
        runAt,
        attempts = defaultMaxAttempts,
        backoff = defaultBackoff,
        replace,
        initialStages,
        metadata,
      } = options;

      const id = generateJobId();
      const now = new Date();

      // Calculate scheduledFor from delay or runAt
      let scheduledFor: Date | null = null;
      if (runAt) {
        scheduledFor = runAt;
      } else if (delay && delay > 0) {
        scheduledFor = new Date(now.getTime() + delay);
      }

      // Initialize stages if provided
      const stages = initialStages ? initializeStages(initialStages) : null;

      const jobValues = {
        id,
        queue,
        key: key || null,
        data,
        status: "pending" as const,
        priority,
        scheduledFor,
        attempts: 0,
        maxAttempts: attempts,
        backoffMs: backoff.delay,
        backoffType: backoff.type,
        createdAt: now,
        updatedAt: now,
        // Multi-stage progress tracking
        stages,
        currentStage: null,
        overallProgress: 0,
        metadata: metadata || null,
      };

      try {
        let actualId: string;

        if (!key) {
          // No key - simple insert (ignore replace option)
          await (db as any).insert(queueJobs).values(jobValues);
          actualId = id;

          logger.debug({ queue, id: actualId }, "Job enqueued");
        } else if (replace === "if_not_active") {
          // Conditional replace - check job state before replacing
          actualId = await enqueueIfNotActive(
            db,
            queueJobs,
            queue,
            key,
            jobValues,
            logger,
          );
        } else {
          // Default: blind upsert (backward compatible)
          const [result] = await (db as any)
            .insert(queueJobs)
            .values(jobValues)
            .onConflictDoUpdate({
              target: [queueJobs.queue, queueJobs.key],
              set: {
                data: sql`EXCLUDED.data`,
                status: sql`'pending'`,
                priority: sql`EXCLUDED.priority`,
                scheduledFor: sql`EXCLUDED.scheduled_for`,
                attempts: 0,
                maxAttempts: sql`EXCLUDED.max_attempts`,
                backoffMs: sql`EXCLUDED.backoff_ms`,
                backoffType: sql`EXCLUDED.backoff_type`,
                nextRetryAt: null,
                errorMessage: null,
                errorDetails: null,
                lockedBy: null,
                lockedAt: null,
                expiresAt: null,
                updatedAt: now,
              },
            })
            .returning({ id: queueJobs.id });

          actualId = result.id;

          logger.debug({ queue, key, id: actualId }, "Job enqueued (upsert)");
        }

        // Notify waiting workers
        if (notifyEmitter) {
          await notifyEmitter.emit(queue);
        }

        return actualId;
      } catch (error) {
        // Re-throw JobAlreadyActiveError without wrapping
        if (error instanceof JobAlreadyActiveError) {
          throw error;
        }
        logger.error(
          {
            queue,
            key,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to enqueue job",
        );
        throw error;
      }
    },

    /**
     * Cancel a pending job
     */
    async cancel(jobIdOrKey: string): Promise<boolean> {
      try {
        // Try to find by ID first, then by key
        const result = await (db as any)
          .update(queueJobs)
          .set({
            status: "failed",
            errorMessage: "Cancelled",
            completedAt: new Date(),
            lockedBy: null,
            lockedAt: null,
            expiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              or(eq(queueJobs.id, jobIdOrKey), eq(queueJobs.key, jobIdOrKey)),
              // Can only cancel pending/retry_pending jobs
              or(
                eq(queueJobs.status, "pending"),
                eq(queueJobs.status, "retry_pending"),
              ),
            ),
          )
          .returning({ id: queueJobs.id });

        const cancelled = result.length > 0;

        if (cancelled) {
          logger.info({ jobIdOrKey }, "Job cancelled");
        } else {
          logger.debug({ jobIdOrKey }, "Job not found or not cancellable");
        }

        return cancelled;
      } catch (error) {
        logger.error(
          {
            jobIdOrKey,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to cancel job",
        );
        throw error;
      }
    },

    /**
     * Retry a failed job
     */
    async retry(jobIdOrKey: string): Promise<boolean> {
      try {
        const result = await (db as any)
          .update(queueJobs)
          .set({
            status: "pending",
            attempts: 0,
            nextRetryAt: null,
            errorMessage: null,
            errorDetails: null,
            completedAt: null,
            lockedBy: null,
            lockedAt: null,
            expiresAt: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              or(eq(queueJobs.id, jobIdOrKey), eq(queueJobs.key, jobIdOrKey)),
              // Can only retry failed jobs
              eq(queueJobs.status, "failed"),
            ),
          )
          .returning({ id: queueJobs.id });

        const retried = result.length > 0;

        if (retried) {
          logger.info({ jobIdOrKey }, "Job retried");

          // Notify waiting workers
          if (notifyEmitter) {
            // Get the queue name to notify the right queue
            const [job] = await (db as any)
              .select({ queue: queueJobs.queue })
              .from(queueJobs)
              .where(eq(queueJobs.id, result[0].id))
              .limit(1);

            if (job) {
              await notifyEmitter.emit(job.queue);
            }
          }
        } else {
          logger.debug({ jobIdOrKey }, "Job not found or not retryable");
        }

        return retried;
      } catch (error) {
        logger.error(
          {
            jobIdOrKey,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to retry job",
        );
        throw error;
      }
    },

    /**
     * Get job by ID or key
     */
    async getJob(jobIdOrKey: string): Promise<Job | null> {
      try {
        const [row] = await (db as any)
          .select()
          .from(queueJobs)
          .where(
            or(eq(queueJobs.id, jobIdOrKey), eq(queueJobs.key, jobIdOrKey)),
          )
          .limit(1);

        if (!row) {
          return null;
        }

        return formatJob(row);
      } catch (error) {
        logger.error(
          {
            jobIdOrKey,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to get job",
        );
        throw error;
      }
    },

    /**
     * Get queue statistics
     */
    async stats(queue?: string): Promise<QueueStats> {
      try {
        const conditions = queue ? eq(queueJobs.queue, queue) : undefined;

        const results = await (db as any)
          .select({
            status: queueJobs.status,
            count: count(),
          })
          .from(queueJobs)
          .where(conditions)
          .groupBy(queueJobs.status);

        const stats: QueueStats = {
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          retryPending: 0,
        };

        for (const row of results) {
          switch (row.status) {
            case "pending":
              stats.pending = Number(row.count);
              break;
            case "processing":
              stats.processing = Number(row.count);
              break;
            case "completed":
              stats.completed = Number(row.count);
              break;
            case "failed":
              stats.failed = Number(row.count);
              break;
            case "retry_pending":
              stats.retryPending = Number(row.count);
              break;
          }
        }

        return stats;
      } catch (error) {
        logger.error(
          {
            queue,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to get stats",
        );
        throw error;
      }
    },

    /**
     * Close the client
     */
    async close(): Promise<void> {
      if (notifyEmitter) {
        await notifyEmitter.close();
      }
      logger.debug({}, "Database queue client closed");
    },
  };
}

/**
 * Mark a job as completed
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param jobId - Job ID
 * @param workerId - Worker ID that owns the lock
 * @param lockToken - Fencing token that was set when the job was claimed
 * @param logger - Logger instance
 * @returns true if the job was marked completed, false if lock was lost
 */
export async function markJobCompleted(
  db: any,
  queueJobs: any,
  jobId: string,
  workerId: string,
  lockToken: string,
  logger: any,
): Promise<boolean> {
  const result = await db
    .update(queueJobs)
    .set({
      status: "completed",
      completedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      expiresAt: null,
      lockToken: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(queueJobs.id, jobId),
        eq(queueJobs.lockedBy, workerId),
        eq(queueJobs.lockToken, lockToken),
        eq(queueJobs.status, "processing"),
      ),
    )
    .returning({ id: queueJobs.id });

  const success = result.length > 0;

  if (success) {
    logger.debug({ jobId, workerId }, "Job completed");
  } else {
    logger.warn(
      { jobId, workerId },
      "Failed to mark job completed - lock lost",
    );
  }

  return success;
}

/**
 * Mark a job as failed, handling retry logic
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param jobId - Job ID
 * @param workerId - Worker ID that owns the lock
 * @param lockToken - Fencing token that was set when the job was claimed
 * @param error - The error that caused the failure
 * @param logger - Logger instance
 * @returns true if the job was marked failed, false if lock was lost
 */
export async function markJobFailed(
  db: any,
  queueJobs: any,
  jobId: string,
  workerId: string,
  lockToken: string,
  error: Error,
  logger: any,
): Promise<boolean> {
  // Build ownership WHERE clause
  const ownershipCondition = and(
    eq(queueJobs.id, jobId),
    eq(queueJobs.lockedBy, workerId),
    eq(queueJobs.lockToken, lockToken),
    eq(queueJobs.status, "processing"),
  );

  // Get current job state (with ownership verification)
  const [job] = await db
    .select()
    .from(queueJobs)
    .where(ownershipCondition)
    .limit(1);

  if (!job) {
    logger.warn(
      { jobId, workerId },
      "Job not found or lock lost when marking failed",
    );
    return false;
  }

  const now = new Date();

  // Handle rate limit errors - reschedule without counting attempt
  if (isRateLimitError(error)) {
    const rateLimitError = error as RateLimitError;
    const scheduledFor = new Date(now.getTime() + rateLimitError.retryAfter);

    const result = await db
      .update(queueJobs)
      .set({
        status: "pending",
        scheduledFor,
        // Don't increment attempts - rate limit is not a failure
        attempts: sql`${queueJobs.attempts} - 1`,
        lockedBy: null,
        lockedAt: null,
        expiresAt: null,
        lockToken: null,
        updatedAt: now,
      })
      .where(ownershipCondition)
      .returning({ id: queueJobs.id });

    if (result.length === 0) {
      logger.warn({ jobId, workerId }, "Lock lost while marking rate-limited");
      return false;
    }

    logger.info(
      { jobId, retryAfter: rateLimitError.retryAfter },
      "Job rescheduled (rate limited)",
    );
    return true;
  }

  // Handle permanent errors - fail immediately
  if (isPermanentError(error)) {
    const result = await db
      .update(queueJobs)
      .set({
        status: "failed",
        errorMessage: error.message,
        completedAt: now,
        lockedBy: null,
        lockedAt: null,
        expiresAt: null,
        lockToken: null,
        updatedAt: now,
      })
      .where(ownershipCondition)
      .returning({ id: queueJobs.id });

    if (result.length === 0) {
      logger.warn(
        { jobId, workerId },
        "Lock lost while marking permanent failure",
      );
      return false;
    }

    logger.info({ jobId }, "Job failed permanently");
    return true;
  }

  // Check if retries exhausted
  if (job.attempts >= job.maxAttempts) {
    const result = await db
      .update(queueJobs)
      .set({
        status: "failed",
        errorMessage: error.message,
        completedAt: now,
        lockedBy: null,
        lockedAt: null,
        expiresAt: null,
        lockToken: null,
        updatedAt: now,
      })
      .where(ownershipCondition)
      .returning({ id: queueJobs.id });

    if (result.length === 0) {
      logger.warn(
        { jobId, workerId },
        "Lock lost while marking retries exhausted",
      );
      return false;
    }

    logger.info(
      { jobId, attempts: job.attempts },
      "Job failed (retries exhausted)",
    );
    return true;
  }

  // Schedule retry with backoff
  const backoffStrategy: BackoffStrategy = {
    type:
      (job.backoffType as "exponential" | "linear" | "fixed") || "exponential",
    delay: job.backoffMs || 1000,
  };
  const backoffMs = calculateBackoff(job.attempts, backoffStrategy);
  const nextRetryAt = new Date(now.getTime() + backoffMs);

  const result = await db
    .update(queueJobs)
    .set({
      status: "retry_pending",
      nextRetryAt,
      errorMessage: error.message,
      lockedBy: null,
      lockedAt: null,
      expiresAt: null,
      lockToken: null,
      updatedAt: now,
    })
    .where(ownershipCondition)
    .returning({ id: queueJobs.id });

  if (result.length === 0) {
    logger.warn({ jobId, workerId }, "Lock lost while scheduling retry");
    return false;
  }

  logger.info(
    { jobId, attempts: job.attempts, nextRetryAt, backoffMs },
    "Job scheduled for retry",
  );
  return true;
}

/**
 * Extend job lock (heartbeat)
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param jobId - Job ID
 * @param workerId - Worker ID that owns the lock
 * @param lockToken - Fencing token that was set when the job was claimed
 * @param lockDuration - New lock duration in milliseconds
 * @param logger - Logger instance
 * @returns true if the lock was extended, false if lock was lost
 */
export async function extendJobLock(
  db: any,
  queueJobs: any,
  jobId: string,
  workerId: string,
  lockToken: string,
  lockDuration: number,
  logger: any,
): Promise<boolean> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + lockDuration);

  const result = await db
    .update(queueJobs)
    .set({
      expiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(queueJobs.id, jobId),
        eq(queueJobs.lockedBy, workerId),
        eq(queueJobs.lockToken, lockToken),
        eq(queueJobs.status, "processing"),
      ),
    )
    .returning({ id: queueJobs.id });

  const extended = result.length > 0;

  if (extended) {
    logger.debug({ jobId, workerId }, "Job lock extended");
  } else {
    logger.warn({ jobId, workerId }, "Failed to extend job lock");
  }

  return extended;
}

/**
 * Format database row to Job interface
 */
function formatJob(row: any): Job {
  // Parse stages if stored as JSON string (SQLite) or already an array (PostgreSQL)
  let stages: JobStage[] | undefined;
  if (row.stages) {
    const parsedStages =
      typeof row.stages === "string" ? JSON.parse(row.stages) : row.stages;
    // Convert date strings to Date objects in stages
    if (Array.isArray(parsedStages)) {
      stages = parsedStages.map((stage: any) => ({
        ...stage,
        startedAt: stage.startedAt ? new Date(stage.startedAt) : undefined,
        completedAt: stage.completedAt
          ? new Date(stage.completedAt)
          : undefined,
      }));
    }
  }

  // Parse metadata if stored as JSON string
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata) {
    metadata =
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : row.metadata;
  }

  return {
    id: row.id,
    key: row.key || undefined,
    queue: row.queue,
    data: row.data,
    status: row.status,
    priority: row.priority,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt),
    scheduledFor: row.scheduledFor
      ? row.scheduledFor instanceof Date
        ? row.scheduledFor
        : new Date(row.scheduledFor)
      : undefined,
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt),
    // Multi-stage progress tracking
    stages,
    currentStage: row.currentStage || undefined,
    overallProgress: row.overallProgress ?? undefined,
    metadata,
  };
}

/**
 * Enqueue a job with conditional replace semantics (if_not_active)
 *
 * Algorithm:
 * 1. Try conditional UPDATE where status IN ('pending', 'retry_pending')
 * 2. If rows updated → return existing job ID
 * 3. If no rows updated → SELECT to check what exists:
 *    - If 'processing' → throw JobAlreadyActiveError
 *    - If terminal ('completed'/'failed') → DELETE old, INSERT fresh
 *    - If nothing → INSERT new job
 */
async function enqueueIfNotActive(
  db: any,
  queueJobs: any,
  queue: string,
  key: string,
  jobValues: any,
  logger: any,
): Promise<string> {
  const now = new Date();

  // Step 1: Try conditional UPDATE (only for pending/retry_pending)
  const updateResult = await db
    .update(queueJobs)
    .set({
      data: jobValues.data,
      status: "pending",
      priority: jobValues.priority,
      scheduledFor: jobValues.scheduledFor,
      attempts: 0,
      maxAttempts: jobValues.maxAttempts,
      backoffMs: jobValues.backoffMs,
      backoffType: jobValues.backoffType,
      nextRetryAt: null,
      errorMessage: null,
      errorDetails: null,
      lockedBy: null,
      lockedAt: null,
      expiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(queueJobs.queue, queue),
        eq(queueJobs.key, key),
        or(
          eq(queueJobs.status, "pending"),
          eq(queueJobs.status, "retry_pending"),
        ),
      ),
    )
    .returning({ id: queueJobs.id });

  if (updateResult.length > 0) {
    // Updated existing pending/retry_pending job
    logger.debug(
      { queue, key, id: updateResult[0].id },
      "Job enqueued (replaced pending)",
    );
    return updateResult[0].id;
  }

  // Step 2: No update - check if job exists
  const [existing] = await db
    .select({ id: queueJobs.id, status: queueJobs.status })
    .from(queueJobs)
    .where(and(eq(queueJobs.queue, queue), eq(queueJobs.key, key)))
    .limit(1);

  if (!existing) {
    // No job exists - insert new
    await db.insert(queueJobs).values(jobValues);
    logger.debug({ queue, key, id: jobValues.id }, "Job enqueued (new)");
    return jobValues.id;
  }

  // Step 3: Job exists - check status
  if (existing.status === "processing") {
    // Job is actively being processed - throw error
    throw new JobAlreadyActiveError(queue, key, existing.id);
  }

  // Terminal state (completed/failed) - delete old, insert fresh
  await db.delete(queueJobs).where(eq(queueJobs.id, existing.id));
  await db.insert(queueJobs).values(jobValues);

  logger.debug(
    { queue, key, id: jobValues.id, previousStatus: existing.status },
    "Job enqueued (replaced terminal)",
  );
  return jobValues.id;
}

/**
 * Update job stages (used by worker for progress tracking)
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param jobId - Job ID
 * @param workerId - Worker ID that owns the lock
 * @param lockToken - Fencing token that was set when the job was claimed
 * @param stages - Updated stages array
 * @param currentStage - Name of the stage currently being processed
 * @param logger - Logger instance
 * @returns true if stages were updated, false if lock was lost
 */
export async function updateJobStages(
  db: any,
  queueJobs: any,
  jobId: string,
  workerId: string,
  lockToken: string,
  stages: JobStage[],
  currentStage: string | null,
  logger: any,
): Promise<boolean> {
  const overallProgress = calculateOverallProgress(stages);

  const result = await db
    .update(queueJobs)
    .set({
      stages,
      currentStage,
      overallProgress,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(queueJobs.id, jobId),
        eq(queueJobs.lockedBy, workerId),
        eq(queueJobs.lockToken, lockToken),
        eq(queueJobs.status, "processing"),
      ),
    )
    .returning({ id: queueJobs.id });

  const updated = result.length > 0;

  if (!updated) {
    logger.warn({ jobId, workerId }, "Failed to update job stages - lock lost");
  }

  return updated;
}

/**
 * Get job stages (used by worker to read current stage state)
 *
 * @param db - Database instance
 * @param queueJobs - Queue jobs table
 * @param jobId - Job ID
 * @returns Current stages array or null if job not found
 */
export async function getJobStages(
  db: any,
  queueJobs: any,
  jobId: string,
): Promise<JobStage[] | null> {
  const [row] = await db
    .select({ stages: queueJobs.stages })
    .from(queueJobs)
    .where(eq(queueJobs.id, jobId))
    .limit(1);

  if (!row || !row.stages) {
    return null;
  }

  const stages =
    typeof row.stages === "string" ? JSON.parse(row.stages) : row.stages;

  // Convert date strings to Date objects
  return stages.map((stage: any) => ({
    ...stage,
    startedAt: stage.startedAt ? new Date(stage.startedAt) : undefined,
    completedAt: stage.completedAt ? new Date(stage.completedAt) : undefined,
  }));
}
