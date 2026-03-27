/**
 * Task Schedule Tick Processor
 *
 * Invoked by the scheduler on each cron tick for recurring tasks.
 * Creates a TaskOccurrence record and lets taskOccurrenceProcessor handle execution.
 */

import { eq } from "drizzle-orm";
import { createChildLogger } from "../../lib/logger.js";
import { getNextExecutionTime } from "../../lib/queue/cron-utils.js";
import {
  getScheduler,
  getRecurringTaskScheduleKey,
} from "../../lib/queue/scheduler.js";
import { createTaskOccurrence } from "../../lib/services/task-occurrences.js";
import type { TaskScheduleTickJobData } from "../../lib/queue/types.js";
import { db, schema } from "../../db/index.js";

const logger = createChildLogger("task-schedule-tick-processor");

export default async function processTaskScheduleTick(
  // biome-ignore lint/suspicious/noExplicitAny: job context shape varies by queue driver
  ctx: any,
): Promise<void> {
  const data = ctx.job.data as TaskScheduleTickJobData;
  const { taskId, userId } = data;

  logger.info({ taskId, userId }, "Processing task schedule tick");

  // Fetch the task to validate state and get execution params
  const task = await db.query.tasks.findFirst({
    where: eq(schema.tasks.id, taskId),
    columns: {
      id: true,
      userId: true,
      scheduleType: true,
      scheduleRule: true,
      timezone: true,
      taskStatus: true,
      prompt: true,
      title: true,
      delegateActorId: true,
      delegateMode: true,
      deliveryTargets: true,
      occurrenceCount: true,
      maxOccurrences: true,
    },
  });

  if (!task) {
    logger.warn({ taskId }, "Task not found, skipping tick");
    return;
  }

  if (task.scheduleType !== "recurring") {
    logger.warn(
      { taskId, scheduleType: task.scheduleType },
      "Task is not recurring, skipping tick",
    );
    return;
  }

  // Skip if task is paused, completed, or cancelled
  if (
    task.taskStatus === "blocked" ||
    task.taskStatus === "completed" ||
    task.taskStatus === "cancelled"
  ) {
    logger.info(
      { taskId, taskStatus: task.taskStatus },
      "Task is not active, skipping tick",
    );
    return;
  }

  // Determine occurrence kind
  const deliveryTargets = task.deliveryTargets as Array<{
    type: string;
    ref?: string;
  }> | null;
  const hasNotificationTargets =
    Array.isArray(deliveryTargets) &&
    deliveryTargets.some((t) => t.type === "notification_channels");
  const isAgentDelegate =
    task.delegateMode !== "manual" && task.delegateActorId;
  const kind =
    hasNotificationTargets && !isAgentDelegate ? "reminder" : "recurring_run";

  // Create the occurrence — this also enqueues to task-occurrence queue
  await createTaskOccurrence({
    taskId,
    userId,
    kind,
    prompt: task.prompt ?? task.title,
    executorActorId: task.delegateActorId ?? undefined,
  });

  // Increment occurrence count
  const newCount = (task.occurrenceCount ?? 0) + 1;

  // Compute next occurrence time
  const nextOccurrence = task.scheduleRule
    ? getNextExecutionTime(task.scheduleRule, new Date(), task.timezone)
    : null;

  await db
    .update(schema.tasks)
    .set({
      occurrenceCount: newCount,
      nextOccurrenceAt: nextOccurrence,
      latestExecutionStatus: "queued",
      updatedAt: new Date(),
    })
    .where(eq(schema.tasks.id, taskId));

  // If max occurrences reached, remove the schedule
  if (task.maxOccurrences && newCount >= task.maxOccurrences) {
    logger.info(
      { taskId, count: newCount, max: task.maxOccurrences },
      "Max occurrences reached, removing schedule",
    );
    try {
      const scheduler = await getScheduler();
      await scheduler.remove(getRecurringTaskScheduleKey(taskId));
    } catch (err) {
      logger.warn(
        { taskId, error: err },
        "Failed to remove schedule after max occurrences",
      );
    }
  }

  logger.info(
    { taskId, kind, occurrenceCount: newCount, nextOccurrence },
    "Task schedule tick processed",
  );
}
