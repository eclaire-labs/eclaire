/**
 * Scheduled Actions Service
 *
 * CRUD and scheduling logic for scheduled actions (reminders, agent runs).
 * Uses the queue system for delayed/recurring execution.
 */

import { eq, and, desc, sql } from "drizzle-orm";
import {
  generateScheduledActionId,
  generateScheduledActionExecutionId,
} from "@eclaire/core/id";
import { db, schema } from "../../db/index.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { getQueueAdapter } from "../queue/adapter.js";
import {
  isValidCronExpression,
  getNextExecutionTime,
} from "../queue/cron-utils.js";
import { QueueNames } from "../queue/queue-names.js";
import { getScheduler } from "../queue/scheduler.js";
import type { DeliveryTarget, ScheduledActionJobData } from "../queue/types.js";
import { getUserTimezone } from "./task-series.js";

const logger = createChildLogger("scheduled-actions");

// =============================================================================
// Types
// =============================================================================

export type ScheduledActionKind = "reminder" | "agent_run";
export type ScheduledActionStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled";
export type ScheduledActionTriggerType = "once" | "recurring";

export interface CreateScheduledActionParams {
  userId: string;
  kind: ScheduledActionKind;
  title: string;
  prompt: string;
  triggerType: ScheduledActionTriggerType;
  runAt?: string; // ISO 8601 datetime
  cronExpression?: string;
  timezone?: string;
  startAt?: string;
  endAt?: string;
  maxRuns?: number;
  deliveryTargets?: DeliveryTarget[];
  sourceConversationId?: string;
  agentActorId?: string;
  relatedTaskId?: string;
}

export interface ScheduledAction {
  id: string;
  userId: string;
  kind: ScheduledActionKind;
  status: ScheduledActionStatus;
  title: string;
  prompt: string;
  triggerType: ScheduledActionTriggerType;
  runAt: Date | null;
  cronExpression: string | null;
  timezone: string | null;
  startAt: Date | null;
  endAt: Date | null;
  maxRuns: number | null;
  runCount: number;
  deliveryTargets: DeliveryTarget[];
  sourceConversationId: string | null;
  agentActorId: string | null;
  relatedTaskId: string | null;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// Helpers
// =============================================================================

const scheduledActions = schema.scheduledActions;
const scheduledActionExecutions = schema.scheduledActionExecutions;

const SCHEDULE_KEY_PREFIX = "scheduled-action:";

function getScheduleKey(actionId: string): string {
  return `${SCHEDULE_KEY_PREFIX}${actionId}`;
}

/**
 * Create or update a recurring schedule via the unified scheduler.
 */
async function upsertRecurringSchedule(action: ScheduledAction): Promise<void> {
  const scheduler = await getScheduler();
  const timezone =
    action.timezone ?? (await getUserTimezone(action.userId)) ?? undefined;

  const jobData: Omit<ScheduledActionJobData, "requestId"> = {
    scheduledActionId: action.id,
    executionId: "", // Will be created by the worker at execution time
    userId: action.userId,
    kind: action.kind,
    title: action.title,
    prompt: action.prompt,
    deliveryTargets: action.deliveryTargets,
    sourceConversationId: action.sourceConversationId ?? undefined,
    agentActorId: action.agentActorId ?? undefined,
  };

  await scheduler.upsert({
    key: getScheduleKey(action.id),
    queue: QueueNames.SCHEDULED_ACTION_EXECUTION,
    cron: action.cronExpression as string,
    data: jobData,
    enabled: true,
    limit: action.maxRuns ?? undefined,
    endDate: action.endAt ?? undefined,
    timezone,
  });

  logger.info(
    {
      scheduledActionId: action.id,
      cron: action.cronExpression,
      timezone,
    },
    "Recurring schedule created/updated",
  );
}

/**
 * Remove a recurring schedule from the scheduler.
 */
async function deleteRecurringSchedule(actionId: string): Promise<void> {
  const scheduler = await getScheduler();
  const removed = await scheduler.remove(getScheduleKey(actionId));
  if (removed) {
    logger.info({ scheduledActionId: actionId }, "Recurring schedule deleted");
  } else {
    logger.debug(
      { scheduledActionId: actionId },
      "Recurring schedule not found (already removed)",
    );
  }
}

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create a scheduled action and enqueue its first execution.
 */
export async function createScheduledAction(
  params: CreateScheduledActionParams,
): Promise<ScheduledAction> {
  const table = scheduledActions;
  const id = generateScheduledActionId();

  // Validate trigger
  if (params.triggerType === "once") {
    if (!params.runAt) {
      throw new ValidationError(
        "runAt is required for one-time scheduled actions",
        "runAt",
      );
    }
    const runAtDate = new Date(params.runAt);
    if (runAtDate.getTime() <= Date.now()) {
      throw new ValidationError("runAt must be in the future", "runAt");
    }
  } else if (params.triggerType === "recurring") {
    if (!params.cronExpression) {
      throw new ValidationError(
        "cronExpression is required for recurring scheduled actions",
        "cronExpression",
      );
    }
    if (!isValidCronExpression(params.cronExpression)) {
      throw new ValidationError(
        `Invalid cron expression: "${params.cronExpression}". Use standard 5-field cron format (e.g., "0 9 * * *").`,
        "cronExpression",
      );
    }
  }

  // Validate relatedTaskId belongs to the user
  if (params.relatedTaskId) {
    const tasks = schema.tasks;
    const [task] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.id, params.relatedTaskId),
          eq(tasks.userId, params.userId),
        ),
      )
      .limit(1);
    if (!task) {
      throw new ValidationError(
        "Related task not found or does not belong to you",
        "relatedTaskId",
      );
    }
  }

  const runAtDate = params.runAt ? new Date(params.runAt) : null;
  const startAtDate = params.startAt ? new Date(params.startAt) : null;
  const endAtDate = params.endAt ? new Date(params.endAt) : null;

  const deliveryTargets: DeliveryTarget[] = params.deliveryTargets ?? [
    { type: "notification_channels" },
  ];

  // Compute nextRunAt: for one-time use runAt, for recurring compute from cron
  let nextRunAt: Date | null = runAtDate;
  if (params.triggerType === "recurring" && params.cronExpression) {
    const tz = params.timezone ?? (await getUserTimezone(params.userId));
    nextRunAt =
      getNextExecutionTime(params.cronExpression, new Date(), tz) ?? null;
  }

  const [created] = await db
    .insert(table)
    .values({
      id,
      userId: params.userId,
      kind: params.kind,
      status: "active",
      title: params.title,
      prompt: params.prompt,
      triggerType: params.triggerType,
      runAt: runAtDate,
      cronExpression: params.cronExpression ?? null,
      timezone: params.timezone ?? null,
      startAt: startAtDate,
      endAt: endAtDate,
      maxRuns: params.maxRuns ?? null,
      runCount: 0,
      deliveryTargets,
      sourceConversationId: params.sourceConversationId ?? null,
      agentActorId: params.agentActorId ?? null,
      relatedTaskId: params.relatedTaskId ?? null,
      nextRunAt,
    })
    .returning();

  logger.info(
    {
      id,
      userId: params.userId,
      kind: params.kind,
      triggerType: params.triggerType,
      nextRunAt,
    },
    "Scheduled action created",
  );

  // Enqueue execution or set up recurring schedule.
  // If enqueue fails, delete the orphaned record so users don't see
  // an "active" action that will never fire.
  try {
    if (params.triggerType === "once" && runAtDate) {
      await enqueueExecution(created as ScheduledAction, runAtDate);
    } else if (params.triggerType === "recurring" && params.cronExpression) {
      await upsertRecurringSchedule(created as ScheduledAction);
    }
  } catch (enqueueError) {
    logger.error(
      {
        id,
        error:
          enqueueError instanceof Error
            ? enqueueError.message
            : String(enqueueError),
      },
      "Failed to enqueue scheduled action, rolling back DB record",
    );
    try {
      await db.delete(table).where(eq(table.id, id));
    } catch (deleteError) {
      logger.error(
        { id, error: deleteError },
        "Failed to clean up orphaned scheduled action record",
      );
    }
    throw enqueueError;
  }

  return created as ScheduledAction;
}

/**
 * Get a scheduled action by ID.
 */
export async function getScheduledAction(
  id: string,
  userId: string,
): Promise<ScheduledAction | null> {
  const table = scheduledActions;
  const [action] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1);

  return (action as ScheduledAction) ?? null;
}

/**
 * List scheduled actions for a user.
 */
export async function listScheduledActions(
  userId: string,
  options?: {
    status?: ScheduledActionStatus;
    kind?: ScheduledActionKind;
    relatedTaskId?: string;
    limit?: number;
    offset?: number;
  },
): Promise<ScheduledAction[]> {
  const table = scheduledActions;
  const conditions = [eq(table.userId, userId)];

  if (options?.status) {
    conditions.push(eq(table.status, options.status));
  }
  if (options?.kind) {
    conditions.push(eq(table.kind, options.kind));
  }
  if (options?.relatedTaskId) {
    conditions.push(eq(table.relatedTaskId, options.relatedTaskId));
  }

  const results = await db
    .select()
    .from(table)
    .where(and(...conditions))
    .orderBy(desc(table.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return results as ScheduledAction[];
}

/**
 * Cancel a scheduled action.
 */
export async function cancelScheduledAction(
  id: string,
  userId: string,
): Promise<void> {
  const table = scheduledActions;
  const [updated] = await db
    .update(table)
    .set({
      status: "cancelled",
      nextRunAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .returning();

  if (!updated) {
    throw new NotFoundError("Scheduled action", id);
  }

  // Remove recurring schedule if any
  if (updated.triggerType === "recurring") {
    await deleteRecurringSchedule(id);
  }

  logger.info({ id, userId }, "Scheduled action cancelled");
}

/**
 * Delete a scheduled action.
 */
export async function deleteScheduledAction(
  id: string,
  userId: string,
): Promise<void> {
  const table = scheduledActions;

  // Check if it exists and get triggerType before deleting
  const [existing] = await db
    .select({ id: table.id, triggerType: table.triggerType })
    .from(table)
    .where(and(eq(table.id, id), eq(table.userId, userId)))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Scheduled action", id);
  }

  // Remove recurring schedule if any
  if (existing.triggerType === "recurring") {
    await deleteRecurringSchedule(id);
  }

  await db.delete(table).where(and(eq(table.id, id), eq(table.userId, userId)));

  logger.info({ id, userId }, "Scheduled action deleted");
}

// =============================================================================
// Execution Management
// =============================================================================

/**
 * Enqueue a job for a scheduled action execution.
 */
async function enqueueExecution(
  action: ScheduledAction,
  scheduledFor: Date,
): Promise<string> {
  const executionsTable = scheduledActionExecutions;
  const executionId = generateScheduledActionExecutionId();

  // Create execution record
  await db.insert(executionsTable).values({
    id: executionId,
    scheduledActionId: action.id,
    userId: action.userId,
    scheduledFor,
    status: "pending",
  });

  // Enqueue to queue
  const queueAdapter = await getQueueAdapter();
  await queueAdapter.enqueueScheduledAction({
    scheduledActionId: action.id,
    executionId,
    userId: action.userId,
    kind: action.kind,
    title: action.title,
    prompt: action.prompt,
    deliveryTargets: action.deliveryTargets,
    sourceConversationId: action.sourceConversationId ?? undefined,
    agentActorId: action.agentActorId ?? undefined,
    scheduledFor,
  });

  logger.info(
    {
      scheduledActionId: action.id,
      executionId,
      scheduledFor,
    },
    "Scheduled action execution enqueued",
  );

  return executionId;
}

/**
 * Get the status of an execution record (for idempotency checks).
 */
export async function getExecutionStatus(
  executionId: string,
): Promise<string | null> {
  const table = scheduledActionExecutions;
  const [row] = await db
    .select({ status: table.status })
    .from(table)
    .where(eq(table.id, executionId))
    .limit(1);
  return row?.status ?? null;
}

/**
 * Get the status of a scheduled action (for worker pre-execution checks).
 */
export async function getScheduledActionStatus(
  id: string,
): Promise<string | null> {
  const table = scheduledActions;
  const [row] = await db
    .select({ status: table.status })
    .from(table)
    .where(eq(table.id, id))
    .limit(1);
  return row?.status ?? null;
}

/**
 * Create an execution record (used by recurring jobs where the scheduler
 * doesn't pre-create an execution).
 */
export async function createExecutionRecord(
  scheduledActionId: string,
  userId: string,
): Promise<string> {
  const executionId = generateScheduledActionExecutionId();
  await db.insert(scheduledActionExecutions).values({
    id: executionId,
    scheduledActionId,
    userId,
    scheduledFor: new Date(),
    status: "pending",
  });
  return executionId;
}

/**
 * Mark an execution as started.
 */
export async function startExecution(executionId: string): Promise<void> {
  const table = scheduledActionExecutions;
  await db
    .update(table)
    .set({ status: "running", startedAt: new Date() })
    .where(eq(table.id, executionId));
}

/**
 * Mark an execution as completed.
 */
export async function completeExecution(
  executionId: string,
  output: string,
  deliveryResult?: Record<string, unknown>,
): Promise<void> {
  const table = scheduledActionExecutions;
  await db
    .update(table)
    .set({
      status: "completed",
      completedAt: new Date(),
      output,
      deliveryResult: deliveryResult ?? null,
    })
    .where(eq(table.id, executionId));
}

/**
 * Mark an execution as failed.
 */
export async function failExecution(
  executionId: string,
  error: string,
): Promise<void> {
  const table = scheduledActionExecutions;
  await db
    .update(table)
    .set({
      status: "failed",
      completedAt: new Date(),
      error,
    })
    .where(eq(table.id, executionId));
}

/**
 * Update the scheduled action after an execution completes.
 * Uses atomic SQL increment for runCount to avoid race conditions.
 */
export async function updateAfterExecution(
  scheduledActionId: string,
): Promise<void> {
  const table = scheduledActions;

  // Atomically increment runCount and get the updated row
  const [updated] = await db
    .update(table)
    .set({
      runCount: sql`${table.runCount} + 1`,
      lastRunAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(table.id, scheduledActionId))
    .returning();

  if (!updated) return;

  const newRunCount = updated.runCount ?? 1;
  const isOnce = updated.triggerType === "once";
  const reachedMaxRuns = updated.maxRuns && newRunCount >= updated.maxRuns;
  const shouldComplete = isOnce || reachedMaxRuns;

  // Compute nextRunAt for recurring actions, or null if completing
  let nextRunAt: Date | null = null;
  if (
    !shouldComplete &&
    updated.triggerType === "recurring" &&
    updated.cronExpression
  ) {
    const tz = updated.timezone ?? (await getUserTimezone(updated.userId));
    nextRunAt =
      getNextExecutionTime(updated.cronExpression, new Date(), tz) ?? null;
  }

  // Update status and nextRunAt in a second pass (only if state changed)
  if (shouldComplete || nextRunAt !== null) {
    await db
      .update(table)
      .set({
        nextRunAt,
        ...(shouldComplete ? { status: "completed" as const } : {}),
      })
      .where(eq(table.id, scheduledActionId));
  }

  logger.info(
    {
      scheduledActionId,
      runCount: newRunCount,
      nextRunAt,
      completed: shouldComplete,
    },
    "Scheduled action updated after execution",
  );
}

/**
 * List executions for a scheduled action.
 */
export async function listExecutions(
  scheduledActionId: string,
  userId: string,
  options?: { limit?: number; offset?: number },
): Promise<unknown[]> {
  const table = scheduledActionExecutions;
  const results = await db
    .select()
    .from(table)
    .where(
      and(
        eq(table.scheduledActionId, scheduledActionId),
        eq(table.userId, userId),
      ),
    )
    .orderBy(desc(table.createdAt))
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);

  return results;
}
