/**
 * @eclaire/queue/driver-bullmq - BullMQ QueueClient implementation
 */

import { Queue, type JobsOptions } from "bullmq";
import type { Redis } from "ioredis";
import type {
  QueueClient,
  QueueStats,
  Job,
  JobOptions,
  BackoffStrategy,
} from "../core/types.js";
import { DEFAULT_BACKOFF } from "../core/utils.js";
import type { BullMQClientConfig } from "./types.js";
import { createRedisConnection, closeRedisConnection } from "./connection.js";

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
    if (backoff) {
      bullmqOptions.backoff = {
        type: backoff.type,
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
     */
    async enqueue<T>(
      name: string,
      data: T,
      options: JobOptions = {},
    ): Promise<string> {
      const queue = getQueue(name);
      const bullmqOptions = toBullMQOptions(options);

      try {
        const job = await queue.add(name, data, bullmqOptions);
        logger.debug({ name, jobId: job.id, key: options.key }, "Job enqueued");
        return job.id!;
      } catch (error) {
        logger.error(
          {
            name,
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
      for (const [name, queue] of queues) {
        try {
          const job = await queue.getJob(jobIdOrKey);
          if (job) {
            const state = await job.getState();
            if (state === "waiting" || state === "delayed") {
              await job.remove();
              logger.info({ jobId: jobIdOrKey, queue: name }, "Job cancelled");
              return true;
            }
          }
        } catch (error) {
          // Ignore errors and try next queue
        }
      }

      logger.debug({ jobIdOrKey }, "Job not found or not cancellable");
      return false;
    },

    /**
     * Retry a failed job
     */
    async retry(jobIdOrKey: string): Promise<boolean> {
      for (const [name, queue] of queues) {
        try {
          const job = await queue.getJob(jobIdOrKey);
          if (job) {
            const state = await job.getState();
            if (state === "failed") {
              await job.retry();
              logger.info({ jobId: jobIdOrKey, queue: name }, "Job retried");
              return true;
            }
          }
        } catch (error) {
          // Ignore errors and try next queue
        }
      }

      logger.debug({ jobIdOrKey }, "Job not found or not retryable");
      return false;
    },

    /**
     * Get job by ID or key
     */
    async getJob(jobIdOrKey: string): Promise<Job | null> {
      for (const [_, queue] of queues) {
        try {
          const bullmqJob = await queue.getJob(jobIdOrKey);
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

            return {
              id: bullmqJob.id!,
              key: bullmqJob.id, // BullMQ uses jobId for key
              name: bullmqJob.name,
              data: bullmqJob.data,
              status,
              priority: bullmqJob.opts.priority || 0,
              attempts: bullmqJob.attemptsMade,
              maxAttempts: bullmqJob.opts.attempts || defaultMaxAttempts,
              createdAt: new Date(bullmqJob.timestamp),
              scheduledFor: bullmqJob.opts.delay
                ? new Date(bullmqJob.timestamp + bullmqJob.opts.delay)
                : undefined,
              updatedAt: new Date(bullmqJob.processedOn || bullmqJob.timestamp),
            };
          }
        } catch (error) {
          // Ignore errors and try next queue
        }
      }

      return null;
    },

    /**
     * Get queue statistics
     */
    async stats(name?: string): Promise<QueueStats> {
      const stats: QueueStats = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retryPending: 0,
      };

      const queuesToCheck = name ? [queues.get(name)].filter(Boolean) : Array.from(queues.values());

      for (const queue of queuesToCheck) {
        if (!queue) continue;

        try {
          const counts = await queue.getJobCounts(
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
          // BullMQ doesn't have a separate retry_pending state
          // Delayed jobs after failure are still in "delayed"
        } catch (error) {
          logger.error(
            {
              queue: queue.name,
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
      for (const [name, queue] of queues) {
        try {
          await queue.close();
          logger.debug({ name }, "BullMQ queue closed");
        } catch (error) {
          logger.error(
            { name, error: error instanceof Error ? error.message : "Unknown" },
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
