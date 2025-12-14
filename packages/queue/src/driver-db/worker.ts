/**
 * @eclaire/queue/driver-db - Database Worker implementation
 */

import type {
  Worker,
  WorkerOptions,
  JobHandler,
  JobContext,
  Job,
} from "../core/types.js";
import { createWorkerId, sleep, createDeferred } from "../core/utils.js";
import type { DbWorkerConfig, ClaimedJob } from "./types.js";
import { claimJobPostgres } from "./claim-postgres.js";
import { claimJobSqlite } from "./claim-sqlite.js";
import { markJobCompleted, markJobFailed, extendJobLock } from "./client.js";

/**
 * Default configuration values
 */
const DEFAULTS = {
  lockDuration: 300000, // 5 minutes
  heartbeatInterval: 60000, // 1 minute
  pollInterval: 5000, // 5 seconds
  notifyWaitTimeout: 30000, // 30 seconds (longer for Postgres NOTIFY to reduce wakeups)
  concurrency: 1,
};

/**
 * Create a database-backed Worker
 *
 * @param name - Queue name to process
 * @param handler - Job handler function
 * @param config - Worker configuration
 * @param options - Worker options
 * @returns Worker instance
 */
export function createDbWorker<T = unknown>(
  name: string,
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
  } = config;

  const { concurrency = DEFAULTS.concurrency } = options;

  const { queueJobs } = schema;

  // Worker state
  let running = false;
  let activeJobs = 0;
  let stopRequested = false;
  const stopDeferred = createDeferred<void>();

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
            logger.warn({ jobId: claimed.id }, "Lock extension failed - lock may be lost");
          }
        } catch (err) {
          logger.error(
            { jobId: claimed.id, error: err instanceof Error ? err.message : "Unknown" },
            "Heartbeat failed",
          );
        }
      }, heartbeatInterval);

      // Create job context
      const job: Job<T> = {
        id: claimed.id,
        key: claimed.key || undefined,
        name: claimed.name,
        data: claimed.data as T,
        status: claimed.status as Job["status"],
        priority: claimed.priority,
        attempts: claimed.attempts,
        maxAttempts: claimed.maxAttempts,
        createdAt: claimed.createdAt,
        scheduledFor: claimed.scheduledFor || undefined,
        updatedAt: claimed.updatedAt,
      };

      const ctx: JobContext<T> = {
        job,
        async heartbeat() {
          await extendJobLock(db, queueJobs, claimed.id, workerId, lockToken, lockDuration, logger);
        },
        log(message: string) {
          logger.info({ jobId: claimed.id }, message);
        },
        progress(percent: number) {
          logger.debug({ jobId: claimed.id, progress: percent }, "Job progress");
        },
      };

      // Execute handler
      await handler(ctx);

      // Mark as completed (with ownership verification)
      const completed = await markJobCompleted(db, queueJobs, claimed.id, workerId, lockToken, logger);
      if (!completed) {
        logger.warn({ jobId: claimed.id }, "Job completion failed - lock was lost");
      } else {
        logger.info(
          { jobId: claimed.id, name, attempts: claimed.attempts },
          "Job completed successfully",
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
        logger.warn({ jobId: claimed.id }, "Job failure marking failed - lock was lost");
      }

      logger.error(
        {
          jobId: claimed.id,
          name,
          attempts: claimed.attempts,
          error: error instanceof Error ? error.message : String(error),
        },
        "Job failed",
      );
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
    logger.info({ name, workerId, concurrency }, "Worker started");

    while (running && !stopRequested) {
      // Check if we can take more jobs
      if (activeJobs >= concurrency) {
        await sleep(100);
        continue;
      }

      try {
        // Try to claim a job
        const claimed = await claimJob(
          db,
          queueJobs,
          name,
          { workerId, lockDuration },
          logger,
        );

        if (claimed) {
          // Process job in background (don't await)
          processJob(claimed).catch((err) => {
            logger.error(
              { jobId: claimed.id, error: err instanceof Error ? err.message : "Unknown" },
              "Unexpected error processing job",
            );
          });
        } else {
          // No job available, wait for notification or poll interval
          if (notifyListener) {
            // Wait for notification (use separate timeout for Postgres NOTIFY)
            await waitForNotification(name, notifyWaitTimeout);
          } else {
            // Fall back to polling
            await sleep(pollInterval);
          }
        }
      } catch (error) {
        logger.error(
          {
            name,
            workerId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error in worker loop",
        );
        // Back off on error
        await sleep(pollInterval);
      }
    }

    // Wait for active jobs to complete
    while (activeJobs > 0) {
      logger.debug({ name, workerId, activeJobs }, "Waiting for active jobs to complete");
      await sleep(100);
    }

    logger.info({ name, workerId }, "Worker stopped");
    stopDeferred.resolve();
  }

  /**
   * Wait for notification or timeout
   */
  async function waitForNotification(queueName: string, timeout: number): Promise<void> {
    if (!notifyListener) {
      await sleep(timeout);
      return;
    }

    return new Promise<void>((resolve) => {
      let resolved = false;
      let timer: ReturnType<typeof setTimeout>;
      let unsubscribe: (() => void) | null = null;

      const callback = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          unsubscribe?.();
          resolve();
        }
      };

      // Subscribe to notifications - returns unsubscribe function
      unsubscribe = notifyListener.subscribe(queueName, callback);

      // Set timeout
      timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          unsubscribe?.();
          resolve();
        }
      }, timeout);
    });
  }

  return {
    async start(): Promise<void> {
      if (running) {
        logger.warn({ name, workerId }, "Worker already running");
        return;
      }

      running = true;
      stopRequested = false;

      // Start the worker loop (don't await)
      runLoop();
    },

    async stop(): Promise<void> {
      if (!running) {
        return;
      }

      logger.info({ name, workerId }, "Stopping worker...");
      stopRequested = true;

      // Wait for loop to finish
      await stopDeferred.promise;
      running = false;
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
  name: string,
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
    name: string,
    handler: JobHandler<T>,
    options?: WorkerOptions,
  ): Worker => {
    return createDbWorker(name, handler, config, options);
  };
}
