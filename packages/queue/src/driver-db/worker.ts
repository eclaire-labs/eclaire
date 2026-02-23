/**
 * @eclaire/queue/driver-db - Database Worker implementation
 */

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
import { claimJobPostgres } from "./claim-postgres.js";
import { claimJobSqlite } from "./claim-sqlite.js";
import {
  extendJobLock,
  markJobCompleted,
  markJobFailed,
  updateJobStages,
} from "./client.js";
import type { ClaimedJob, DbWorkerConfig } from "./types.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  lockDuration: 300000, // 5 minutes
  heartbeatInterval: 60000, // 1 minute
  pollInterval: 5000, // 5 seconds
  notifyWaitTimeout: 30000, // 30 seconds (longer for Postgres NOTIFY to reduce wakeups)
  concurrency: 1,
  gracefulShutdownTimeout: 30000, // 30 seconds
};

/**
 * Create a database-backed Worker
 *
 * @param queue - Queue name to process
 * @param handler - Job handler function
 * @param config - Worker configuration
 * @param options - Worker options
 * @returns Worker instance
 */
export function createDbWorker<T = unknown>(
  queue: string,
  handler: JobHandler<T>,
  config: DbWorkerConfig,
  options: WorkerOptions = {},
): Worker {
  const {
    db,
    schema,
    capabilities,
    logger,
    workerId = createWorkerId(),
    lockDuration = DEFAULTS.lockDuration,
    heartbeatInterval = DEFAULTS.heartbeatInterval,
    pollInterval = DEFAULTS.pollInterval,
    notifyWaitTimeout = DEFAULTS.notifyWaitTimeout,
    notifyListener,
    gracefulShutdownTimeout = DEFAULTS.gracefulShutdownTimeout,
    eventCallbacks,
    wrapJobExecution,
  } = config;

  const { concurrency = DEFAULTS.concurrency } = options;

  const { queueJobs } = schema;

  // Worker state
  let running = false;
  let activeJobs = 0;
  let stopRequested = false;
  let abortController: AbortController | null = null;
  let stopDeferred = createDeferred<void>();

  // Select claim function based on database type
  const claimJob = capabilities.skipLocked ? claimJobPostgres : claimJobSqlite;

  /**
   * Process a single job
   */
  async function processJob(claimed: ClaimedJob): Promise<void> {
    activeJobs++;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    // Get the lock token from the claimed job (must be present)
    const lockToken = claimed.lockToken;
    if (!lockToken) {
      logger.error({ jobId: claimed.id }, "Claimed job missing lockToken");
      activeJobs--;
      return;
    }

    // Extract requestId from job data (propagated from HTTP request)
    const jobData = claimed.data as Record<string, unknown>;
    const requestId = jobData?.requestId as string | undefined;

    // Core job execution logic
    const executeJob = async (): Promise<void> => {
      try {
        // Start heartbeat
        heartbeatTimer = setInterval(async () => {
          try {
            const extended = await extendJobLock(
              db,
              queueJobs,
              claimed.id,
              workerId,
              lockToken,
              lockDuration,
              logger,
            );
            if (!extended) {
              logger.warn(
                { jobId: claimed.id },
                "Lock extension failed - lock may be lost",
              );
            }
          } catch (err) {
            logger.error(
              {
                jobId: claimed.id,
                error: err instanceof Error ? err.message : "Unknown",
              },
              "Heartbeat failed",
            );
          }
        }, heartbeatInterval);

        // Create job context with stage tracking
        // Parse stages from claimed job (may be JSON string from SQLite)
        let currentStages: JobStage[] = claimed.stages
          ? typeof claimed.stages === "string"
            ? JSON.parse(claimed.stages)
            : claimed.stages
          : [];

        const job: Job<T> = {
          id: claimed.id,
          key: claimed.key || undefined,
          queue: claimed.queue,
          data: claimed.data as T,
          status: claimed.status as Job["status"],
          priority: claimed.priority,
          attempts: claimed.attempts,
          maxAttempts: claimed.maxAttempts,
          createdAt: claimed.createdAt,
          scheduledFor: claimed.scheduledFor || undefined,
          updatedAt: claimed.updatedAt,
          stages: currentStages.length > 0 ? currentStages : undefined,
          currentStage: claimed.currentStage || undefined,
          overallProgress: claimed.overallProgress ?? undefined,
          metadata: claimed.metadata || undefined,
        };

        // Helper to persist stage updates to DB
        const persistStages = async (
          stages: JobStage[],
          currentStageName: string | null,
        ) => {
          currentStages = stages;
          job.stages = stages;
          job.currentStage = currentStageName || undefined;
          job.overallProgress = calculateOverallProgress(stages);

          await updateJobStages(
            db,
            queueJobs,
            claimed.id,
            workerId,
            lockToken,
            stages,
            currentStageName,
            logger,
          );
        };

        const ctx: JobContext<T> = {
          job,
          async heartbeat() {
            await extendJobLock(
              db,
              queueJobs,
              claimed.id,
              workerId,
              lockToken,
              lockDuration,
              logger,
            );
          },
          log(message: string) {
            logger.info({ jobId: claimed.id }, message);
          },
          progress(percent: number) {
            logger.debug(
              { jobId: claimed.id, progress: percent },
              "Job progress",
            );
            // Also call event callback if provided
            eventCallbacks?.onStageProgress?.(
              claimed.id,
              job.currentStage || "",
              percent,
              claimed.metadata || undefined,
            );
          },

          // Multi-stage progress tracking methods
          async initStages(stageNames: string[]) {
            const stages = initializeStages(stageNames);
            await persistStages(stages, null);
            logger.debug(
              { jobId: claimed.id, stages: stageNames },
              "Job stages initialized",
            );
          },

          async startStage(stageName: string) {
            const updatedStages = startStageInList(currentStages, stageName);
            await persistStages(updatedStages, stageName);
            logger.debug(
              { jobId: claimed.id, stage: stageName },
              "Stage started",
            );
            eventCallbacks?.onStageStart?.(
              claimed.id,
              stageName,
              claimed.metadata || undefined,
            );
          },

          async updateStageProgress(stageName: string, percent: number) {
            // This is a lightweight operation - only update local state and emit event
            // Don't persist to DB to avoid excessive writes
            currentStages = updateStageProgressInList(
              currentStages,
              stageName,
              percent,
            );
            job.stages = currentStages;
            job.overallProgress = calculateOverallProgress(currentStages);
            eventCallbacks?.onStageProgress?.(
              claimed.id,
              stageName,
              percent,
              claimed.metadata || undefined,
            );
          },

          async completeStage(
            stageName: string,
            artifacts?: Record<string, unknown>,
          ) {
            const updatedStages = completeStageInList(
              currentStages,
              stageName,
              artifacts,
            );
            await persistStages(updatedStages, null); // Clear current stage since this one is done
            logger.debug(
              { jobId: claimed.id, stage: stageName },
              "Stage completed",
            );
            await eventCallbacks?.onStageComplete?.(
              claimed.id,
              stageName,
              artifacts,
              claimed.metadata || undefined,
            );
          },

          async failStage(stageName: string, error: Error) {
            const updatedStages = failStageInList(
              currentStages,
              stageName,
              error.message,
            );
            await persistStages(updatedStages, null);
            logger.debug(
              { jobId: claimed.id, stage: stageName, error: error.message },
              "Stage failed",
            );
            eventCallbacks?.onStageFail?.(
              claimed.id,
              stageName,
              error.message,
              claimed.metadata || undefined,
            );
          },

          async addStages(stageNames: string[]) {
            const updatedStages = addStagesToList(currentStages, stageNames);
            await persistStages(updatedStages, job.currentStage || null);
            logger.debug(
              { jobId: claimed.id, addedStages: stageNames },
              "Stages added",
            );
          },
        };

        // Execute handler
        await handler(ctx);

        // Mark as completed (with ownership verification)
        const completed = await markJobCompleted(
          db,
          queueJobs,
          claimed.id,
          workerId,
          lockToken,
          logger,
        );
        if (!completed) {
          logger.warn(
            { jobId: claimed.id },
            "Job completion failed - lock was lost",
          );
        } else {
          logger.info(
            { jobId: claimed.id, queue, attempts: claimed.attempts },
            "Job completed successfully",
          );
          // Call onJobComplete callback
          await eventCallbacks?.onJobComplete?.(
            claimed.id,
            claimed.metadata || undefined,
          );
        }
      } catch (error) {
        // Mark as failed (handles retry logic internally, with ownership verification)
        const marked = await markJobFailed(
          db,
          queueJobs,
          claimed.id,
          workerId,
          lockToken,
          error instanceof Error ? error : new Error(String(error)),
          logger,
        );

        if (!marked) {
          logger.warn(
            { jobId: claimed.id },
            "Job failure marking failed - lock was lost",
          );
        }

        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          {
            jobId: claimed.id,
            queue,
            attempts: claimed.attempts,
            error: errorMessage,
          },
          "Job failed",
        );
        // Call onJobFail callback
        eventCallbacks?.onJobFail?.(
          claimed.id,
          errorMessage,
          claimed.metadata || undefined,
        );
      } finally {
        // Stop heartbeat
        if (heartbeatTimer) {
          clearInterval(heartbeatTimer);
        }
        activeJobs--;
      }
    };

    // Use wrapper if provided (e.g., for request tracing), otherwise execute directly
    if (wrapJobExecution) {
      return wrapJobExecution(requestId, executeJob);
    }
    return executeJob();
  }

  /**
   * Main worker loop
   */
  async function runLoop(): Promise<void> {
    logger.info({ queue, workerId, concurrency }, "Worker started");

    while (running && !stopRequested) {
      // Check if we can take more jobs
      if (activeJobs >= concurrency) {
        await cancellableSleep(100, abortController?.signal);
        continue;
      }

      try {
        // Try to claim a job
        const claimed = await claimJob(
          db,
          queueJobs,
          queue,
          { workerId, lockDuration },
          logger,
        );

        if (claimed) {
          // Process job in background (don't await)
          processJob(claimed).catch((err) => {
            logger.error(
              {
                jobId: claimed.id,
                error: err instanceof Error ? err.message : "Unknown",
              },
              "Unexpected error processing job",
            );
          });
        } else {
          // No job available, wait for notification or poll interval
          if (notifyListener) {
            // Wait for notification (use separate timeout for Postgres NOTIFY)
            await waitForNotification(
              queue,
              notifyWaitTimeout,
              abortController?.signal,
            );
          } else {
            // Fall back to polling
            await cancellableSleep(pollInterval, abortController?.signal);
          }
        }
      } catch (error) {
        logger.error(
          {
            queue,
            workerId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error in worker loop",
        );
        // Back off on error
        await cancellableSleep(pollInterval, abortController?.signal);
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

    logger.info({ queue, workerId }, "Worker stopped");
    stopDeferred.resolve();
  }

  /**
   * Wait for notification or timeout (cancellable via abort signal)
   */
  async function waitForNotification(
    queueName: string,
    timeout: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!notifyListener) {
      await cancellableSleep(timeout, signal);
      return;
    }

    return new Promise<void>((resolve) => {
      // If already aborted, resolve immediately
      if (signal?.aborted) {
        resolve();
        return;
      }

      let resolved = false;
      let timer: ReturnType<typeof setTimeout>;
      let unsubscribe: (() => void) | null = null;

      const cleanup = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          unsubscribe?.();
          resolve();
        }
      };

      // Subscribe to notifications - returns unsubscribe function
      unsubscribe = notifyListener.subscribe(queueName, cleanup);

      // Set timeout
      timer = setTimeout(cleanup, timeout);

      // Listen for abort signal
      signal?.addEventListener("abort", cleanup, { once: true });
    });
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

      logger.info({ queue, workerId }, "Stopping worker...");
      stopRequested = true;

      // Signal sleep/wait calls to cancel immediately
      abortController?.abort();

      // Wait for loop to finish with timeout
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          logger.warn(
            { queue, workerId, activeJobs },
            "Worker shutdown timeout reached - forcing stop",
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
 * Factory function type for creating DB workers
 */
export type DbWorkerFactory<T = unknown> = (
  queue: string,
  handler: JobHandler<T>,
  options?: WorkerOptions,
) => Worker;

/**
 * Create a worker factory with pre-configured database connection
 *
 * @param config - Worker configuration
 * @returns Factory function for creating workers
 */
export function createDbWorkerFactory(
  config: Omit<DbWorkerConfig, "workerId">,
): DbWorkerFactory {
  return <T>(
    queue: string,
    handler: JobHandler<T>,
    options?: WorkerOptions,
  ): Worker => {
    return createDbWorker(queue, handler, config, options);
  };
}
