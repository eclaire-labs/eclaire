/**
 * @eclaire/queue/transport-http - HTTP poller for remote workers
 *
 * This module provides a Worker-compatible interface that uses HTTP
 * long-polling to process jobs from a remote backend.
 */

import { isRateLimitError, type RateLimitError } from "../core/errors.js";
import {
  addStagesToList,
  calculateOverallProgress,
  completeStageInList,
  failStageInList,
  initializeStages,
  startStageInList,
  updateStageProgressInList,
} from "../core/progress.js";
import type {
  Job,
  JobContext,
  JobHandler,
  JobStage,
  Worker,
  WorkerOptions,
} from "../core/types.js";
import {
  cancellableSleep,
  createDeferred,
  createWorkerId,
  sleep,
} from "../core/utils.js";
import { createHttpClient, type HttpQueueClient } from "./client.js";
import type { HttpJobResponse, HttpPollerConfig } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  waitTimeout: 30000, // 30 seconds
  heartbeatInterval: 60000, // 1 minute
  errorRetryDelay: 2000, // 2 seconds
  gracefulShutdownTimeout: 30000, // 30 seconds
};

/**
 * Create an HTTP-based worker that uses long-polling
 *
 * This worker connects to a remote backend via HTTP and processes
 * jobs without direct database access. It's useful for:
 * - Separating workers from the backend process
 * - Running workers in different containers/machines
 * - Processing jobs through a firewall/VPN
 *
 * @param queue - Queue name to process
 * @param handler - Job handler function
 * @param config - Poller configuration
 * @param options - Worker options
 * @returns Worker instance
 */
export function createHttpWorker<T = unknown>(
  queue: string,
  handler: JobHandler<T>,
  config: HttpPollerConfig,
  options: WorkerOptions = {},
): Worker {
  const {
    backendUrl,
    logger,
    workerId = createWorkerId(),
    waitTimeout = DEFAULTS.waitTimeout,
    heartbeatInterval = DEFAULTS.heartbeatInterval,
    errorRetryDelay = DEFAULTS.errorRetryDelay,
    requestTimeout,
    gracefulShutdownTimeout = DEFAULTS.gracefulShutdownTimeout,
  } = config;

  const { concurrency = 1 } = options;

  // Create HTTP client
  const httpClient = createHttpClient({
    backendUrl,
    logger,
    requestTimeout,
  });

  // Worker state
  let running = false;
  let stopRequested = false;
  let activeJobs = 0;
  let abortController: AbortController | null = null;
  let stopDeferred = createDeferred<void>();

  /**
   * Convert HTTP job response to Job interface
   */
  function toJob(response: HttpJobResponse): Job<T> {
    return {
      id: response.id,
      key: response.key,
      queue: response.queue,
      data: response.data as T,
      status: "processing", // Job is claimed for processing
      priority: response.priority,
      attempts: response.attempts,
      maxAttempts: response.maxAttempts,
      createdAt: new Date(response.createdAt),
      scheduledFor: response.scheduledFor
        ? new Date(response.scheduledFor)
        : undefined,
      updatedAt: new Date(response.createdAt), // HTTP doesn't return updatedAt
    };
  }

  /**
   * Process a single job
   */
  async function processJob(jobResponse: HttpJobResponse): Promise<void> {
    activeJobs++;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    const job = toJob(jobResponse);

    try {
      // Start heartbeat
      heartbeatTimer = setInterval(async () => {
        const success = await httpClient.heartbeat(job.id, workerId);
        if (!success) {
          logger.warn(
            { jobId: job.id },
            "Heartbeat failed - job may be reclaimed",
          );
        }
      }, heartbeatInterval);

      // Track stages locally (HTTP transport doesn't have direct DB access)
      // Stage updates could be extended to make HTTP calls if needed
      let currentStages: JobStage[] = [];

      // Create job context
      const ctx: JobContext<T> = {
        job,
        async heartbeat() {
          await httpClient.heartbeat(job.id, workerId);
        },
        log(message: string) {
          logger.info({ jobId: job.id }, message);
        },
        progress(percent: number) {
          logger.debug({ jobId: job.id, progress: percent }, "Job progress");
          // HTTP transport doesn't have built-in progress reporting
        },

        // Multi-stage progress tracking methods (local tracking for HTTP transport)
        // Note: These track stages locally; extend with HTTP calls if backend supports it
        async initStages(stageNames: string[]) {
          currentStages = initializeStages(stageNames);
          job.stages = currentStages;
          logger.debug(
            { jobId: job.id, stages: stageNames },
            "Job stages initialized",
          );
        },

        async startStage(stageName: string) {
          currentStages = startStageInList(currentStages, stageName);
          job.stages = currentStages;
          job.currentStage = stageName;
          logger.debug({ jobId: job.id, stage: stageName }, "Stage started");
        },

        async updateStageProgress(stageName: string, percent: number) {
          currentStages = updateStageProgressInList(
            currentStages,
            stageName,
            percent,
          );
          job.stages = currentStages;
          job.overallProgress = calculateOverallProgress(currentStages);
          // No event callback in HTTP transport
        },

        async completeStage(
          stageName: string,
          artifacts?: Record<string, unknown>,
        ) {
          currentStages = completeStageInList(
            currentStages,
            stageName,
            artifacts,
          );
          job.stages = currentStages;
          job.currentStage = undefined;
          job.overallProgress = calculateOverallProgress(currentStages);
          logger.debug({ jobId: job.id, stage: stageName }, "Stage completed");
        },

        async failStage(stageName: string, error: Error) {
          currentStages = failStageInList(
            currentStages,
            stageName,
            error.message,
          );
          job.stages = currentStages;
          job.currentStage = undefined;
          logger.debug(
            { jobId: job.id, stage: stageName, error: error.message },
            "Stage failed",
          );
        },

        async addStages(stageNames: string[]) {
          currentStages = addStagesToList(currentStages, stageNames);
          job.stages = currentStages;
          logger.debug(
            { jobId: job.id, addedStages: stageNames },
            "Stages added",
          );
        },
      };

      // Execute handler
      await handler(ctx);

      // Mark as completed via HTTP
      await httpClient.complete(job.id, workerId);

      logger.info(
        { jobId: job.id, queue, attempts: job.attempts },
        "Job completed successfully",
      );
    } catch (error) {
      // Handle rate limit errors
      if (isRateLimitError(error)) {
        const rateLimitError = error as RateLimitError;
        await httpClient.reschedule(
          job.id,
          workerId,
          rateLimitError.retryAfter,
        );
        logger.info(
          { jobId: job.id, retryAfter: rateLimitError.retryAfter },
          "Job rescheduled (rate limited)",
        );
      } else {
        // Report failure via HTTP
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        await httpClient.fail(job.id, workerId, errorMessage);
        logger.error(
          { jobId: job.id, queue, attempts: job.attempts, error: errorMessage },
          "Job failed",
        );
      }
    } finally {
      // Stop heartbeat
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
      activeJobs--;
    }
  }

  /**
   * Main worker loop
   */
  async function runLoop(): Promise<void> {
    logger.info(
      { queue, workerId, backendUrl, concurrency },
      "HTTP worker started",
    );

    while (running && !stopRequested) {
      // Check if we can take more jobs
      if (activeJobs >= concurrency) {
        await cancellableSleep(100, abortController?.signal);
        continue;
      }

      try {
        // Wait for a job (long-polling)
        const jobResponse = await httpClient.wait(queue, workerId, waitTimeout);

        if (jobResponse) {
          // Process job in background (don't await)
          processJob(jobResponse).catch((err) => {
            logger.error(
              {
                jobId: jobResponse.id,
                error: err instanceof Error ? err.message : "Unknown",
              },
              "Unexpected error processing job",
            );
          });
        }
        // If no job, the wait already timed out - loop will continue
      } catch (error) {
        // Handle connection errors
        if (error instanceof Error) {
          const isConnectionError =
            error.message.includes("ECONNREFUSED") ||
            error.message.includes("ENOTFOUND") ||
            error.message.includes("ECONNRESET");

          if (isConnectionError) {
            logger.error(
              { backendUrl, error: error.message },
              "Backend connection error - retrying...",
            );
          } else {
            logger.error({ error: error.message }, "Error in worker loop");
          }
        }

        // Back off on error (cancellable)
        await cancellableSleep(errorRetryDelay, abortController?.signal);
      }
    }

    // Wait for active jobs to complete (NOT interruptible - we want jobs to finish)
    while (activeJobs > 0) {
      logger.debug(
        { queue, workerId, activeJobs },
        "Waiting for active jobs to complete",
      );
      await sleep(100);
    }

    logger.info({ queue, workerId }, "HTTP worker stopped");
    stopDeferred.resolve();
  }

  return {
    async start(): Promise<void> {
      if (running) {
        logger.warn({ queue, workerId }, "Worker already running");
        return;
      }

      running = true;
      stopRequested = false;
      abortController = new AbortController();
      stopDeferred = createDeferred<void>(); // Reset for new start

      // Start the worker loop (don't await)
      runLoop();
    },

    async stop(): Promise<void> {
      if (!running) {
        return;
      }

      logger.info({ queue, workerId }, "Stopping HTTP worker...");
      stopRequested = true;

      // Signal sleep calls to cancel immediately
      abortController?.abort();

      // Wait for loop to finish with timeout
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.warn(
            { queue, workerId, activeJobs },
            "HTTP worker shutdown timeout reached - forcing stop",
          );
          resolve();
        }, gracefulShutdownTimeout);
      });

      await Promise.race([stopDeferred.promise, timeoutPromise]);
      running = false;
      abortController = null;
    },

    isRunning(): boolean {
      return running;
    },
  };
}

/**
 * Factory function type for creating HTTP workers
 */
export type HttpWorkerFactory<T = unknown> = (
  queue: string,
  handler: JobHandler<T>,
  options?: WorkerOptions,
) => Worker;

/**
 * Create a worker factory with pre-configured HTTP client
 *
 * @param config - Poller configuration
 * @returns Factory function for creating workers
 */
export function createHttpWorkerFactory(
  config: Omit<HttpPollerConfig, "workerId">,
): HttpWorkerFactory {
  return <T>(
    queue: string,
    handler: JobHandler<T>,
    options?: WorkerOptions,
  ): Worker => {
    return createHttpWorker(queue, handler, config, options);
  };
}
