/**
 * Unified Scheduler abstraction layer
 *
 * Provides a single interface for managing recurring job schedules,
 * abstracting over BullMQ (Redis) and Database-backed implementations.
 */

import type { Scheduler, ScheduleConfig } from "@eclaire/queue/core";
import { createBullMQScheduler } from "@eclaire/queue/driver-bullmq";
import { createDbScheduler, createDbQueueClient, getQueueSchema } from "@eclaire/queue/driver-db";
import { db, dbType } from "../../db/index.js";
import { createChildLogger } from "../logger.js";
import { config } from "../../config/index.js";

const logger = createChildLogger("scheduler");

// Re-export types for convenience
export type { Scheduler, ScheduleConfig };

// --- Singleton Instance ---

let schedulerInstance: Scheduler | null = null;
let schedulerInitPromise: Promise<Scheduler> | null = null;

/**
 * Get the singleton scheduler instance
 *
 * Creates the appropriate scheduler based on queue backend:
 * - redis: BullMQ scheduler using Redis
 * - postgres/sqlite: Database scheduler using queue_schedules table
 */
export async function getScheduler(): Promise<Scheduler> {
  if (schedulerInstance) {
    return schedulerInstance;
  }

  // Ensure only one initialization happens even with concurrent calls
  if (!schedulerInitPromise) {
    schedulerInitPromise = initializeScheduler();
  }

  return schedulerInitPromise;
}

async function initializeScheduler(): Promise<Scheduler> {
  const queueBackend = config.queueBackend;

  if (queueBackend === "redis") {
    const redisUrl = config.queue.redisUrl;
    if (!redisUrl) {
      throw new Error("REDIS_URL is required for QUEUE_BACKEND=redis");
    }

    schedulerInstance = createBullMQScheduler({
      redis: { url: redisUrl },
      logger,
    });

    logger.info({}, "Using BullMQ scheduler");
  } else {
    // postgres or sqlite backend - create scheduler with queueClient
    // Use queueBackend directly since it's already "postgres" or "sqlite"
    const queueDbType = queueBackend === "sqlite" ? "sqlite" : "postgres";
    const schema = getQueueSchema(queueDbType);

    const queueClient = createDbQueueClient({
      db,
      schema,
      capabilities: {
        skipLocked: queueDbType === "postgres",
        notify: false,
        jsonb: queueDbType === "postgres",
        type: queueDbType,
      },
      logger,
    });

    schedulerInstance = createDbScheduler({
      db,
      queueSchedules: schema.queueSchedules,
      queueClient,
      logger,
    });

    logger.info({}, "Using database scheduler");
  }

  return schedulerInstance;
}

/**
 * Start the scheduler (required for database mode, no-op for BullMQ)
 */
export async function startScheduler(): Promise<void> {
  const scheduler = await getScheduler();
  await scheduler.start();
  logger.info({}, "Scheduler started");
}

/**
 * Stop the scheduler and clean up resources
 */
export async function stopScheduler(): Promise<void> {
  if (schedulerInstance) {
    await schedulerInstance.stop();
    schedulerInstance = null;
    schedulerInitPromise = null;
    logger.info({}, "Scheduler stopped");
  }
}

/**
 * Schedule key prefix for recurring tasks
 */
export const RECURRING_TASK_KEY_PREFIX = "recurring-task:";

/**
 * Generate a schedule key for a task
 */
export function getRecurringTaskScheduleKey(taskId: string): string {
  return `${RECURRING_TASK_KEY_PREFIX}${taskId}`;
}
