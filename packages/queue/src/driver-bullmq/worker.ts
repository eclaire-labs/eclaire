/**
 * @eclaire/queue/driver-bullmq - BullMQ Worker implementation
 */

import {
  Worker as BullMQWorker,
  DelayedError,
  UnrecoverableError,
  type Job as BullMQJob,
  type WorkerOptions as BullMQWorkerOptions,
} from "bullmq";
import type {
  Worker,
  WorkerOptions,
  JobHandler,
  JobContext,
  Job,
  JobStage,
  JobEventCallbacks,
} from "../core/types.js";
import {
  RateLimitError,
  isRateLimitError,
  isPermanentError,
} from "../core/errors.js";
import { DEFAULT_BACKOFF } from "../core/utils.js";
import {
  initializeStages,
  startStageInList,
  completeStageInList,
  failStageInList,
  updateStageProgressInList,
  addStagesToList,
  calculateOverallProgress,
} from "../core/progress.js";
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
 * @param queue - Queue name to process
 * @param handler - Job handler function
 * @param config - Worker configuration
 * @param options - Worker options
 * @returns Worker instance
 */
export function createBullMQWorker<T = unknown>(
  queue: string,
  handler: JobHandler<T>,
  config: BullMQWorkerConfig,
  options: WorkerOptions = {},
): Worker {
  const {
    redis,
    logger,
    prefix = DEFAULTS.prefix,
    eventCallbacks,
    bullmqOptions,
    wrapJobExecution,
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
   * Extended job data interface for stage tracking
   * We store stages in the job data itself
   */
  interface ExtendedJobData {
    __stages?: JobStage[];
    __currentStage?: string;
    __metadata?: Record<string, unknown>;
    /** Request ID propagated from the HTTP request that triggered this job */
    requestId?: string;
    [key: string]: unknown;
  }

  /**
   * Convert BullMQ job to our Job interface
   */
  function toJob(bullmqJob: BullMQJob<T>): Job<T> {
    const data = bullmqJob.data as ExtendedJobData;
    return {
      id: bullmqJob.id!,
      // Only set key if user originally provided one (via opts.jobId)
      key: bullmqJob.opts.jobId ? bullmqJob.id : undefined,
      queue: bullmqJob.name,
      data: bullmqJob.data,
      status: "processing", // Job is being processed by the worker
      priority: bullmqJob.opts.priority || 0,
      // Normalize to 1-based: first attempt = 1 (matches DB driver)
      attempts: bullmqJob.attemptsMade + 1,
      maxAttempts: bullmqJob.opts.attempts || 3,
      createdAt: new Date(bullmqJob.timestamp),
      scheduledFor: bullmqJob.opts.delay
        ? new Date(bullmqJob.timestamp + bullmqJob.opts.delay)
        : undefined,
      updatedAt: new Date(bullmqJob.processedOn || bullmqJob.timestamp),
      // Multi-stage progress tracking (stored in job data)
      stages: data.__stages,
      currentStage: data.__currentStage,
      overallProgress: data.__stages ? calculateOverallProgress(data.__stages) : undefined,
      metadata: data.__metadata,
    };
  }

  /**
   * Process a job
   */
  async function processJob(bullmqJob: BullMQJob<T>): Promise<void> {
    const job = toJob(bullmqJob);
    const jobData = bullmqJob.data as ExtendedJobData;

    // Extract requestId from job data (propagated from HTTP request)
    const requestId = jobData.requestId;

    // Core job execution logic
    const executeJob = async (): Promise<void> => {
      // Track current stages locally
      let currentStages: JobStage[] = jobData.__stages || [];
      const metadata = jobData.__metadata;

      // Helper to persist stage updates
      const persistStages = async (stages: JobStage[], currentStageName: string | null) => {
        currentStages = stages;
        job.stages = stages;
        job.currentStage = currentStageName || undefined;
        job.overallProgress = calculateOverallProgress(stages);

        // Update job data with new stages
        await bullmqJob.updateData({
          ...jobData,
          __stages: stages,
          __currentStage: currentStageName,
        } as T);

        // Update progress as overall percentage
        await bullmqJob.updateProgress(job.overallProgress);
      };

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
          eventCallbacks?.onStageProgress?.(job.id, job.currentStage || "", percent, metadata);
        },

        // Multi-stage progress tracking methods
        async initStages(stageNames: string[]) {
          const stages = initializeStages(stageNames);
          await persistStages(stages, null);
          logger.debug({ jobId: job.id, stages: stageNames }, "Job stages initialized");
        },

        async startStage(stageName: string) {
          const updatedStages = startStageInList(currentStages, stageName);
          await persistStages(updatedStages, stageName);
          logger.debug({ jobId: job.id, stage: stageName }, "Stage started");
          eventCallbacks?.onStageStart?.(job.id, stageName, metadata);
        },

        async updateStageProgress(stageName: string, percent: number) {
          // Lightweight operation - only update local state and emit event
          currentStages = updateStageProgressInList(currentStages, stageName, percent);
          job.stages = currentStages;
          job.overallProgress = calculateOverallProgress(currentStages);
          eventCallbacks?.onStageProgress?.(job.id, stageName, percent, metadata);
        },

        async completeStage(stageName: string, artifacts?: Record<string, unknown>) {
          const updatedStages = completeStageInList(currentStages, stageName, artifacts);
          await persistStages(updatedStages, null);
          logger.debug({ jobId: job.id, stage: stageName }, "Stage completed");
          await eventCallbacks?.onStageComplete?.(job.id, stageName, artifacts, metadata);
        },

        async failStage(stageName: string, error: Error) {
          const updatedStages = failStageInList(currentStages, stageName, error.message);
          await persistStages(updatedStages, null);
          logger.debug({ jobId: job.id, stage: stageName, error: error.message }, "Stage failed");
          eventCallbacks?.onStageFail?.(job.id, stageName, error.message, metadata);
        },

        async addStages(stageNames: string[]) {
          const updatedStages = addStagesToList(currentStages, stageNames);
          await persistStages(updatedStages, job.currentStage || null);
          logger.debug({ jobId: job.id, addedStages: stageNames }, "Stages added");
        },
      };

      try {
        await handler(ctx);
        // Call onJobComplete callback
        await eventCallbacks?.onJobComplete?.(job.id, metadata);
      } catch (error) {
        // Handle rate limit errors: reschedule just this job without consuming attempt
        // Note: We use moveToDelayed instead of worker.rateLimit() because rateLimit()
        // throttles the entire worker/queue, not just the delayed job. This matches
        // DB semantics where only the affected job is delayed.
        if (isRateLimitError(error)) {
          const rateLimitError = error as RateLimitError;
          const delayUntil = Date.now() + rateLimitError.retryAfter;
          // Move just this job to delayed state
          await bullmqJob.moveToDelayed(delayUntil, bullmqJob.token);
          // Throw DelayedError to signal completion without incrementing attempts
          throw new DelayedError(
            `Rate limited, retry after ${rateLimitError.retryAfter}ms`,
          );
        }

        // Handle permanent errors: fail immediately, no retries
        if (isPermanentError(error)) {
          throw new UnrecoverableError(
            error instanceof Error ? error.message : String(error),
          );
        }

        // RetryableError and generic errors: let BullMQ handle retry with backoff
        throw error;
      }
    };

    // Use wrapper if provided (e.g., for request tracing), otherwise execute directly
    if (wrapJobExecution) {
      return wrapJobExecution(requestId, executeJob);
    }
    return executeJob();
  }

  return {
    async start(): Promise<void> {
      if (worker) {
        logger.warn({ queue }, "Worker already running");
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
        // Spread any additional BullMQ-specific options (e.g., limiter)
        ...bullmqOptions,
      };

      worker = new BullMQWorker(queue, processJob, workerOptions);

      // Setup event handlers
      worker.on("completed", (job) => {
        logger.info(
          { jobId: job.id, queue: job.name, attempts: job.attemptsMade },
          "Job completed",
        );
      });

      worker.on("failed", (job, error) => {
        logger.error(
          {
            jobId: job?.id,
            queue: job?.name,
            attempts: job?.attemptsMade,
            error: error.message,
          },
          "Job failed",
        );
        // Call onJobFail callback if provided
        if (job) {
          const jobData = job.data as ExtendedJobData;
          eventCallbacks?.onJobFail?.(job.id!, error.message, jobData.__metadata);
        }
      });

      worker.on("error", (error) => {
        logger.error({ error: error.message }, "Worker error");
      });

      worker.on("stalled", (jobId) => {
        logger.warn({ jobId }, "Job stalled");
      });

      logger.info({ queue, concurrency, lockDuration }, "Worker started");
    },

    async stop(): Promise<void> {
      if (!worker) {
        return;
      }

      logger.info({ queue }, "Stopping worker...");

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
      logger.info({ queue }, "Worker stopped");
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
  queue: string,
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
    queue: string,
    handler: JobHandler<T>,
    options?: WorkerOptions,
  ): Worker => {
    return createBullMQWorker(queue, handler, config, options);
  };
}
