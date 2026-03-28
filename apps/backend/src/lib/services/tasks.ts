import {
  formatToISO8601,
  generateHistoryId,
  generateTaskId,
  type TaskStatus,
} from "@eclaire/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  type SQL,
} from "drizzle-orm";
import { db, queueJobs, schema, txManager } from "../../db/index.js";

const { tags, taskComments, tasks, tasksTags } = schema;

import {
  batchGetTags,
  buildTagFilterCondition,
  getOrCreateTags,
} from "../db-helpers.js";
import { buildTextSearchCondition } from "../search.js";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import {
  buildCursorCondition,
  encodeCursor,
  type CursorPaginatedResponse,
} from "../pagination.js";
import {
  isValidCronExpression,
  getNextExecutionTime,
} from "../queue/cron-utils.js";
import { getQueueAdapter } from "../queue/index.js";
import { QueueNames } from "../queue/queue-names.js";
import {
  getScheduler,
  getRecurringTaskScheduleKey,
} from "../queue/scheduler.js";
import { getActorSummaryOrNull } from "./actors.js";
import { recordHistory } from "./history.js";
import { formatTaskCommentForResponse } from "./taskComments.js";
import {
  callerActorId,
  callerOwnerUserId,
  type CallerContext,
} from "./types.js";

const logger = createChildLogger("services:tasks");

/** Common parameters for searching / counting tasks. */
export type FindTasksParams = {
  userId: string;
  text?: string;
  tags?: string[];
  taskStatus?: TaskStatus;
  attentionStatus?: string;
  scheduleType?: string;
  delegateModes?: string[];
  priority?: number;
  startDate?: Date;
  endDate?: Date;
  dueDateStart?: Date;
  dueDateEnd?: Date;
  parentId?: string;
  topLevelOnly?: boolean;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
};

// Queue name for task tag_generation jobs
const _TASK_PROCESSING_QUEUE = "task-processing";

interface ResolvedTaskDelegate {
  delegateActorId: string;
  kind: "human" | "agent" | "system" | "service";
}

async function resolveTaskDelegate(
  delegateActorId: string | null | undefined,
  currentUserId: string,
  allowFallback: boolean = true,
): Promise<ResolvedTaskDelegate> {
  if (!delegateActorId || !delegateActorId.trim()) {
    return {
      delegateActorId: currentUserId,
      kind: "human",
    };
  }

  const normalizedActorId = delegateActorId.trim();
  const actor = await getActorSummaryOrNull(currentUserId, normalizedActorId);

  if (actor?.kind === "human") {
    return {
      delegateActorId: normalizedActorId,
      kind: "human",
    };
  }

  if (actor?.kind === "agent") {
    return {
      delegateActorId: normalizedActorId,
      kind: "agent",
    };
  }

  if (allowFallback) {
    logger.warn(
      {
        invalidDelegateId: delegateActorId,
        currentUserId,
      },
      "Invalid delegate actor ID provided, defaulting to current user",
    );
    return {
      delegateActorId: currentUserId,
      kind: "human",
    };
  }

  throw new Error(
    `Invalid delegate actor ID: ${delegateActorId}. Delegate must be an existing human or agent actor.`,
  );
}

interface CreateTaskParams {
  title: string;
  description?: string;
  prompt?: string;
  taskStatus?: TaskStatus;
  priority?: number;
  dueAt?: string;
  delegateActorId?: string;
  delegatedByActorId?: string;
  delegateMode?: "manual" | "assist" | "handle";
  attentionStatus?:
    | "none"
    | "needs_triage"
    | "awaiting_input"
    | "needs_review"
    | "failed"
    | "urgent";
  reviewStatus?: "none" | "pending" | "approved" | "changes_requested";
  scheduleType?: "none" | "one_time" | "recurring";
  scheduleRule?: string;
  scheduleSummary?: string;
  timezone?: string;
  nextOccurrenceAt?: string;
  maxOccurrences?: number;
  deliveryTargets?: unknown;
  sourceConversationId?: string;
  tags?: string[];
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  processingEnabled?: boolean;
  sortOrder?: number | null;
  parentId?: string | null;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  prompt?: string;
  taskStatus?: string;
  priority?: number;
  dueAt?: string | null;
  delegateActorId?: string | null;
  delegateMode?: "manual" | "assist" | "handle";
  attentionStatus?: string;
  reviewStatus?: string;
  scheduleType?: string;
  scheduleRule?: string | null;
  scheduleSummary?: string | null;
  timezone?: string | null;
  nextOccurrenceAt?: string | null;
  maxOccurrences?: number | null;
  occurrenceCount?: number;
  latestExecutionStatus?: string | null;
  latestResultSummary?: string | null;
  latestErrorSummary?: string | null;
  deliveryTargets?: unknown;
  sourceConversationId?: string | null;
  tags?: string[];
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  processingEnabled?: boolean;
  sortOrder?: number | null;
  parentId?: string | null;
  completedAt?: string | null;
}

// Re-export TaskStatus from @eclaire/core for external use (e.g., API route)
export type { TaskStatus };

/**
 * Cleans a task object for API response by removing DB-specific fields
 * and adding properly formatted date fields.
 */
function cleanTaskForResponse(
  // biome-ignore lint/suspicious/noExplicitAny: raw DB row formatter
  task: any,
  tags: string[],
  processingStatus?: string | null,
  // biome-ignore lint/suspicious/noExplicitAny: raw DB row formatter
  comments: any[] = [],
  childCount?: number,
) {
  const dueAt = task.dueAt != null ? formatToISO8601(task.dueAt) : null;
  const completedAt =
    task.completedAt != null ? formatToISO8601(task.completedAt) : null;
  const nextOccurrenceAt =
    task.nextOccurrenceAt != null
      ? formatToISO8601(task.nextOccurrenceAt)
      : null;

  const { createdAt, updatedAt, ...cleanedTask } = task;

  return {
    ...cleanedTask,
    dueAt,
    completedAt,
    nextOccurrenceAt,
    delegateActorId: task.delegateActorId ?? null,
    createdAt: createdAt ? formatToISO8601(createdAt) : null,
    updatedAt: updatedAt ? formatToISO8601(updatedAt) : null,
    processingStatus: processingStatus,
    priority: task.priority ?? 0,
    sortOrder: task.sortOrder ?? null,
    parentId: task.parentId ?? null,
    childCount: childCount ?? 0,
    tags: tags,
    comments: comments,
  };
}

export async function createTask(
  taskData: CreateTaskParams,
  caller: CallerContext,
) {
  const userId = callerOwnerUserId(caller);
  const actorId = callerActorId(caller);
  try {
    // Convert dueAt string to Date object
    const dueAtValue = taskData.dueAt ? new Date(taskData.dueAt) : null;

    // Set completedAt if task is being created with "completed" status
    const taskStatus = taskData.taskStatus || "open";
    const completedAtValue = taskStatus === "completed" ? new Date() : null;

    const resolvedDelegate = await resolveTaskDelegate(
      taskData.delegateActorId,
      userId,
      true,
    );

    // Validate parentId if provided (single-level nesting, same user)
    if (taskData.parentId) {
      const parentTask = await db.query.tasks.findFirst({
        where: and(eq(tasks.id, taskData.parentId), eq(tasks.userId, userId)),
        columns: { id: true, parentId: true },
      });
      if (!parentTask) {
        throw new ValidationError(
          "Parent task not found or belongs to another user",
        );
      }
      if (parentTask.parentId !== null) {
        throw new ValidationError(
          "Cannot nest sub-tasks: parent is already a sub-task (single-level nesting only)",
        );
      }
    }

    // Pre-generate task ID and history ID before transaction
    const taskId = generateTaskId();
    const historyId = generateHistoryId();

    // Convert nextOccurrenceAt
    const nextOccurrenceAtValue = taskData.nextOccurrenceAt
      ? new Date(taskData.nextOccurrenceAt)
      : null;

    // Atomic transaction: insert task, tags, and history together
    await txManager.withTransaction(async (tx) => {
      // Auto-set delegateMode when assigning to an agent
      // If delegate is an agent and mode is "manual" (the default), upgrade to "assist"
      const delegateMode =
        resolvedDelegate.kind === "agent" &&
        (!taskData.delegateMode || taskData.delegateMode === "manual")
          ? "assist"
          : (taskData.delegateMode ?? "manual");

      // Auto-set delegatedByActorId when an agent creates a subtask for another actor
      const delegatedByActorId =
        taskData.delegatedByActorId ??
        (taskData.parentId &&
        actorId !== userId &&
        actorId !== resolvedDelegate.delegateActorId
          ? actorId
          : null);

      // Default reviewStatus: "none" for manual, "pending" for agent-assisted
      const reviewStatus =
        taskData.reviewStatus ??
        (delegateMode !== "manual" ? "pending" : "none");

      await tx.tasks.insert({
        id: taskId,
        userId: userId,
        title: taskData.title,
        description: taskData.description || null,
        prompt: taskData.prompt || null,
        taskStatus,
        dueAt: dueAtValue,
        delegateActorId: resolvedDelegate.delegateActorId,
        delegatedByActorId,
        delegateMode,
        attentionStatus: taskData.attentionStatus ?? "none",
        reviewStatus,
        scheduleType: taskData.scheduleType ?? "none",
        scheduleRule: taskData.scheduleRule ?? null,
        scheduleSummary: taskData.scheduleSummary ?? null,
        timezone: taskData.timezone ?? null,
        nextOccurrenceAt: nextOccurrenceAtValue,
        maxOccurrences: taskData.maxOccurrences ?? null,
        deliveryTargets: taskData.deliveryTargets ?? null,
        sourceConversationId: taskData.sourceConversationId ?? null,
        completedAt: completedAtValue,
        priority: taskData.priority ?? 0,
        processingEnabled: taskData.processingEnabled ?? true,
        processingStatus:
          (taskData.processingEnabled ?? true) ? "pending" : null,
        flagColor: taskData.flagColor || null,
        isPinned: taskData.isPinned || false,
        sortOrder: taskData.sortOrder ?? null,
        parentId: taskData.parentId || null,
      });

      // Handle tags inside transaction
      if (taskData.tags && taskData.tags.length > 0) {
        const tagList = await tx.getOrCreateTags(taskData.tags, userId);
        for (const tag of tagList) {
          await tx.tasksTags.insert({ taskId, tagId: tag.id });
        }
      }

      // Record history - atomic with the insert
      await tx.history.insert({
        id: historyId,
        action: "create",
        itemType: "task",
        itemId: taskId,
        itemName: taskData.title,
        beforeData: null,
        afterData: {
          id: taskId,
          title: taskData.title,
          description: taskData.description || null,
          taskStatus,
          dueAt: taskData.dueAt,
          tags: taskData.tags,
          delegateActorId: resolvedDelegate.delegateActorId,
        },
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    const queueAdapter = await getQueueAdapter();
    await queueAdapter.enqueueTask({
      taskId: taskId,
      title: taskData.title,
      description: taskData.description || "",
      userId: userId,
      jobType: "tag_generation",
    });
    logger.info({ taskId, userId }, "Queued task for AI tag processing");

    // Wire scheduling for recurring tasks
    if (taskData.scheduleType === "recurring" && taskData.scheduleRule) {
      if (!isValidCronExpression(taskData.scheduleRule)) {
        throw new ValidationError("Invalid cron expression for scheduleRule");
      }

      // Compute nextOccurrenceAt if not explicitly provided
      let computedNext = nextOccurrenceAtValue;
      if (!computedNext) {
        computedNext = getNextExecutionTime(
          taskData.scheduleRule,
          new Date(),
          taskData.timezone,
        );
        if (computedNext) {
          await db
            .update(tasks)
            .set({ nextOccurrenceAt: computedNext })
            .where(eq(tasks.id, taskId));
        }
      }

      const scheduler = await getScheduler();
      await scheduler.upsert({
        key: getRecurringTaskScheduleKey(taskId),
        queue: QueueNames.TASK_SCHEDULE_TICK,
        cron: taskData.scheduleRule,
        data: { taskId, userId },
        enabled: true,
        limit: taskData.maxOccurrences ?? undefined,
        timezone: taskData.timezone ?? undefined,
      });
      logger.info(
        { taskId, cron: taskData.scheduleRule },
        "Registered recurring schedule",
      );
    }

    // Wire scheduling for one-time tasks
    if (taskData.scheduleType === "one_time" && taskData.scheduleRule) {
      const scheduledFor = new Date(taskData.scheduleRule);
      if (Number.isNaN(scheduledFor.getTime())) {
        throw new ValidationError(
          "Invalid ISO datetime for one_time scheduleRule",
        );
      }

      // Set nextOccurrenceAt if not provided
      if (!nextOccurrenceAtValue) {
        await db
          .update(tasks)
          .set({ nextOccurrenceAt: scheduledFor })
          .where(eq(tasks.id, taskId));
      }

      // Determine kind
      const deliveryTargets = taskData.deliveryTargets as Array<{
        type: string;
        ref?: string;
      }> | null;
      const hasNotificationTargets =
        Array.isArray(deliveryTargets) &&
        deliveryTargets.some((t) => t.type === "notification_channels");
      const isAgentDelegate = resolvedDelegate.kind === "agent";
      const occurrenceKind =
        hasNotificationTargets && !isAgentDelegate
          ? "reminder"
          : "scheduled_run";

      const { createTaskOccurrence } = await import("./task-occurrences.js");
      await createTaskOccurrence({
        taskId,
        userId,
        kind: occurrenceKind,
        prompt: taskData.prompt ?? taskData.title,
        executorActorId: resolvedDelegate.delegateActorId ?? undefined,
        scheduledFor,
      });

      await db
        .update(tasks)
        .set({ latestExecutionStatus: "scheduled" })
        .where(eq(tasks.id, taskId));

      logger.info(
        { taskId, scheduledFor: scheduledFor.toISOString() },
        "Created one-time scheduled occurrence",
      );
    }

    // Auto-execute agent-delegated tasks with no schedule
    if (
      taskData.scheduleType !== "recurring" &&
      taskData.scheduleType !== "one_time" &&
      resolvedDelegate.kind === "agent"
    ) {
      const { createTaskOccurrence } = await import("./task-occurrences.js");
      await createTaskOccurrence({
        taskId,
        userId,
        kind: "manual_run",
        prompt: taskData.prompt ?? taskData.title,
        executorActorId: resolvedDelegate.delegateActorId ?? undefined,
      });

      await db
        .update(tasks)
        .set({
          taskStatus: "in_progress",
          latestExecutionStatus: "queued",
        })
        .where(eq(tasks.id, taskId));

      logger.info({ taskId }, "Auto-started agent-delegated task");
    }

    // Fetch the complete task with tags to return the consistent API response format
    const taskWithTags = await getTaskWithTags(taskId);
    return taskWithTags;
  } catch (error) {
    logger.error(
      {
        taskData,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating task",
    );

    if (error instanceof ValidationError) {
      throw error;
    }

    throw new Error("Failed to create task");
  }
}

export async function updateTask(
  id: string,
  taskData: UpdateTaskParams,
  caller: CallerContext,
) {
  const userId = callerOwnerUserId(caller);
  const actorId = callerActorId(caller);
  try {
    // Get existing task first
    const existingTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
    });

    if (!existingTask) {
      throw new NotFoundError("Task");
    }

    // Get current task tags before update for history
    const currentTaskTags = await getTaskTags(id);

    // Create a data object without tags for the task update
    const { tags: tagNames, ...taskUpdateData } = taskData;
    let resolvedDelegate: ResolvedTaskDelegate | null = null;

    // Validate delegate actor if it's being updated - strict validation (no fallback)
    if ("delegateActorId" in taskUpdateData) {
      resolvedDelegate = await resolveTaskDelegate(
        taskUpdateData.delegateActorId,
        userId,
        false,
      );
      taskUpdateData.delegateActorId = resolvedDelegate.delegateActorId;
    }

    // Validate parentId if being changed (single-level nesting, same user)
    if ("parentId" in taskUpdateData && taskUpdateData.parentId) {
      const parentTask = await db.query.tasks.findFirst({
        where: and(
          eq(tasks.id, taskUpdateData.parentId),
          eq(tasks.userId, userId),
        ),
        columns: { id: true, parentId: true },
      });
      if (!parentTask) {
        throw new ValidationError(
          "Parent task not found or belongs to another user",
        );
      }
      if (parentTask.parentId !== null) {
        throw new ValidationError(
          "Cannot nest sub-tasks: parent is already a sub-task (single-level nesting only)",
        );
      }
      if (taskUpdateData.parentId === id) {
        throw new ValidationError("A task cannot be its own parent");
      }
    }

    // Convert dueAt string to Date object
    let dueAtValue: Date | null = null;
    let includeDueAtUpdate = false;

    if (Object.hasOwn(taskUpdateData, "dueAt")) {
      includeDueAtUpdate = true;
      dueAtValue = taskUpdateData.dueAt ? new Date(taskUpdateData.dueAt) : null;
    }

    // Handle completedAt logic based on status changes
    let completedAtValue: Date | null = null;
    let includeCompletedAtUpdate = false;

    if (Object.hasOwn(taskUpdateData, "completedAt")) {
      includeCompletedAtUpdate = true;
      completedAtValue = taskUpdateData.completedAt
        ? new Date(taskUpdateData.completedAt)
        : null;
    } else if (Object.hasOwn(taskUpdateData, "taskStatus")) {
      includeCompletedAtUpdate = true;
      if (taskUpdateData.taskStatus === "completed") {
        completedAtValue =
          existingTask.taskStatus !== "completed"
            ? new Date()
            : existingTask.completedAt;
      } else {
        completedAtValue = null;
      }
    }

    // Handle nextOccurrenceAt conversion
    let nextOccurrenceAtValue: Date | null = null;
    let includeNextOccurrenceAtUpdate = false;

    if (Object.hasOwn(taskUpdateData, "nextOccurrenceAt")) {
      includeNextOccurrenceAtUpdate = true;
      nextOccurrenceAtValue = taskUpdateData.nextOccurrenceAt
        ? new Date(taskUpdateData.nextOccurrenceAt)
        : null;
    }

    // Build the update set additively
    // biome-ignore lint/suspicious/noExplicitAny: dynamic update object
    const updateSet: { [key: string]: any } = {
      updatedAt: new Date(),
    };

    // Copy simple scalar fields (exclude date fields handled separately)
    for (const key of Object.keys(
      taskUpdateData,
    ) as (keyof typeof taskUpdateData)[]) {
      if (
        key === "dueAt" ||
        key === "completedAt" ||
        key === "nextOccurrenceAt"
      )
        continue;
      updateSet[key] = taskUpdateData[key];
    }

    if (resolvedDelegate) {
      updateSet.delegateActorId = resolvedDelegate.delegateActorId;
      // Auto-upgrade delegateMode when reassigning to an agent (if still manual)
      if (
        resolvedDelegate.kind === "agent" &&
        existingTask.delegateMode === "manual" &&
        !("delegateMode" in taskUpdateData)
      ) {
        updateSet.delegateMode = "assist";
      }
    }

    if (includeDueAtUpdate) {
      updateSet.dueAt = dueAtValue;
    }

    if (includeCompletedAtUpdate) {
      updateSet.completedAt = completedAtValue;
    }

    if (includeNextOccurrenceAtUpdate) {
      updateSet.nextOccurrenceAt = nextOccurrenceAtValue;
    }

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Format existingTask for history (before transaction)
    const formattedExistingTask = cleanTaskForResponse(
      existingTask,
      currentTaskTags,
    );

    // Atomic transaction: update task, handle tags, and record history together
    await txManager.withTransaction(async (tx) => {
      await tx.tasks.update(
        and(eq(tasks.id, id), eq(tasks.userId, userId)),
        updateSet,
      );

      // Handle tags if provided
      if (tagNames) {
        await tx.tasksTags.delete(eq(tasksTags.taskId, id));
        if (tagNames.length > 0) {
          const tagList = await tx.getOrCreateTags(tagNames, userId);
          for (const tag of tagList) {
            await tx.tasksTags.insert({ taskId: id, tagId: tag.id });
          }
        }
      }

      // Record history for task update
      await tx.history.insert({
        id: historyId,
        action: "update",
        itemType: "task",
        itemId: id,
        itemName: taskData.title || existingTask.title,
        beforeData: formattedExistingTask,
        afterData: {
          ...formattedExistingTask,
          ...taskData,
          tags: tagNames ?? currentTaskTags,
        },
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Handle schedule changes
    const scheduleTypeChanged = "scheduleType" in taskData;
    const scheduleRuleChanged = "scheduleRule" in taskData;

    if (scheduleTypeChanged || scheduleRuleChanged) {
      const effectiveScheduleType =
        taskData.scheduleType ?? existingTask.scheduleType;
      const effectiveScheduleRule =
        taskData.scheduleRule ?? existingTask.scheduleRule;
      const effectiveTimezone = taskData.timezone ?? existingTask.timezone;

      const scheduler = await getScheduler();
      const scheduleKey = getRecurringTaskScheduleKey(id);

      if (
        effectiveScheduleType === "recurring" &&
        effectiveScheduleRule &&
        isValidCronExpression(effectiveScheduleRule)
      ) {
        await scheduler.upsert({
          key: scheduleKey,
          queue: QueueNames.TASK_SCHEDULE_TICK,
          cron: effectiveScheduleRule,
          data: { taskId: id, userId },
          enabled: true,
          limit:
            taskData.maxOccurrences ?? existingTask.maxOccurrences ?? undefined,
          timezone: effectiveTimezone ?? undefined,
        });

        const next = getNextExecutionTime(
          effectiveScheduleRule,
          new Date(),
          effectiveTimezone,
        );
        if (next) {
          await db
            .update(tasks)
            .set({ nextOccurrenceAt: next })
            .where(eq(tasks.id, id));
        }
      } else if (
        existingTask.scheduleType === "recurring" &&
        effectiveScheduleType !== "recurring"
      ) {
        try {
          await scheduler.remove(scheduleKey);
        } catch (err) {
          logger.warn(
            { taskId: id, error: err },
            "Failed to remove schedule on type change",
          );
        }
      }
    }

    const taskWithTags = await getTaskWithTags(id);
    return taskWithTags;
  } catch (error) {
    logger.error(
      {
        taskId: id,
        taskData,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error updating task",
    );

    if (
      error instanceof NotFoundError ||
      error instanceof ValidationError ||
      error instanceof ForbiddenError
    ) {
      throw error;
    }

    throw new Error("Failed to update task");
  }
}

/**
 * Updates task status specifically for AI assistants assigned to the task
 */
export async function updateTaskStatusAsAssistant(
  taskId: string,
  status: TaskStatus,
  caller: CallerContext,
  completedAt?: string | null,
): Promise<void> {
  const actorId = callerActorId(caller);
  try {
    logger.info(
      { taskId, status, assignedAssistantId: actorId, completedAt },
      "Updating task status as assistant",
    );

    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: {
        id: true,
        userId: true,
        delegateActorId: true,
        taskStatus: true,
        completedAt: true,
      },
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    if (task.delegateActorId !== actorId) {
      throw new Error(`Assistant ${actorId} is not assigned to task ${taskId}`);
    }

    const beforeData = {
      taskStatus: task.taskStatus,
      completedAt: task.completedAt,
    };

    // biome-ignore lint/suspicious/noExplicitAny: dynamic update object
    const updateData: any = {
      taskStatus: status,
      updatedAt: new Date(),
    };

    if (status === "completed" && completedAt) {
      updateData.completedAt = new Date(completedAt);
    }

    const updatedTask = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    if (!updatedTask.length) {
      throw new Error("Failed to update task status");
    }

    const afterData = {
      taskStatus: updatedTask[0]?.taskStatus,
      completedAt: updatedTask[0]?.completedAt,
    };

    await recordHistory({
      action: "update",
      itemType: "task",
      itemId: taskId,
      itemName: `Task status updated to ${status}`,
      beforeData,
      afterData,
      userId: task.userId,
      actor: caller.actor,
      actorId,
      metadata: {
        updatedFields: ["taskStatus", ...(completedAt ? ["completedAt"] : [])],
        statusChange: `${beforeData.taskStatus} → ${status}`,
        assistantId: actorId,
      },
    });

    logger.info(
      {
        taskId,
        status,
        assignedAssistantId: actorId,
        taskOwner: task.userId,
      },
      "Task status updated successfully by assistant",
    );
  } catch (error) {
    logger.error(
      {
        taskId,
        status,
        assignedAssistantId: actorId,
        completedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to update task status as assistant",
    );
    throw error;
  }
}

// Backward-compatible re-exports for route files
export {
  NotFoundError as TaskNotFoundError,
  ForbiddenError as TaskUnauthorizedError,
};

export async function updateTaskArtifacts(
  taskId: string,
  artifacts: {
    tags?: string[];
  },
): Promise<void> {
  try {
    if (artifacts.tags === undefined || !Array.isArray(artifacts.tags)) {
      logger.warn(
        { taskId },
        "updateTaskArtifacts called with no valid tags artifact.",
      );
      return;
    }

    const task = await db.query.tasks.findFirst({
      columns: { userId: true },
      where: eq(tasks.id, taskId),
    });

    if (!task) {
      logger.warn(
        { taskId },
        "Task not found for artifact update, skipping processing",
      );
      return;
    }

    logger.info(
      { taskId, tags: artifacts.tags },
      "Updating task with new AI-generated tags.",
    );

    let tagList: { id: string; name: string }[] = [];
    if (artifacts.tags && artifacts.tags.length > 0) {
      tagList = await getOrCreateTags(artifacts.tags, task.userId);
    }

    await txManager.withTransaction(async (tx) => {
      await tx.tasksTags.delete(eq(tasksTags.taskId, taskId));
      if (tagList.length > 0) {
        for (const tag of tagList) {
          await tx.tasksTags.insert({ taskId, tagId: tag.id });
        }
      }
      await tx.tasks.update(eq(tasks.id, taskId), { updatedAt: new Date() });
    });
  } catch (err) {
    logger.error(
      {
        taskId,
        artifacts,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Error updating task artifacts",
    );
    throw err;
  }
}

export async function deleteTask(
  id: string,
  userId: string,
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  try {
    logger.info({ taskId: id, userId }, "Starting task deletion process");

    const existingTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
    });

    if (!existingTask) {
      logger.warn({ taskId: id, userId }, "Task not found for deletion");
      throw new NotFoundError("Task");
    }

    const taskTags = await getTaskTags(id);
    const historyId = generateHistoryId();

    await txManager.withTransaction(async (tx) => {
      await tx.tasksTags.delete(eq(tasksTags.taskId, id));
      await tx.tasks.delete(and(eq(tasks.id, id), eq(tasks.userId, userId)));
      await tx.history.insert({
        id: historyId,
        action: "delete",
        itemType: "task",
        itemId: id,
        itemName: existingTask.title,
        beforeData: { ...existingTask, tags: taskTags },
        afterData: null,
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    await db.delete(queueJobs).where(eq(queueJobs.key, `tasks:${id}`));

    // Remove recurring schedule if applicable
    if (existingTask.scheduleType === "recurring") {
      try {
        const scheduler = await getScheduler();
        await scheduler.remove(getRecurringTaskScheduleKey(id));
      } catch (err) {
        logger.warn(
          { taskId: id, error: err },
          "Failed to remove schedule during deletion",
        );
      }
    }

    return { success: true };
  } catch (error) {
    logger.error(
      {
        taskId: id,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error deleting task",
    );
    throw new Error("Failed to delete task");
  }
}

export async function getTaskById(taskId: string, userId: string) {
  try {
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (!task) {
      return null;
    }

    const [taskTagNames, taskCommentsData, childCountResult] =
      await Promise.all([
        getTaskTags(taskId),
        getTaskCommentsWithUsers(taskId, task.userId),
        db
          .select({ value: count() })
          .from(tasks)
          .where(eq(tasks.parentId, taskId)),
      ]);

    const response = cleanTaskForResponse(
      task,
      taskTagNames,
      task.processingStatus,
      taskCommentsData,
      childCountResult[0]?.value ?? 0,
    );

    return response;
  } catch (error) {
    logger.error(
      {
        taskId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting task by ID",
    );
    throw new Error("Failed to fetch task due to an unexpected error");
  }
}

// Helper function to get tags for a task
async function getTaskTags(taskId: string): Promise<string[]> {
  const taskTagsJoin = await db
    .select({ name: tags.name })
    .from(tasksTags)
    .innerJoin(tags, eq(tasksTags.tagId, tags.id))
    .where(eq(tasksTags.taskId, taskId));

  return taskTagsJoin.map((tag) => tag.name);
}

// Helper function to get comments for a task with user info
async function getTaskCommentsWithUsers(
  taskId: string,
  taskOwnerUserId: string,
) {
  const comments = await db.query.taskComments.findMany({
    where: eq(taskComments.taskId, taskId),
    with: {
      user: {
        columns: {
          id: true,
          displayName: true,
          userType: true,
        },
      },
    },
    orderBy: [desc(taskComments.createdAt)],
  });

  return Promise.all(
    comments.map((comment) =>
      formatTaskCommentForResponse(comment, taskOwnerUserId),
    ),
  );
}

// Helper function to get a task with its tags
async function getTaskWithTags(taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) return null;

  const taskTagNames = await getTaskTags(taskId);

  return cleanTaskForResponse(task, taskTagNames, task.processingStatus);
}

/**
 * Builds the common query conditions for finding/counting tasks.
 */
function _buildTaskQueryConditions({
  userId,
  text,
  taskStatus,
  attentionStatus,
  scheduleType,
  delegateModes,
  priority,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
  parentId,
  topLevelOnly,
}: FindTasksParams): (SQL | undefined)[] {
  const definedConditions: (SQL | undefined)[] = [eq(tasks.userId, userId)];

  if (text?.trim()) {
    definedConditions.push(
      buildTextSearchCondition(text, tasks.searchVector, [
        tasks.title,
        tasks.description,
      ]),
    );
  }

  if (taskStatus) {
    definedConditions.push(eq(tasks.taskStatus, taskStatus));
  }

  if (attentionStatus) {
    definedConditions.push(
      eq(
        tasks.attentionStatus,
        attentionStatus as (typeof tasks.attentionStatus.enumValues)[number],
      ),
    );
  }

  if (scheduleType) {
    definedConditions.push(
      eq(
        tasks.scheduleType,
        scheduleType as (typeof tasks.scheduleType.enumValues)[number],
      ),
    );
  }

  if (delegateModes?.length) {
    definedConditions.push(
      inArray(
        tasks.delegateMode,
        delegateModes as (typeof tasks.delegateMode.enumValues)[number][],
      ),
    );
  }

  if (priority !== undefined) {
    definedConditions.push(eq(tasks.priority, priority));
  }

  if (startDate) {
    definedConditions.push(
      and(isNotNull(tasks.dueAt), gte(tasks.dueAt, startDate)),
    );
  }

  if (endDate) {
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    definedConditions.push(
      and(isNotNull(tasks.dueAt), lte(tasks.dueAt, endOfDay)),
    );
  }

  if (dueDateStart) {
    definedConditions.push(
      and(isNotNull(tasks.dueAt), gte(tasks.dueAt, dueDateStart)),
    );
  }

  if (dueDateEnd) {
    definedConditions.push(
      and(isNotNull(tasks.dueAt), lte(tasks.dueAt, dueDateEnd)),
    );
  }

  if (parentId) {
    definedConditions.push(eq(tasks.parentId, parentId));
  } else if (topLevelOnly) {
    definedConditions.push(isNull(tasks.parentId));
  }

  return definedConditions;
}

/**
 * Search tasks by text, tags, status, and date range (cursor-based pagination).
 */
export async function findTasks({
  userId,
  text,
  tags: tagsList,
  taskStatus,
  attentionStatus,
  scheduleType,
  delegateModes,
  priority,
  startDate,
  endDate,
  limit = 50,
  dueDateStart,
  dueDateEnd,
  parentId,
  topLevelOnly,
  cursor,
  sortBy = "createdAt",
  sortDir = "desc",
}: FindTasksParams & { limit?: number }) {
  try {
    const conditions = _buildTaskQueryConditions({
      userId,
      text,
      taskStatus,
      attentionStatus,
      scheduleType,
      delegateModes,
      priority,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
      parentId,
      topLevelOnly,
    });

    // Resolve sort column
    // biome-ignore lint/suspicious/noExplicitAny: maps sort keys to Drizzle column objects
    const sortColumnMap: Record<string, any> = {
      createdAt: tasks.createdAt,
      dueAt: tasks.dueAt,
      taskStatus: tasks.taskStatus,
      title: tasks.title,
      priority: tasks.priority,
      sortOrder: tasks.sortOrder,
      updatedAt: tasks.updatedAt,
    };
    const sortColumn = sortColumnMap[sortBy] || tasks.createdAt;
    const orderDir = sortDir === "asc" ? asc : desc;

    if (cursor) {
      conditions.push(
        buildCursorCondition(sortColumn, tasks.id, cursor, sortDir),
      );
    }

    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          tasksTags,
          tasksTags.taskId,
          tasksTags.tagId,
          tagsList,
          userId,
          tasks.id,
        ),
      );
    }

    const fetchLimit = limit + 1;
    const matched = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(...conditions))
      .orderBy(orderDir(sortColumn), orderDir(tasks.id))
      .limit(fetchLimit);
    let finalIds: string[] = matched.map((e) => e.id);

    if (finalIds.length === 0)
      return { items: [], nextCursor: null, hasMore: false };

    const hasMore = finalIds.length > limit;
    if (hasMore) finalIds = finalIds.slice(0, limit);

    const [entriesList, tagMap, childCounts] = await Promise.all([
      db
        .select()
        .from(tasks)
        .where(inArray(tasks.id, finalIds))
        .orderBy(orderDir(sortColumn), orderDir(tasks.id)),
      batchGetTags(tasksTags, tasksTags.taskId, tasksTags.tagId, finalIds),
      db
        .select({
          parentId: tasks.parentId,
          count: count(),
        })
        .from(tasks)
        .where(inArray(tasks.parentId, finalIds))
        .groupBy(tasks.parentId),
    ]);

    const childCountMap = new Map<string, number>();
    for (const row of childCounts) {
      if (row.parentId) childCountMap.set(row.parentId, row.count);
    }

    const items = entriesList.map((task) => {
      return cleanTaskForResponse(
        task,
        tagMap.get(task.id) ?? [],
        task.processingStatus,
        [],
        childCountMap.get(task.id) ?? 0,
      );
    });

    const lastItem = items[items.length - 1];
    // biome-ignore lint/suspicious/noExplicitAny: sort value type varies
    const getSortVal = (item: any) => {
      if (sortBy === "title") return item.title;
      if (sortBy === "dueAt") return item.dueAt;
      if (sortBy === "taskStatus") return item.taskStatus;
      if (sortBy === "priority") return item.priority;
      if (sortBy === "sortOrder") return item.sortOrder;
      if (sortBy === "updatedAt") return item.updatedAt;
      return item.createdAt;
    };
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(getSortVal(lastItem), lastItem.id)
        : null;

    return { items, nextCursor, hasMore };
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        taskStatus,
        startDate,
        endDate,
        limit,
        dueDateStart,
        dueDateEnd,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error searching tasks",
    );
    throw new Error("Failed to search tasks");
  }
}

/**
 * Count tasks matching criteria.
 */
export async function countTasks({
  userId,
  text,
  tags: tagsList,
  taskStatus,
  attentionStatus,
  scheduleType,
  delegateModes,
  priority,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
  parentId,
  topLevelOnly,
}: FindTasksParams): Promise<number> {
  try {
    const conditions = _buildTaskQueryConditions({
      userId,
      text,
      taskStatus,
      attentionStatus,
      scheduleType,
      delegateModes,
      priority,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
      parentId,
      topLevelOnly,
    });

    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          tasksTags,
          tasksTags.taskId,
          tasksTags.tagId,
          tagsList,
          userId,
          tasks.id,
        ),
      );
    }

    const [result] = await db
      .select({ value: count() })
      .from(tasks)
      .where(and(...conditions));
    return result?.value ?? 0;
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        taskStatus,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error counting tasks",
    );
    throw new Error("Failed to count tasks");
  }
}

/**
 * Runs findTasks and (on first page only) countTasks in parallel.
 */
export async function findTasksPaginated(
  params: FindTasksParams & { limit?: number },
): Promise<
  CursorPaginatedResponse<
    Awaited<ReturnType<typeof findTasks>>["items"][number]
  >
> {
  const isFirstPage = !params.cursor;

  if (isFirstPage) {
    const [result, totalCount] = await Promise.all([
      findTasks(params),
      countTasks(params),
    ]);
    return { ...result, totalCount };
  }

  return findTasks(params);
}

/**
 * Re-processes an existing task by using the existing retry logic.
 */
export async function reprocessTask(
  taskId: string,
  userId: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    const task = await getTaskById(taskId, userId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    const { retryAssetProcessing } = await import("./processing-status.js");
    const result = await retryAssetProcessing("tasks", taskId, userId, force);

    if (result.success) {
      logger.info(
        { taskId, userId },
        "Successfully queued task for reprocessing using retry logic",
      );
    } else {
      logger.error(
        { taskId, userId, error: result.error },
        "Failed to reprocess task using retry logic",
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        taskId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error reprocessing task",
    );
    return { success: false, error: "Failed to reprocess task" };
  }
}

// ============================================================================
// Inbox
// ============================================================================

/**
 * Get inbox items — tasks that need user attention.
 */
export async function getInbox(userId: string) {
  const inboxTasks = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, userId), ne(tasks.attentionStatus, "none")))
    .orderBy(desc(tasks.updatedAt));

  // Group by attention_status into sections
  const sections = {
    needsReview: [] as typeof inboxTasks,
    waitingOnYou: [] as typeof inboxTasks,
    failed: [] as typeof inboxTasks,
    needsTriage: [] as typeof inboxTasks,
    urgent: [] as typeof inboxTasks,
  };

  for (const task of inboxTasks) {
    switch (task.attentionStatus) {
      case "needs_review":
        sections.needsReview.push(task);
        break;
      case "awaiting_input":
        sections.waitingOnYou.push(task);
        break;
      case "failed":
        sections.failed.push(task);
        break;
      case "needs_triage":
        sections.needsTriage.push(task);
        break;
      case "urgent":
        sections.urgent.push(task);
        break;
    }
  }

  // Get tags for all inbox tasks
  const allIds = inboxTasks.map((t) => t.id);
  const tagMap =
    allIds.length > 0
      ? await batchGetTags(tasksTags, tasksTags.taskId, tasksTags.tagId, allIds)
      : new Map<string, string[]>();

  const formatInboxTask = (task: (typeof inboxTasks)[number]) => {
    const reasonTextMap: Record<string, string> = {
      needs_triage: "New task awaiting triage",
      awaiting_input: "Agent needs your answer",
      needs_review: "Agent completed work and needs approval",
      failed: "Latest run failed",
      urgent: task.dueAt
        ? `Due ${formatToISO8601(task.dueAt)}`
        : "Needs attention",
    };

    return {
      taskId: task.id,
      title: task.title,
      userId: task.userId,
      delegateActorId: task.delegateActorId,
      taskStatus: task.taskStatus,
      attentionStatus: task.attentionStatus,
      reasonText: reasonTextMap[task.attentionStatus] ?? "Needs attention",
      dueAt: task.dueAt ? formatToISO8601(task.dueAt) : null,
      nextOccurrenceAt: task.nextOccurrenceAt
        ? formatToISO8601(task.nextOccurrenceAt)
        : null,
      latestExecutionStatus: task.latestExecutionStatus,
      latestResultSummary: task.latestResultSummary,
      latestErrorSummary: task.latestErrorSummary,
      reviewStatus: task.reviewStatus,
      scheduleSummary: task.scheduleSummary,
      tags: tagMap.get(task.id) ?? [],
      updatedAt: task.updatedAt ? formatToISO8601(task.updatedAt) : null,
    };
  };

  return {
    sections: {
      needsReview: sections.needsReview.map(formatInboxTask),
      waitingOnYou: sections.waitingOnYou.map(formatInboxTask),
      failed: sections.failed.map(formatInboxTask),
      needsTriage: sections.needsTriage.map(formatInboxTask),
      urgent: sections.urgent.map(formatInboxTask),
    },
    totalCount: inboxTasks.length,
  };
}

// ============================================================================
// Task Occurrence Queries (for task enrichment)
// ============================================================================

/**
 * Get paginated occurrence history for a task.
 */
export async function getTaskOccurrences(
  taskId: string,
  userId: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<
  CursorPaginatedResponse<typeof schema.taskOccurrences.$inferSelect>
> {
  const taskOccurrences = schema.taskOccurrences;
  const limit = params.limit ?? 20;

  const conditions: SQL[] = [
    eq(taskOccurrences.taskId, taskId),
    eq(taskOccurrences.userId, userId),
  ];

  if (params.cursor) {
    conditions.push(
      buildCursorCondition(
        taskOccurrences.createdAt,
        taskOccurrences.id,
        params.cursor,
        "desc",
      ),
    );
  }

  const rows = await db
    .select()
    .from(taskOccurrences)
    .where(and(...conditions))
    .orderBy(desc(taskOccurrences.createdAt), desc(taskOccurrences.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastItem = items[items.length - 1];
  const nextCursor =
    hasMore && lastItem
      ? encodeCursor(lastItem.createdAt?.getTime() ?? null, lastItem.id)
      : null;

  return { items, nextCursor, hasMore };
}

// ============================================================================
// Task Actions (inbox state machine transitions)
// ============================================================================

/**
 * Start immediate execution of a task — creates an occurrence and enqueues it.
 */
export async function startTask(
  taskId: string,
  userId: string,
): Promise<{ occurrenceId: string }> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: {
      id: true,
      delegateActorId: true,
      delegateMode: true,
      prompt: true,
    },
  });
  if (!task) throw new NotFoundError("Task");

  const { createTaskOccurrence } = await import("./task-occurrences.js");
  const occurrence = await createTaskOccurrence({
    taskId,
    userId,
    kind: "manual_run",
    prompt: task.prompt ?? undefined,
    executorActorId: task.delegateActorId ?? undefined,
  });

  await db
    .update(tasks)
    .set({
      taskStatus: "in_progress",
      latestExecutionStatus: "queued",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return { occurrenceId: occurrence.id };
}

/**
 * Retry a failed task — creates a new occurrence as a retry.
 */
export async function retryTask(
  taskId: string,
  userId: string,
  editedPrompt?: string,
): Promise<{ occurrenceId: string }> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: {
      id: true,
      delegateActorId: true,
      prompt: true,
    },
  });
  if (!task) throw new NotFoundError("Task");

  const { createTaskOccurrence } = await import("./task-occurrences.js");
  const occurrence = await createTaskOccurrence({
    taskId,
    userId,
    kind: "manual_run",
    prompt: editedPrompt ?? task.prompt ?? undefined,
    executorActorId: task.delegateActorId ?? undefined,
  });

  await db
    .update(tasks)
    .set({
      attentionStatus: "none",
      latestExecutionStatus: "queued",
      latestErrorSummary: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return { occurrenceId: occurrence.id };
}

/**
 * Cancel the current queued/running occurrence.
 */
export async function cancelTaskOccurrence(
  taskId: string,
  userId: string,
): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: { id: true },
  });
  if (!task) throw new NotFoundError("Task");

  // Cancel any queued/running occurrences
  const taskOccurrences = schema.taskOccurrences;
  await db
    .update(taskOccurrences)
    .set({ executionStatus: "cancelled" })
    .where(
      and(
        eq(taskOccurrences.taskId, taskId),
        inArray(taskOccurrences.executionStatus, ["queued", "running"]),
      ),
    );

  await db
    .update(tasks)
    .set({
      attentionStatus: "none",
      latestExecutionStatus: "cancelled",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

/**
 * Pause a recurring task — stops future occurrences.
 */
export async function pauseTask(taskId: string, userId: string): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: { id: true, scheduleType: true },
  });
  if (!task) throw new NotFoundError("Task");
  if (task.scheduleType !== "recurring") {
    throw new ValidationError("Only recurring tasks can be paused");
  }

  await db
    .update(tasks)
    .set({
      // Keep scheduleType as 'recurring' but clear nextOccurrenceAt to pause
      nextOccurrenceAt: null,
      taskStatus: "blocked",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Disable the schedule
  try {
    const scheduler = await getScheduler();
    await scheduler.setEnabled(getRecurringTaskScheduleKey(taskId), false);
  } catch (err) {
    logger.warn(
      { taskId, error: err },
      "Failed to disable schedule (may not exist)",
    );
  }
}

/**
 * Resume a paused recurring task.
 */
export async function resumeTask(
  taskId: string,
  userId: string,
): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: {
      id: true,
      scheduleType: true,
      scheduleRule: true,
      timezone: true,
    },
  });
  if (!task) throw new NotFoundError("Task");
  if (task.scheduleType !== "recurring") {
    throw new ValidationError("Only recurring tasks can be resumed");
  }

  // Compute next occurrence from cron expression
  const nextOccurrence = task.scheduleRule
    ? getNextExecutionTime(task.scheduleRule, new Date(), task.timezone)
    : null;

  await db
    .update(tasks)
    .set({
      taskStatus: "open",
      nextOccurrenceAt: nextOccurrence,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Re-enable the schedule
  try {
    const scheduler = await getScheduler();
    await scheduler.setEnabled(getRecurringTaskScheduleKey(taskId), true);
  } catch (err) {
    logger.warn(
      { taskId, error: err },
      "Failed to re-enable schedule (may not exist)",
    );
  }
}

/**
 * Approve an agent's completed work.
 */
export async function approveTask(
  taskId: string,
  userId: string,
): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: { id: true, attentionStatus: true },
  });
  if (!task) throw new NotFoundError("Task");

  await db
    .update(tasks)
    .set({
      reviewStatus: "approved",
      attentionStatus: "none",
      taskStatus: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Update the latest occurrence's review status
  const taskOccurrences = schema.taskOccurrences;
  await db
    .update(taskOccurrences)
    .set({ reviewStatus: "approved" })
    .where(
      and(
        eq(taskOccurrences.taskId, taskId),
        eq(taskOccurrences.reviewStatus, "pending"),
      ),
    );
}

/**
 * Request changes on an agent's completed work.
 */
export async function requestChanges(
  taskId: string,
  userId: string,
): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: { id: true },
  });
  if (!task) throw new NotFoundError("Task");

  await db
    .update(tasks)
    .set({
      reviewStatus: "changes_requested",
      attentionStatus: "none",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  // Update the latest occurrence
  const taskOccurrences = schema.taskOccurrences;
  await db
    .update(taskOccurrences)
    .set({ reviewStatus: "changes_requested" })
    .where(
      and(
        eq(taskOccurrences.taskId, taskId),
        eq(taskOccurrences.reviewStatus, "pending"),
      ),
    );
}

/**
 * Respond to an agent's question (task in awaiting_input state).
 */
export async function respondToTask(
  taskId: string,
  userId: string,
  response: string,
  caller: CallerContext,
): Promise<void> {
  const task = await db.query.tasks.findFirst({
    where: and(eq(tasks.id, taskId), eq(tasks.userId, userId)),
    columns: { id: true, attentionStatus: true },
  });
  if (!task) throw new NotFoundError("Task");

  // Add response as a comment
  const { createTaskComment } = await import("./taskComments.js");
  await createTaskComment({ taskId, content: response }, caller);

  // Clear the awaiting_input attention status
  await db
    .update(tasks)
    .set({
      attentionStatus: "none",
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}
