/**
 * @eclaire/queue/driver-bullmq - BullMQ QueueClient implementation
 */

import { type JobsOptions, Queue } from "bullmq";
import { JobAlreadyActiveError } from "../core/errors.js";
import { initializeStages } from "../core/progress.js";
import type {
  Job,
  JobOptions,
  QueueClient,
  QueueStats,
} from "../core/types.js";
import { DEFAULT_BACKOFF } from "../core/utils.js";
import { closeRedisConnection, createRedisConnection } from "./connection.js";
import type { BullMQClientConfig } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  prefix: "queue",
  maxAttempts: 3,
  backoff: DEFAULT_BACKOFF,
};

/**
 * Create a BullMQ-backed QueueClient
 *
 * @param config - Client configuration
 * @returns QueueClient implementation
 */
export function createBullMQClient(config: BullMQClientConfig): QueueClient {
  const {
    redis,
    logger,
    prefix = DEFAULTS.prefix,
    defaultBackoff = DEFAULTS.backoff,
    defaultMaxAttempts = DEFAULTS.maxAttempts,
  } = config;

  // Create Redis connection
  const connection = createRedisConnection(redis, logger);

  // Cache of Queue instances by name
  const queues = new Map<string, Queue>();

  /**
   * Get or create a Queue instance for a given name
   */
  function getQueue(name: string): Queue {
    let queue = queues.get(name);
    if (!queue) {
      queue = new Queue(name, {
        connection,
        prefix,
      });
      queues.set(name, queue);
      logger.debug({ name, prefix }, "BullMQ queue created");
    }
    return queue;
  }

  /**
   * Convert our JobOptions to BullMQ JobsOptions
   */
  function toBullMQOptions(options: JobOptions = {}): JobsOptions {
    const {
      key,
      priority,
      delay,
      runAt,
      attempts = defaultMaxAttempts,
      backoff = defaultBackoff,
    } = options;

    const bullmqOptions: JobsOptions = {
      priority,
      attempts,
    };

    // Set job ID for idempotency
    if (key) {
      bullmqOptions.jobId = key;
    }

    // Calculate delay
    if (runAt) {
      bullmqOptions.delay = Math.max(0, runAt.getTime() - Date.now());
    } else if (delay && delay > 0) {
      bullmqOptions.delay = delay;
    }

    // Set backoff strategy
    // Note: BullMQ only supports "exponential" and "fixed", not "linear".
    // Map "linear" to "fixed" as the closest approximation.
    if (backoff) {
      const bullmqBackoffType =
        backoff.type === "linear" ? "fixed" : backoff.type;
      bullmqOptions.backoff = {
        type: bullmqBackoffType,
        delay: backoff.delay,
      };
    }

    // Remove completed/failed jobs after some time to prevent memory bloat
    bullmqOptions.removeOnComplete = {
      age: 3600, // 1 hour
      count: 1000, // Keep at most 1000 completed jobs
    };
    bullmqOptions.removeOnFail = {
      age: 86400, // 24 hours
      count: 5000, // Keep at most 5000 failed jobs
    };

    return bullmqOptions;
  }

  return {
    /**
     * Enqueue a job
     *
     * When `options.replace` is 'if_not_active' and a job with the same key exists:
     * - If job is 'active' (processing): throws JobAlreadyActiveError
     * - If job is 'waiting'/'delayed'/'completed'/'failed': removes and recreates
     *
     * Race condition handling:
     * - If job becomes 'active' between check and remove/add, we detect this
     *   and throw JobAlreadyActiveError (not a generic BullMQ error).
     * - Only handles common states (waiting/delayed/completed/failed/active).
     *   Other BullMQ states (paused, waiting-children, etc.) are not removed,
     *   which may cause "job already exists" errors.
     */
    async enqueue<T>(
      queue: string,
      data: T,
      options: JobOptions = {},
    ): Promise<string> {
      const bullmqQueue = getQueue(queue);
      const bullmqOptions = toBullMQOptions(options);

      try {
        // Handle replace: 'if_not_active' semantics
        if (options.replace === "if_not_active" && options.key) {
          const existing = await bullmqQueue.getJob(options.key);
          if (existing) {
            const state = await existing.getState();
            if (state === "active") {
              throw new JobAlreadyActiveError(queue, options.key, existing.id!);
            }
            // Remove non-active jobs so we can recreate with new data.
            // BullMQ doesn't allow adding a job with an existing ID, even for
            // completed/failed jobs (they remain due to retention settings).
            // This matches DB semantics where terminal states are treated as "no job exists".
            // Note: We only handle common states. Other BullMQ states (paused, waiting-children)
            // are not handled and may cause "job already exists" errors on enqueue.
            if (
              state === "waiting" ||
              state === "delayed" ||
              state === "completed" ||
              state === "failed"
            ) {
              try {
                await existing.remove();
              } catch (removeError) {
                // Race condition: job may have become active between state check and remove.
                // Re-check state and throw JobAlreadyActiveError if now active.
                const newState = await existing
                  .getState()
                  .catch(() => "unknown");
                if (newState === "active") {
                  throw new JobAlreadyActiveError(
                    queue,
                    options.key,
                    existing.id!,
                  );
                }
                // Not a race to active state, re-throw original error
                throw removeError;
              }
            }
          }
        }

        // Wrap data with stage/metadata fields if provided (matches DB driver behavior)
        const { initialStages, metadata } = options;
        const wrappedData = {
          ...data,
          ...(initialStages && {
            __stages: initializeStages(initialStages),
            __currentStage: null,
          }),
          ...(metadata && { __metadata: metadata }),
        } as T;

        const job = await bullmqQueue.add(queue, wrappedData, bullmqOptions);
        logger.debug(
          { queue, jobId: job.id, key: options.key },
          "Job enqueued",
        );
        return job.id!;
      } catch (error) {
        // Re-throw JobAlreadyActiveError as-is
        if (error instanceof JobAlreadyActiveError) {
          throw error;
        }

        // Race condition on add: job may have been re-added and become active
        // between our remove and add. Check if the error is "job already exists"
        // and if the job is now active.
        if (
          options.replace === "if_not_active" &&
          options.key &&
          error instanceof Error &&
          error.message.includes("already exists")
        ) {
          try {
            const racedJob = await bullmqQueue.getJob(options.key);
            if (racedJob) {
              const racedState = await racedJob.getState();
              if (racedState === "active") {
                throw new JobAlreadyActiveError(
                  queue,
                  options.key,
                  racedJob.id!,
                );
              }
            }
          } catch (checkError) {
            // If this is our JobAlreadyActiveError, throw it
            if (checkError instanceof JobAlreadyActiveError) {
              throw checkError;
            }
            // Otherwise fall through to throw original error
          }
        }

        logger.error(
          {
            queue,
            key: options.key,
            error: error instanceof Error ? error.message : "Unknown",
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
      // We need to find which queue the job is in
      // BullMQ doesn't provide a way to look up jobs across queues
      // So we try each known queue
      for (const [queueName, bullmqQueue] of queues) {
        try {
          const job = await bullmqQueue.getJob(jobIdOrKey);
          if (job) {
            const state = await job.getState();
            if (state === "waiting" || state === "delayed") {
              await job.remove();
              logger.info(
                { jobId: jobIdOrKey, queue: queueName },
                "Job cancelled",
              );
              return true;
            }
          }
        } catch (error) {
          logger.debug(
            {
              queue: queueName,
              jobIdOrKey,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Queue lookup error during cancel",
          );
        }
      }

      logger.debug({ jobIdOrKey }, "Job not found or not cancellable");
      return false;
    },

    /**
     * Retry a failed job
     */
    async retry(jobIdOrKey: string): Promise<boolean> {
      for (const [queueName, bullmqQueue] of queues) {
        try {
          const job = await bullmqQueue.getJob(jobIdOrKey);
          if (job) {
            const state = await job.getState();
            if (state === "failed") {
              await job.retry();
              logger.info(
                { jobId: jobIdOrKey, queue: queueName },
                "Job retried",
              );
              return true;
            }
          }
        } catch (error) {
          logger.debug(
            {
              queue: queueName,
              jobIdOrKey,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Queue lookup error during retry",
          );
        }
      }

      logger.debug({ jobIdOrKey }, "Job not found or not retryable");
      return false;
    },

    /**
     * Get job by ID or key
     */
    async getJob(jobIdOrKey: string): Promise<Job | null> {
      for (const [queueName, bullmqQueue] of queues) {
        try {
          const bullmqJob = await bullmqQueue.getJob(jobIdOrKey);
          if (bullmqJob) {
            // Map BullMQ state to our JobStatus
            const state = await bullmqJob.getState();
            const statusMap: Record<string, Job["status"]> = {
              waiting: "pending",
              delayed: "pending",
              active: "processing",
              completed: "completed",
              failed: "failed",
            };
            const status = statusMap[state] || "pending";

            // Normalize attempts to match DB driver semantics:
            // - DB increments attempts at claim time (first processing = 1)
            // - BullMQ's attemptsMade is 0 until first processing completes
            // - For pending jobs (waiting/delayed), report attemptsMade directly
            // - For jobs that have been processed, add +1 to match DB semantics
            const attempts =
              state === "waiting" || state === "delayed"
                ? bullmqJob.attemptsMade
                : bullmqJob.attemptsMade + 1;

            return {
              id: bullmqJob.id!,
              // Only set key if user originally provided one (via opts.jobId)
              key: bullmqJob.opts.jobId ? bullmqJob.id : undefined,
              queue: bullmqJob.name,
              data: bullmqJob.data,
              status,
              priority: bullmqJob.opts.priority || 0,
              attempts,
              maxAttempts: bullmqJob.opts.attempts || defaultMaxAttempts,
              createdAt: new Date(bullmqJob.timestamp),
              scheduledFor: bullmqJob.opts.delay
                ? new Date(bullmqJob.timestamp + bullmqJob.opts.delay)
                : undefined,
              updatedAt: new Date(bullmqJob.processedOn || bullmqJob.timestamp),
            };
          }
        } catch (error) {
          logger.debug(
            {
              queue: queueName,
              jobIdOrKey,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Queue lookup error during getJob",
          );
        }
      }

      return null;
    },

    /**
     * Get queue statistics
     */
    async stats(queue?: string): Promise<QueueStats> {
      const stats: QueueStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retryPending: 0,
      };

      const queuesToCheck = queue
        ? [queues.get(queue)].filter(Boolean)
        : Array.from(queues.values());

      for (const bullmqQueue of queuesToCheck) {
        if (!bullmqQueue) continue;

        try {
          const counts = await bullmqQueue.getJobCounts(
            "waiting",
            "active",
            "completed",
            "failed",
            "delayed",
          );

          stats.pending += counts.waiting + counts.delayed;
          stats.processing += counts.active;
          stats.completed += counts.completed;
          stats.failed += counts.failed;
          // Note: BullMQ doesn't distinguish 'retry_pending' from 'delayed'.
          // Jobs waiting for retry after failure are in 'delayed' state, same as
          // jobs scheduled for the future. Unlike the DB driver which tracks
          // retry_pending separately, BullMQ collapses these into 'delayed'.
          // retryPending will always be 0 for BullMQ - this is a known limitation.
        } catch (error) {
          logger.error(
            {
              queue: bullmqQueue.name,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Failed to get queue stats",
          );
        }
      }

      return stats;
    },

    /**
     * Close the client
     */
    async close(): Promise<void> {
      // Close all queues
      for (const [queueName, bullmqQueue] of queues) {
        try {
          await bullmqQueue.close();
          logger.debug({ queue: queueName }, "BullMQ queue closed");
        } catch (error) {
          logger.error(
            {
              queue: queueName,
              error: error instanceof Error ? error.message : "Unknown",
            },
            "Error closing queue",
          );
        }
      }
      queues.clear();

      // Close Redis connection
      await closeRedisConnection(connection, logger);
      logger.debug({}, "BullMQ client closed");
    },
  };
}
