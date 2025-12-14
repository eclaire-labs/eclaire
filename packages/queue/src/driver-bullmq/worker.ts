/**
 * @eclaire/queue/driver-bullmq - BullMQ Worker implementation
 */

import {
  Worker as BullMQWorker,
  DelayedError,
  type Job as BullMQJob,
  type WorkerOptions as BullMQWorkerOptions,
} from "bullmq";
import type {
  Worker,
  WorkerOptions,
  JobHandler,
  JobContext,
  Job,
} from "../core/types.js";
import {
  RateLimitError,
  isRateLimitError,
} from "../core/errors.js";
import { DEFAULT_BACKOFF } from "../core/utils.js";
import type { BullMQWorkerConfig } from "./types.js";
import { createRedisConnection, closeRedisConnection } from "./connection.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  prefix: "queue",
  concurrency: 1,
  lockDuration: 300000, // 5 minutes
};

/**
 * Create a BullMQ-backed Worker
 *
 * @param name - Queue name to process
 * @param handler - Job handler function
 * @param config - Worker configuration
 * @param options - Worker options
 * @returns Worker instance
 */
export function createBullMQWorker<T = unknown>(
  name: string,
  handler: JobHandler<T>,
  config: BullMQWorkerConfig,
  options: WorkerOptions = {},
): Worker {
  const {
    redis,
    logger,
    prefix = DEFAULTS.prefix,
  } = config;

  const {
    concurrency = DEFAULTS.concurrency,
    lockDuration = DEFAULTS.lockDuration,
    stalledInterval = 30000,
  } = options;

  // Create Redis connection
  const connection = createRedisConnection(redis, logger);

  let worker: BullMQWorker | null = null;

  /**
   * Convert BullMQ job to our Job interface
   */
  function toJob(bullmqJob: BullMQJob<T>): Job<T> {
    return {
      id: bullmqJob.id!,
      key: bullmqJob.id,
      name: bullmqJob.name,
      data: bullmqJob.data,
      status: "processing", // Job is being processed by the worker
      priority: bullmqJob.opts.priority || 0,
      attempts: bullmqJob.attemptsMade,
      maxAttempts: bullmqJob.opts.attempts || 3,
      createdAt: new Date(bullmqJob.timestamp),
      scheduledFor: bullmqJob.opts.delay
        ? new Date(bullmqJob.timestamp + bullmqJob.opts.delay)
        : undefined,
      updatedAt: new Date(bullmqJob.processedOn || bullmqJob.timestamp),
    };
  }

  /**
   * Process a job
   */
  async function processJob(bullmqJob: BullMQJob<T>): Promise<void> {
    const job = toJob(bullmqJob);

    const ctx: JobContext<T> = {
      job,
      async heartbeat() {
        // BullMQ handles lock extension automatically via lockDuration
        // But we can update progress to show activity
        await bullmqJob.updateProgress(bullmqJob.progress || 0);
      },
      log(message: string) {
        bullmqJob.log(message);
        logger.info({ jobId: job.id }, message);
      },
      progress(percent: number) {
        bullmqJob.updateProgress(percent);
        logger.debug({ jobId: job.id, progress: percent }, "Job progress");
      },
    };

    try {
      await handler(ctx);
    } catch (error) {
      // Handle rate limit errors specially
      if (isRateLimitError(error)) {
        const rateLimitError = error as RateLimitError;
        // Set the delay for when the job can be retried
        await worker!.rateLimit(rateLimitError.retryAfter);
        // Throw DelayedError to move job to delayed state without incrementing attempts
        throw new DelayedError(
          `Rate limited, retry after ${rateLimitError.retryAfter}ms`,
        );
      }
      throw error;
    }
  }

  return {
    async start(): Promise<void> {
      if (worker) {
        logger.warn({ name }, "Worker already running");
        return;
      }

      const workerOptions: BullMQWorkerOptions = {
        connection,
        prefix,
        concurrency,
        lockDuration,
        stalledInterval,
        // Remove stalled jobs from the queue after lockDuration
        maxStalledCount: 1,
      };

      worker = new BullMQWorker(name, processJob, workerOptions);

      // Setup event handlers
      worker.on("completed", (job) => {
        logger.info(
          { jobId: job.id, name: job.name, attempts: job.attemptsMade },
          "Job completed",
        );
      });

      worker.on("failed", (job, error) => {
        logger.error(
          {
            jobId: job?.id,
            name: job?.name,
            attempts: job?.attemptsMade,
            error: error.message,
          },
          "Job failed",
        );
      });

      worker.on("error", (error) => {
        logger.error({ error: error.message }, "Worker error");
      });

      worker.on("stalled", (jobId) => {
        logger.warn({ jobId }, "Job stalled");
      });

      logger.info({ name, concurrency, lockDuration }, "Worker started");
    },

    async stop(): Promise<void> {
      if (!worker) {
        return;
      }

      logger.info({ name }, "Stopping worker...");

      try {
        await worker.close();
        worker = null;
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : "Unknown" },
          "Error stopping worker",
        );
      }

      // Close Redis connection
      await closeRedisConnection(connection, logger);
      logger.info({ name }, "Worker stopped");
    },

    isRunning(): boolean {
      return worker !== null;
    },
  };
}

/**
 * Factory function type for creating BullMQ workers
 */
export type BullMQWorkerFactory<T = unknown> = (
  name: string,
  handler: JobHandler<T>,
  options?: WorkerOptions,
) => Worker;

/**
 * Create a worker factory with pre-configured Redis connection
 *
 * @param config - Worker configuration
 * @returns Factory function for creating workers
 */
export function createBullMQWorkerFactory(
  config: BullMQWorkerConfig,
): BullMQWorkerFactory {
  return <T>(
    name: string,
    handler: JobHandler<T>,
    options?: WorkerOptions,
  ): Worker => {
    return createBullMQWorker(name, handler, config, options);
  };
}
