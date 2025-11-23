/**
 * Database-backed task scheduler for recurring task execution
 * Only runs in unified mode (SERVICE_ROLE=unified) where queue mode is database
 */

import { db, schema } from "@/db";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { createChildLogger } from "./logger";
import { DatabaseQueueAdapter } from "./queue-adapter";
import { jobWaitlist } from "./job-waitlist";
import { getCurrentTimestamp } from "./db-queue-helpers";
import { CronExpressionParser } from "cron-parser";

const logger = createChildLogger("task-scheduler");

const { tasks } = schema;

interface RecurringTask {
  id: string;
  userId: string;
  title: string;
  isRecurring: boolean;
  cronExpression: string | null;
  recurrenceEndDate: Date | null;
  recurrenceLimit: number | null;
  runImmediately: boolean;
  nextRunAt: Date | null;
  lastRunAt: Date | null;
}

let schedulerInterval: NodeJS.Timeout | null = null;
let queueAdapter: DatabaseQueueAdapter | null = null;

/**
 * Start the task scheduler loop
 * Polls for due recurring tasks every 10 seconds
 */
export function startTaskScheduler() {
  if (schedulerInterval) {
    logger.warn("Task scheduler already running");
    return;
  }

  queueAdapter = new DatabaseQueueAdapter();

  logger.info("Starting task scheduler for recurring tasks");

  // Run immediately on startup
  scheduleDueTasks().catch((err) => {
    logger.error({ error: err }, "Error in initial task scheduling");
  });

  // Then run every 10 seconds
  schedulerInterval = setInterval(() => {
    scheduleDueTasks().catch((err) => {
      logger.error({ error: err }, "Error in task scheduling loop");
    });
  }, 10000); // 10 seconds
}

/**
 * Stop the task scheduler loop
 */
export function stopTaskScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info("Task scheduler stopped");
  }

  if (queueAdapter) {
    queueAdapter.close();
    queueAdapter = null;
  }
}

/**
 * Main scheduling logic - finds due tasks and enqueues them
 */
async function scheduleDueTasks() {
  const now = getCurrentTimestamp();

  try {
    // Find all recurring tasks that are due to run
    const dueTasks = await db
      .select({
        id: tasks.id,
        userId: tasks.userId,
        title: tasks.title,
        isRecurring: tasks.isRecurring,
        cronExpression: tasks.cronExpression,
        recurrenceEndDate: tasks.recurrenceEndDate,
        recurrenceLimit: tasks.recurrenceLimit,
        runImmediately: tasks.runImmediately,
        nextRunAt: tasks.nextRunAt,
        lastRunAt: tasks.lastRunAt,
      })
      .from(tasks)
      .where(
        and(
          eq(tasks.isRecurring, true),
          isNotNull(tasks.nextRunAt),
          lte(tasks.nextRunAt, now)
        )
      );

    if (dueTasks.length === 0) {
      return; // No tasks due
    }

    logger.info({ count: dueTasks.length }, "Found due recurring tasks");

    for (const task of dueTasks) {
      try {
        await processRecurringTask(task as RecurringTask);
      } catch (error) {
        logger.error(
          { taskId: task.id, title: task.title, error },
          "Failed to process recurring task"
        );
      }
    }

    // Notify waiting workers that new task-execution jobs are available
    if (dueTasks.length > 0) {
      jobWaitlist.notifyWaiters("tasks");
    }
  } catch (error) {
    logger.error({ error }, "Error querying for due tasks");
  }
}

/**
 * Process a single recurring task:
 * 1. Check execution limit
 * 2. Enqueue execution job
 * 3. Compute next run time
 * 4. Update task record
 */
async function processRecurringTask(task: RecurringTask) {
  if (!queueAdapter) {
    throw new Error("Queue adapter not initialized");
  }

  const now = getCurrentTimestamp();

  // Check execution limit by counting completed jobs for this task
  let executionCount = 0;
  if (task.recurrenceLimit !== null) {
    const { assetProcessingJobs } = schema;
    const completedJobs = await db
      .select({ id: assetProcessingJobs.id })
      .from(assetProcessingJobs)
      .where(
        and(
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.assetId, task.id),
          eq(assetProcessingJobs.status, "completed")
        )
      );
    executionCount = completedJobs.length;

    if (executionCount >= task.recurrenceLimit) {
      logger.info(
        { taskId: task.id, executionCount, limit: task.recurrenceLimit },
        "Task execution limit reached, disabling recurrence"
      );

      // Disable recurrence
      await db
        .update(tasks)
        .set({
          isRecurring: false,
          nextRunAt: null,
          updatedAt: now,
        })
        .where(eq(tasks.id, task.id));

      return;
    }
  }

  // Enqueue the task execution job
  await queueAdapter.enqueueTask({
    taskId: task.id,
    userId: task.userId,
    title: task.title,
    isRecurringExecution: true,
  });

  logger.info(
    { taskId: task.id, title: task.title },
    "Enqueued recurring task execution"
  );

  // Compute next run time using cron expression
  let nextRunAt: Date | null = null;
  if (task.cronExpression) {
    try {
      const cronOptions = {
        currentDate: now,
        tz: "UTC",
      };
      const interval = CronExpressionParser.parse(task.cronExpression, cronOptions);
      nextRunAt = interval.next().toDate();

      // Check if next run is beyond end date
      if (task.recurrenceEndDate && nextRunAt && nextRunAt > task.recurrenceEndDate) {
        nextRunAt = null;
      }
    } catch (error) {
      logger.error(
        { taskId: task.id, cronExpression: task.cronExpression, error },
        "Failed to parse cron expression"
      );
      nextRunAt = null;
    }
  }

  // Update task record
  await db
    .update(tasks)
    .set({
      lastRunAt: now,
      nextRunAt: nextRunAt,
      isRecurring: nextRunAt !== null, // Disable if no more runs
      runImmediately: false, // Clear runImmediately flag after first run
      updatedAt: now,
    })
    .where(eq(tasks.id, task.id));

  logger.info(
    {
      taskId: task.id,
      nextRunAt,
      stillRecurring: nextRunAt !== null,
    },
    "Updated recurring task"
  );
}

/**
 * Manually trigger scheduling check (useful for testing or immediate scheduling)
 */
export async function triggerSchedulingCheck() {
  logger.info("Manual scheduling check triggered");
  await scheduleDueTasks();
}
