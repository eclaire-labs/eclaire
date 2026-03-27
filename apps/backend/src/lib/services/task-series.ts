/**
 * Task Series Service
 *
 * Manages recurring task definitions that spawn task occurrences on a schedule.
 * A TaskSeries is a template + cron schedule that creates concrete Task
 * instances at each tick, optionally triggering an AgentRun on each occurrence.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import { generateTaskSeriesId, generateTaskId } from "@eclaire/core/id";
import { db, schema } from "../../db/index.js";
import { ValidationError, NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import {
  isValidCronExpression,
  getNextExecutionTime,
} from "../queue/cron-utils.js";
import { QueueNames } from "../queue/queue-names.js";
import { getScheduler } from "../queue/scheduler.js";
import { createAgentRun } from "./agent-runs.js";

const logger = createChildLogger("task-series");

const taskSeriesTable = schema.taskSeries;
const tasksTable = schema.tasks;

// =============================================================================
// Types
// =============================================================================

export type TaskSeriesStatus = "active" | "paused" | "completed" | "cancelled";
export type TaskSeriesExecutionPolicy = "assign_only" | "assign_and_run";

export interface CreateTaskSeriesParams {
  userId: string;
  title: string;
  description?: string;
  defaultAssigneeActorId?: string;
  executionPolicy?: TaskSeriesExecutionPolicy;
  cronExpression: string;
  timezone?: string;
  startAt?: string;
  endAt?: string;
  maxOccurrences?: number;
}

export interface TaskSeries {
  id: string;
  userId: string;
  status: TaskSeriesStatus;
  title: string;
  description: string | null;
  defaultAssigneeActorId: string | null;
  executionPolicy: TaskSeriesExecutionPolicy;
  cronExpression: string;
  timezone: string | null;
  startAt: Date | null;
  endAt: Date | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  lastOccurrenceAt: Date | null;
  nextOccurrenceAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Helpers
// =============================================================================

const SCHEDULE_KEY_PREFIX = "task-series:";

function getScheduleKey(seriesId: string): string {
  return `${SCHEDULE_KEY_PREFIX}${seriesId}`;
}

async function getUserTimezone(userId: string): Promise<string | null> {
  const users = schema.users;
  const [row] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.timezone ?? null;
}

async function upsertSchedule(series: TaskSeries): Promise<void> {
  const scheduler = await getScheduler();
  const timezone =
    series.timezone ?? (await getUserTimezone(series.userId)) ?? undefined;

  // Job data for the task-series-tick queue — the processor will create the occurrence
  const jobData = {
    taskSeriesId: series.id,
    userId: series.userId,
  };

  await scheduler.upsert({
    key: getScheduleKey(series.id),
    queue: QueueNames.TASK_SERIES_TICK,
    cron: series.cronExpression,
    data: jobData,
    enabled: true,
    limit: series.maxOccurrences ?? undefined,
    endDate: series.endAt ?? undefined,
    timezone,
  });

  logger.info(
    { taskSeriesId: series.id, cron: series.cronExpression, timezone },
    "Task series schedule created/updated",
  );
}

async function deleteSchedule(seriesId: string): Promise<void> {
  const scheduler = await getScheduler();
  const removed = await scheduler.remove(getScheduleKey(seriesId));
  if (removed) {
    logger.info({ taskSeriesId: seriesId }, "Task series schedule deleted");
  } else {
    logger.debug(
      { taskSeriesId: seriesId },
      "Task series schedule not found (already removed)",
    );
  }
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create a task series and register its recurring schedule.
 */
export async function createTaskSeries(
  params: CreateTaskSeriesParams,
): Promise<TaskSeries> {
  const id = generateTaskSeriesId();

  if (!isValidCronExpression(params.cronExpression)) {
    throw new ValidationError(
      `Invalid cron expression: "${params.cronExpression}". Use standard 5-field cron format (e.g., "0 9 * * *").`,
      "cronExpression",
    );
  }

  const tz = params.timezone ?? (await getUserTimezone(params.userId));
  const nextOccurrenceAt =
    getNextExecutionTime(params.cronExpression, new Date(), tz) ?? null;

  const startAtDate = params.startAt ? new Date(params.startAt) : null;
  const endAtDate = params.endAt ? new Date(params.endAt) : null;

  const [created] = await db
    .insert(taskSeriesTable)
    .values({
      id,
      userId: params.userId,
      status: "active",
      title: params.title,
      description: params.description ?? null,
      defaultAssigneeActorId: params.defaultAssigneeActorId ?? null,
      executionPolicy: params.executionPolicy ?? "assign_only",
      cronExpression: params.cronExpression,
      timezone: params.timezone ?? null,
      startAt: startAtDate,
      endAt: endAtDate,
      maxOccurrences: params.maxOccurrences ?? null,
      occurrenceCount: 0,
      nextOccurrenceAt,
    })
    .returning();

  logger.info(
    { id, userId: params.userId, cron: params.cronExpression },
    "Task series created",
  );

  // Register recurring schedule
  try {
    await upsertSchedule(created as TaskSeries);
  } catch (error) {
    logger.error(
      { id, error: error instanceof Error ? error.message : String(error) },
      "Failed to register task series schedule, rolling back",
    );
    await db.delete(taskSeriesTable).where(eq(taskSeriesTable.id, id));
    throw error;
  }

  return created as TaskSeries;
}

/**
 * Get a task series by ID (scoped to user).
 */
export async function getTaskSeries(
  id: string,
  userId: string,
): Promise<TaskSeries | null> {
  const [series] = await db
    .select()
    .from(taskSeriesTable)
    .where(and(eq(taskSeriesTable.id, id), eq(taskSeriesTable.userId, userId)))
    .limit(1);
  return (series as TaskSeries) ?? null;
}

/**
 * List task series for a user.
 */
export async function listTaskSeries(
  userId: string,
  options?: {
    status?: TaskSeriesStatus;
    limit?: number;
    offset?: number;
  },
): Promise<TaskSeries[]> {
  const conditions = [eq(taskSeriesTable.userId, userId)];
  if (options?.status) {
    conditions.push(eq(taskSeriesTable.status, options.status));
  }

  const results = await db
    .select()
    .from(taskSeriesTable)
    .where(and(...conditions))
    .orderBy(desc(taskSeriesTable.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return results as TaskSeries[];
}

/**
 * Cancel a task series and remove its schedule.
 */
export async function cancelTaskSeries(
  id: string,
  userId: string,
): Promise<void> {
  const [updated] = await db
    .update(taskSeriesTable)
    .set({
      status: "cancelled",
      nextOccurrenceAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(taskSeriesTable.id, id), eq(taskSeriesTable.userId, userId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Task series", id);
  }

  await deleteSchedule(id);
  logger.info({ id, userId }, "Task series cancelled");
}

/**
 * Pause a task series (stop scheduling but keep state).
 */
export async function pauseTaskSeries(
  id: string,
  userId: string,
): Promise<void> {
  const [updated] = await db
    .update(taskSeriesTable)
    .set({ status: "paused", updatedAt: new Date() })
    .where(and(eq(taskSeriesTable.id, id), eq(taskSeriesTable.userId, userId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Task series", id);
  }

  await deleteSchedule(id);
  logger.info({ id, userId }, "Task series paused");
}

/**
 * Resume a paused task series.
 */
export async function resumeTaskSeries(
  id: string,
  userId: string,
): Promise<void> {
  const [series] = await db
    .select()
    .from(taskSeriesTable)
    .where(and(eq(taskSeriesTable.id, id), eq(taskSeriesTable.userId, userId)))
    .limit(1);

  if (!series) {
    throw new NotFoundError("Task series", id);
  }

  if (series.status !== "paused") {
    throw new ValidationError(
      "Only paused task series can be resumed",
      "status",
    );
  }

  const tz = series.timezone ?? (await getUserTimezone(series.userId));
  const nextOccurrenceAt =
    getNextExecutionTime(series.cronExpression, new Date(), tz) ?? null;

  await db
    .update(taskSeriesTable)
    .set({ status: "active", nextOccurrenceAt, updatedAt: new Date() })
    .where(eq(taskSeriesTable.id, id));

  await upsertSchedule(series as TaskSeries);
  logger.info({ id, userId }, "Task series resumed");
}

// =============================================================================
// Occurrence Management (called by the worker on each cron tick)
// =============================================================================

/**
 * Create a new task occurrence from a series.
 * Called by the taskSeriesProcessor worker at each cron tick.
 */
export async function createOccurrence(
  seriesId: string,
): Promise<{ taskId: string; agentRunId?: string }> {
  const [series] = await db
    .select()
    .from(taskSeriesTable)
    .where(eq(taskSeriesTable.id, seriesId))
    .limit(1);

  if (!series || series.status !== "active") {
    logger.info(
      { seriesId, status: series?.status },
      "Skipping occurrence — series is not active",
    );
    return { taskId: "" };
  }

  // Create the task occurrence
  const taskId = generateTaskId();
  const now = new Date();

  await db.insert(tasksTable).values({
    id: taskId,
    userId: series.userId,
    title: series.title,
    description: series.description,
    status: "open",
    assigneeActorId: series.defaultAssigneeActorId,
    executionMode:
      series.executionPolicy === "assign_and_run" ? "agent_handles" : "manual",
    taskSeriesId: seriesId,
    occurrenceAt: now,
  });

  logger.info(
    { seriesId, taskId, userId: series.userId },
    "Task occurrence created",
  );

  // Update series counters
  const newCount = (series.occurrenceCount ?? 0) + 1;
  const reachedMax = series.maxOccurrences && newCount >= series.maxOccurrences;

  const tz = series.timezone ?? (await getUserTimezone(series.userId));
  const nextOccurrenceAt = reachedMax
    ? null
    : (getNextExecutionTime(series.cronExpression, now, tz) ?? null);

  await db
    .update(taskSeriesTable)
    .set({
      occurrenceCount: sql`${taskSeriesTable.occurrenceCount} + 1`,
      lastOccurrenceAt: now,
      nextOccurrenceAt,
      status: reachedMax ? "completed" : series.status,
      updatedAt: now,
    })
    .where(eq(taskSeriesTable.id, seriesId));

  if (reachedMax) {
    await deleteSchedule(seriesId);
    logger.info(
      { seriesId },
      "Task series completed (max occurrences reached)",
    );
  }

  // If policy is assign_and_run and there's an agent assignee, create an agent run
  let agentRunId: string | undefined;
  if (
    series.executionPolicy === "assign_and_run" &&
    series.defaultAssigneeActorId
  ) {
    const prompt = buildTaskPrompt(series.title, series.description);
    try {
      const run = await createAgentRun({
        taskId,
        userId: series.userId,
        requestedByActorId: series.userId, // system-initiated
        executorActorId: series.defaultAssigneeActorId,
        prompt,
      });
      agentRunId = run.id;
    } catch (error) {
      logger.error(
        { seriesId, taskId, error },
        "Failed to create agent run for occurrence",
      );
    }
  }

  return { taskId, agentRunId };
}

/**
 * Build the prompt for an agent run from task title and description.
 */
export function buildTaskPrompt(
  title: string,
  description: string | null,
): string {
  let prompt = `You have been assigned to work on this task.\n\nTask: ${title}`;
  if (description) {
    prompt += `\n\nDescription: ${description}`;
  }
  prompt +=
    "\n\nComplete this task using the available tools. When done, provide a summary of what you accomplished.";
  return prompt;
}
