/**
 * Unified Scheduler abstraction layer
 *
 * Provides a single interface for managing recurring job schedules
 * using database-backed implementations.
 */

import type { ScheduleConfig, Scheduler } from "@eclaire/queue/core";
import {
  createDbQueueClient,
  createDbScheduler,
  getQueueSchema,
} from "@eclaire/queue/driver-db";
import { db, dbType } from "../../db/index.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("scheduler");

// Re-export types for convenience
export type { Scheduler, ScheduleConfig };

// --- Singleton Instance ---

let schedulerInstance: Scheduler | null = null;
let schedulerInitPromise: Promise<Scheduler> | null = null;

/**
 * Get the singleton scheduler instance
 *
 * Creates the database scheduler based on queue backend:
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
  const queueDbType = dbType as "postgres" | "sqlite";
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

  return schedulerInstance;
}

/**
 * Start the scheduler
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
