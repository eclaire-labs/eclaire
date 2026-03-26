import {
  formatToISO8601,
  generateHistoryId,
  generateTaskExecutionId,
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
  type SQL,
} from "drizzle-orm";
import { db, queueJobs, schema, txManager } from "../../db/index.js";

const { tags, taskComments, taskExecutions, tasks, tasksTags, users } = schema;

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
import { getQueueAdapter } from "../queue/index.js";
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
  status?: TaskStatus;
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

// Queue name for task tag_generation jobs (maps to old jobType="tag_generation")
const _TASK_PROCESSING_QUEUE = "task-processing";

interface ResolvedTaskAssignee {
  assigneeActorId: string;
  kind: "human" | "agent" | "system" | "service";
}

async function resolveTaskAssignee(
  assigneeActorId: string | null | undefined,
  currentUserId: string,
  allowFallback: boolean = true,
): Promise<ResolvedTaskAssignee> {
  if (!assigneeActorId || !assigneeActorId.trim()) {
    return {
      assigneeActorId: currentUserId,
      kind: "human",
    };
  }

  const normalizedActorId = assigneeActorId.trim();
  const actor = await getActorSummaryOrNull(currentUserId, normalizedActorId);

  if (actor?.kind === "human") {
    return {
      assigneeActorId: normalizedActorId,
      kind: "human",
    };
  }

  if (actor?.kind === "agent") {
    return {
      assigneeActorId: normalizedActorId,
      kind: "agent",
    };
  }

  if (allowFallback) {
    logger.warn(
      {
        invalidAssignedTo: assigneeActorId,
        currentUserId,
      },
      "Invalid assignee actor ID provided, defaulting to current user",
    );
    return {
      assigneeActorId: currentUserId,
      kind: "human",
    };
  }

  throw new Error(
    `Invalid assignee actor ID: ${assigneeActorId}. Assignee must be an existing human or agent actor.`,
  );
}

interface CreateTaskParams {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: number;
  dueDate?: string;
  assigneeActorId?: string;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  processingEnabled?: boolean;
  sortOrder?: number | null;
  parentId?: string | null;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: string;
  priority?: number;
  dueDate?: string | null;
  assigneeActorId?: string | null;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  processingEnabled?: boolean;
  sortOrder?: number | null;
  parentId?: string | null;
  completedAt?: string | null;
}

// Re-export TaskStatus from @eclaire/core for external use (e.g., API route)
export type { TaskStatus };

// NOTE: Legacy scheduling functions (upsertTaskScheduler, cancelTaskExecutionJob,
// removeTaskScheduler, validateRecurrenceParams, getTaskScheduleData) were removed
// in Phase 4 of the Scheduled Actions migration. Tasks are now pure work items.
// All scheduling goes through the ScheduledAction model.

/**
 * Schedule data for task response enrichment.
 * Kept for API response compatibility; always returns non-recurring defaults
 * now that scheduling lives in ScheduledAction.
 */
interface TaskScheduleData {
  isRecurring: boolean;
  cronExpression: string | null;
  recurrenceEndDate: Date | null;
  recurrenceLimit: number | null;
}

/** Always returns null — scheduling data now lives in ScheduledAction. */
function getTaskScheduleData(_taskId: string): TaskScheduleData | null {
  return null;
}

/** Always returns an empty map — scheduling data now lives in ScheduledAction. */
function getTaskSchedulesMap(): Map<string, TaskScheduleData> {
  return new Map();
}

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
  scheduleData?: TaskScheduleData | null,
  childCount?: number,
) {
  const dueDate = task.dueDate != null ? formatToISO8601(task.dueDate) : null;
  const lastExecutedAt =
    task.lastExecutedAt != null ? formatToISO8601(task.lastExecutedAt) : null;
  const completedAt =
    task.completedAt != null ? formatToISO8601(task.completedAt) : null;

  // Create a new object excluding the timestamp fields
  const { createdAt, updatedAt, assigneeActorId, ...cleanedTask } = task;

  // Recurrence data comes from the scheduler; default to non-recurring if not provided
  const recurrenceData = scheduleData ?? {
    isRecurring: false,
    cronExpression: null,
    recurrenceEndDate: null,
    recurrenceLimit: null,
  };

  return {
    ...cleanedTask,
    dueDate,
    lastExecutedAt,
    completedAt,
    assigneeActorId: assigneeActorId ?? null,
    createdAt: createdAt ? formatToISO8601(createdAt) : null,
    updatedAt: updatedAt ? formatToISO8601(updatedAt) : null,
    processingStatus: processingStatus || "pending",
    priority: task.priority ?? 0,
    sortOrder: task.sortOrder ?? null,
    parentId: task.parentId ?? null,
    childCount: childCount ?? 0,
    tags: tags,
    comments: comments,
    // Recurrence data from scheduler
    isRecurring: recurrenceData.isRecurring,
    cronExpression: recurrenceData.cronExpression,
    recurrenceEndDate: recurrenceData.recurrenceEndDate
      ? formatToISO8601(recurrenceData.recurrenceEndDate)
      : null,
    recurrenceLimit: recurrenceData.recurrenceLimit,
  };
}

export async function createTask(
  taskData: CreateTaskParams,
  caller: CallerContext,
) {
  const userId = callerOwnerUserId(caller);
  const actorId = callerActorId(caller);
  try {
    // Convert dueDate string to Date object
    const dueDateValue = taskData.dueDate ? new Date(taskData.dueDate) : null;

    // Set completedAt if task is being created with "completed" status
    const taskStatus = taskData.status || "not-started";
    const completedAtValue = taskStatus === "completed" ? new Date() : null;

    const resolvedAssignee = await resolveTaskAssignee(
      taskData.assigneeActorId,
      userId,
      true, // Allow fallback for create operations
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

    // Atomic transaction: insert task, tags, and history together
    await txManager.withTransaction(async (tx) => {
      await tx.tasks.insert({
        id: taskId,
        userId: userId,
        title: taskData.title,
        description: taskData.description || null,
        status: taskStatus,
        dueDate: dueDateValue,
        assigneeActorId: resolvedAssignee.assigneeActorId,
        completedAt: completedAtValue,
        priority: taskData.priority ?? 0,
        processingEnabled: taskData.processingEnabled ?? true,
        processingStatus:
          (taskData.processingEnabled ?? true) ? "pending" : null,
        reviewStatus: taskData.reviewStatus || "pending",
        flagColor: taskData.flagColor || null,
        isPinned: taskData.isPinned || false,
        sortOrder: taskData.sortOrder ?? null,
        parentId: taskData.parentId || null,
        // Note: Recurrence fields (isRecurring, cronExpression, etc.)
        // are stored in queue_schedules, not in the tasks table.
        // createdAt and updatedAt are handled by schema defaults
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
          status: taskStatus,
          dueDate: taskData.dueDate,
          tags: taskData.tags,
          assigneeActorId: resolvedAssignee.assigneeActorId,
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

    // Fetch the complete task with tags to return the consistent API response format
    const taskWithTags = await getTaskWithTags(taskId);
    return taskWithTags; // This will use cleanTaskForResponse
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

    // Re-throw ValidationError directly to preserve type and message
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
    let resolvedUpdatedAssignee: ResolvedTaskAssignee | null = null;

    // Validate assignee actor if it's being updated - strict validation (no fallback)
    if ("assigneeActorId" in taskUpdateData) {
      resolvedUpdatedAssignee = await resolveTaskAssignee(
        taskUpdateData.assigneeActorId,
        userId,
        false, // No fallback for update operations - strict validation
      );
      taskUpdateData.assigneeActorId = resolvedUpdatedAssignee.assigneeActorId;
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

    // Convert dueDate string to Date object
    let dueDateValue: Date | null = null;
    let includeDueDateUpdate = false; // Flag to track if dueDate needs updating

    if (Object.hasOwn(taskUpdateData, "dueDate")) {
      // Check if dueDate key exists in the input
      includeDueDateUpdate = true;
      dueDateValue = taskUpdateData.dueDate
        ? new Date(taskUpdateData.dueDate)
        : null;
    }

    // Handle completedAt logic based on status changes
    let completedAtValue: Date | null = null;
    let includeCompletedAtUpdate = false;

    if (Object.hasOwn(taskUpdateData, "completedAt")) {
      // If completedAt is explicitly provided, use it
      includeCompletedAtUpdate = true;
      completedAtValue = taskUpdateData.completedAt
        ? new Date(taskUpdateData.completedAt)
        : null;
    } else if (Object.hasOwn(taskUpdateData, "status")) {
      // If status is being updated, automatically set/clear completedAt
      includeCompletedAtUpdate = true;
      if (taskUpdateData.status === "completed") {
        // Task is being marked as completed - set completedAt to now if not already completed
        completedAtValue =
          existingTask.status !== "completed"
            ? new Date()
            : existingTask.completedAt;
      } else {
        // Task status is changing away from completed - clear completedAt
        completedAtValue = null;
      }
    }

    // Prepare the base update object (excluding dueDate initially)
    // Use a type that allows flexible properties for .set()
    // biome-ignore lint/suspicious/noExplicitAny: dynamic update object
    const updateSet: { [key: string]: any } = {
      ...taskUpdateData,
      updatedAt: new Date(), // Use current date
    };

    if (resolvedUpdatedAssignee) {
      updateSet.assigneeActorId = resolvedUpdatedAssignee.assigneeActorId;
    }

    // Conditionally add dueDate to the update set
    if (includeDueDateUpdate) {
      updateSet.dueDate = dueDateValue;
    } else {
      // If dueDate was not in the input, remove it from the updateSet
      // to avoid accidentally setting it to undefined or null
      delete updateSet.dueDate;
    }

    if (includeCompletedAtUpdate) {
      updateSet.completedAt = completedAtValue;
    }

    // Remove the original properties if they exist from taskUpdateData spread
    if (Object.hasOwn(updateSet, "dueDate") && !includeDueDateUpdate) {
      delete updateSet.dueDate;
    }
    if (Object.hasOwn(updateSet, "completedAt") && !includeCompletedAtUpdate) {
      delete updateSet.completedAt;
    }

    // Also remove tags property if it was part of taskUpdateData spread
    delete updateSet.tags;
    // Remove completedAt from spread if it shouldn't be updated
    if (!includeCompletedAtUpdate) {
      delete updateSet.completedAt;
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
      // Update the task
      await tx.tasks.update(
        and(eq(tasks.id, id), eq(tasks.userId, userId)),
        updateSet,
      );

      // Handle tags if provided
      if (tagNames) {
        // Remove existing tags
        await tx.tasksTags.delete(eq(tasksTags.taskId, id));

        // Add new tags
        if (tagNames.length > 0) {
          const tagList = await tx.getOrCreateTags(tagNames, userId);
          for (const tag of tagList) {
            await tx.tasksTags.insert({ taskId: id, tagId: tag.id });
          }
        }
      }

      // Record history for task update - atomic with the update
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

    // Return task with updated tags using the consistent API response format
    const taskWithTags = await getTaskWithTags(id);
    return taskWithTags; // This will use cleanTaskForResponse
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
      error instanceof Error &&
      error.message.includes("Task update failed or task not found")
    ) {
      throw new NotFoundError("Task"); // Re-throw specific error
    }

    // Differentiate between not found and other errors if possible
    if (error instanceof Error && error.message === "Task not found") {
      // If thrown earlier
      throw error;
    }

    // Re-throw validation errors to preserve specific error messages
    if (
      error instanceof Error &&
      error.message.includes("Invalid assignee actor ID")
    ) {
      throw error;
    }

    if (error instanceof ValidationError) {
      throw error; // Preserve the original ValidationError
    }

    throw new Error("Failed to update task"); // General error
  }
}

/**
 * Updates a task record with artifacts produced by a worker (e.g., tags).
 */
/**
 * Updates task status specifically for AI assistants assigned to the task
 * This bypasses the ownership check and records proper history with assistant actor
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

    // Get the task to validate assignment and get task owner
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: {
        id: true,
        userId: true,
        assigneeActorId: true,
        status: true,
        completedAt: true,
      },
    });

    if (!task) {
      throw new NotFoundError("Task");
    }

    // Verify the assistant is actually assigned to this task
    if (task.assigneeActorId !== actorId) {
      throw new Error(`Assistant ${actorId} is not assigned to task ${taskId}`);
    }

    const beforeData = {
      status: task.status,
      completedAt: task.completedAt,
    };

    // Prepare update data
    // biome-ignore lint/suspicious/noExplicitAny: dynamic update object
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === "completed" && completedAt) {
      updateData.completedAt = new Date(completedAt);
    }

    // Update the task
    const updatedTask = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, taskId))
      .returning();

    if (!updatedTask.length) {
      throw new Error("Failed to update task status");
    }

    const afterData = {
      status: updatedTask[0]?.status,
      completedAt: updatedTask[0]?.completedAt,
    };

    // Record history with assistant as the actor
    await recordHistory({
      action: "update",
      itemType: "task",
      itemId: taskId,
      itemName: `Task status updated to ${status}`,
      beforeData,
      afterData,
      userId: task.userId, // The task owner
      actor: caller.actor,
      actorId,
      metadata: {
        updatedFields: ["status", ...(completedAt ? ["completedAt"] : [])],
        statusChange: `${beforeData.status} → ${status}`,
        assistantId: actorId, // Store assistant ID in metadata instead
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

/**
 * Updates task execution tracking with permission checks.
 * Used by the API route for external access.
 *
 * @param taskId - The task ID
 * @param userId - The user ID making the request
 * @param lastExecutedAt - Optional ISO 8601 timestamp when task was last executed
 * @returns Object with success message and list of updated fields
 * @throws TaskNotFoundError if task doesn't exist
 * @throws TaskUnauthorizedError if user doesn't have permission
 */
export async function updateTaskExecutionTrackingWithPermissions(
  taskId: string,
  userId: string,
  lastExecutedAt?: string,
): Promise<{ message: string; updated: string[] }> {
  // Get the task to verify it exists and user has permission
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
    columns: {
      id: true,
      userId: true,
      assigneeActorId: true,
    },
  });

  if (!task) {
    throw new NotFoundError("Task", taskId);
  }

  // Check if user has permission to update execution tracking
  const canUpdate = task.userId === userId || task.assigneeActorId === userId;
  if (!canUpdate) {
    throw new ForbiddenError("Unauthorized to update this task");
  }

  // Log execution tracking update for security/auditing
  logger.info(
    {
      taskId,
      userId,
      taskOwnerId: task.userId,
      taskAssigneeActorId: task.assigneeActorId,
      updates: { lastExecutedAt },
    },
    "Task execution tracking update",
  );

  // Prepare update data - only lastExecutedAt is in the task table
  // nextRunAt is managed by the queue scheduler
  const updateData: { lastExecutedAt?: Date } = {};
  const updatedFields: string[] = [];

  if (lastExecutedAt !== undefined) {
    updateData.lastExecutedAt = new Date(lastExecutedAt);
    updatedFields.push("lastExecutedAt");
  }

  // Update the task
  await db
    .update(tasks)
    .set({
      ...updateData,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));

  return {
    message: "Task execution tracking updated successfully",
    updated: updatedFields,
  };
}

/**
 * Updates the lastExecutedAt timestamp for a task.
 * Used by task execution processor for internal tracking - no history recorded.
 * Returns true if task was found and updated, false if task was not found.
 */
export async function updateTaskExecutionTracking(
  taskId: string,
  lastExecutedAt: Date,
): Promise<boolean> {
  try {
    const result = await db
      .update(tasks)
      .set({
        lastExecutedAt,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, taskId))
      .returning({ id: tasks.id });

    if (result.length === 0) {
      logger.warn(
        { taskId },
        "Task not found when updating execution tracking",
      );
      return false;
    }

    logger.debug({ taskId, lastExecutedAt }, "Task execution tracking updated");
    return true;
  } catch (error) {
    logger.error(
      {
        taskId,
        lastExecutedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to update task execution tracking",
    );
    throw error;
  }
}

export async function updateTaskArtifacts(
  taskId: string,
  artifacts: {
    tags?: string[];
  },
): Promise<void> {
  try {
    // We only need to handle tags for now.
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
      return; // Gracefully handle missing tasks in background processing
    }

    logger.info(
      { taskId, tags: artifacts.tags },
      "Updating task with new AI-generated tags.",
    );

    // Get or create tags BEFORE transaction (this is async and requires DB calls)
    let tagList: { id: string; name: string }[] = [];
    if (artifacts.tags && artifacts.tags.length > 0) {
      tagList = await getOrCreateTags(artifacts.tags, task.userId);
    }

    // Execute transaction
    await txManager.withTransaction(async (tx) => {
      // Clear existing tags for a full replacement
      await tx.tasksTags.delete(eq(tasksTags.taskId, taskId));

      // Insert new tags
      if (tagList.length > 0) {
        for (const tag of tagList) {
          await tx.tasksTags.insert({ taskId, tagId: tag.id });
        }
      }

      // Update the task's timestamp
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

// Delete task function
export async function deleteTask(
  id: string,
  userId: string,
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  try {
    logger.info({ taskId: id, userId }, "Starting task deletion process");

    // Get existing task for history
    const existingTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
    });

    if (!existingTask) {
      logger.warn({ taskId: id, userId }, "Task not found for deletion");
      throw new NotFoundError("Task");
    }

    // Get task tags before deletion for history
    const taskTags = await getTaskTags(id);

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Atomic transaction: delete all DB records and record history together
    await txManager.withTransaction(async (tx) => {
      // Delete task-tag relationships first
      await tx.tasksTags.delete(eq(tasksTags.taskId, id));

      // Delete the task
      await tx.tasks.delete(and(eq(tasks.id, id), eq(tasks.userId, userId)));

      // Record history for task deletion - atomic with the delete
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

    // Delete queue job outside transaction (non-critical)
    await db.delete(queueJobs).where(eq(queueJobs.key, `tasks:${id}`));

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

// Get a single task by ID with its tags
export async function getTaskById(taskId: string, userId: string) {
  try {
    // Get the task by ID
    const [task] = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (!task) {
      // Return null instead of throwing an error
      return null;
    }

    // Fetch data in parallel
    const [
      taskTagNames,
      taskCommentsData,
      scheduleData,
      childCountResult,
      lastExecution,
    ] = await Promise.all([
      getTaskTags(taskId),
      getTaskCommentsWithUsers(taskId, task.userId),
      getTaskScheduleData(taskId),
      db
        .select({ value: count() })
        .from(tasks)
        .where(eq(tasks.parentId, taskId)),
      getLastTaskExecution(taskId),
    ]);

    const response = cleanTaskForResponse(
      task,
      taskTagNames,
      task.processingStatus,
      taskCommentsData,
      scheduleData,
      childCountResult[0]?.value ?? 0,
    );

    return {
      ...response,
      lastExecutionStatus: lastExecution?.status ?? null,
      lastExecutionError: lastExecution?.error ?? null,
      lastExecutionAt: lastExecution?.completedAt?.toISOString() ?? null,
    };
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
    // Re-throw unexpected errors
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

  // Fetch tags and schedule data in parallel
  const [taskTagNames, scheduleData] = await Promise.all([
    getTaskTags(taskId),
    getTaskScheduleData(taskId),
  ]);

  return cleanTaskForResponse(task, taskTagNames, null, [], scheduleData);
}

/**
 * Builds the common query conditions for finding/counting tasks.
 *
 * @param userId - The ID of the user.
 * @param text - Optional text search (title, description).
 * @param status - Optional task status.
 * @param startDate - Optional start date (due date).
 * @param endDate - Optional end date (due date).
 * @param dueDateStart - Optional start due date filter.
 * @param dueDateEnd - Optional end due date filter.
 * @returns An array of Drizzle SQL conditions.
 */
function _buildTaskQueryConditions({
  userId,
  text,
  status,
  priority,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
  parentId,
  topLevelOnly,
}: FindTasksParams): (SQL | undefined)[] {
  // Return type allowing undefined for clarity before filtering/spreading
  // Explicitly type the array elements
  const definedConditions: (SQL | undefined)[] = [eq(tasks.userId, userId)];

  if (text?.trim()) {
    definedConditions.push(
      buildTextSearchCondition(text, tasks.searchVector, [
        tasks.title,
        tasks.description,
      ]),
    );
  }

  if (status) {
    definedConditions.push(eq(tasks.status, status));
  }

  if (priority !== undefined) {
    definedConditions.push(eq(tasks.priority, priority));
  }

  // Filter by dueDate (Date object)
  if (startDate) {
    // Use tasks.dueDate directly. Drizzle knows its type.
    // isNotNull checks the column is not null, gte compares the value.
    definedConditions.push(
      and(isNotNull(tasks.dueDate), gte(tasks.dueDate, startDate)),
    );
  }

  if (endDate) {
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);
    // Use tasks.dueDate directly.
    definedConditions.push(
      and(isNotNull(tasks.dueDate), lte(tasks.dueDate, endOfDay)),
    );
  }

  // Additional due date filtering (separate from creation date filtering)
  if (dueDateStart) {
    definedConditions.push(
      and(isNotNull(tasks.dueDate), gte(tasks.dueDate, dueDateStart)),
    );
  }

  if (dueDateEnd) {
    definedConditions.push(
      and(isNotNull(tasks.dueDate), lte(tasks.dueDate, dueDateEnd)),
    );
  }

  // Filter by parent task
  if (parentId) {
    definedConditions.push(eq(tasks.parentId, parentId));
  } else if (topLevelOnly) {
    definedConditions.push(isNull(tasks.parentId));
  }

  // Return the array including potential undefined values.
  // The `and(...conditions)` spread in the calling functions handles filtering undefined.
  return definedConditions;
}

/**
 * Search tasks by text, tags, status, and date range (cursor-based pagination).
 *
 * @param params - {@link FindTasksParams} plus an optional `limit` (default 50).
 * @returns Cursor-paginated response of tasks.
 */
export async function findTasks({
  userId,
  text,
  tags: tagsList,
  status,
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
      status,
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
      dueDate: tasks.dueDate,
      status: tasks.status,
      title: tasks.title,
      priority: tasks.priority,
      sortOrder: tasks.sortOrder,
    };
    const sortColumn = sortColumnMap[sortBy] || tasks.createdAt;
    const orderDir = sortDir === "asc" ? asc : desc;

    // Add cursor condition if paginating
    if (cursor) {
      conditions.push(
        buildCursorCondition(sortColumn, tasks.id, cursor, sortDir),
      );
    }

    // Add tag filter as a subquery condition
    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          tasksTags,
          tasksTags.taskId,
          tasksTags.tagId,
          tagsList,
          userId,
        ),
      );
    }

    const fetchLimit = limit + 1; // fetch one extra to detect hasMore
    const matched = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(...conditions))
      .orderBy(orderDir(sortColumn), orderDir(tasks.id))
      .limit(fetchLimit);
    let finalIds: string[] = matched.map((e) => e.id);

    if (finalIds.length === 0)
      return { items: [], nextCursor: null, hasMore: false };

    // Check hasMore before trimming
    const hasMore = finalIds.length > limit;
    if (hasMore) finalIds = finalIds.slice(0, limit);

    // Fetch full data for the final page of IDs, schedule data, tags, and child counts in parallel
    const [entriesList, schedulesMap, tagMap, childCounts] = await Promise.all([
      db
        .select()
        .from(tasks)
        .where(inArray(tasks.id, finalIds))
        .orderBy(orderDir(sortColumn), orderDir(tasks.id)),
      getTaskSchedulesMap(),
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

    // Build child count map
    const childCountMap = new Map<string, number>();
    for (const row of childCounts) {
      if (row.parentId) childCountMap.set(row.parentId, row.count);
    }

    const items = entriesList.map((task) => {
      const scheduleData = schedulesMap.get(task.id) || null;
      return cleanTaskForResponse(
        task,
        tagMap.get(task.id) ?? [],
        task.processingStatus,
        [],
        scheduleData,
        childCountMap.get(task.id) ?? 0,
      );
    });

    // Build cursor from the last item
    const lastItem = items[items.length - 1];
    // biome-ignore lint/suspicious/noExplicitAny: sort value type varies
    const getSortVal = (item: any) => {
      if (sortBy === "title") return item.title;
      if (sortBy === "dueDate") return item.dueDate;
      if (sortBy === "status") return item.status;
      if (sortBy === "priority") return item.priority;
      if (sortBy === "sortOrder") return item.sortOrder;
      return item.createdAt; // createdAt formatted as ISO string
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
        status,
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
 *
 * @param params - {@link FindTasksParams}.
 * @returns The total count of matching tasks.
 */
export async function countTasks({
  userId,
  text,
  tags: tagsList,
  status,
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
      status,
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
        status,
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
 * Returns a cursor-paginated response.
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
 * This allows users to refresh processing results without knowing about processing jobs.
 */
export async function reprocessTask(
  taskId: string,
  userId: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get the existing task to ensure it exists and user has access
    const task = await getTaskById(taskId, userId);
    if (!task) {
      return { success: false, error: "Task not found" };
    }

    // 2. Use the existing retry logic with force parameter to properly handle job deduplication
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
// Task Execution Recording
// ============================================================================

export interface CreateTaskExecutionParams {
  taskId: string;
  userId: string;
  scheduleKey?: string | null;
  jobId?: string | null;
}

/**
 * Create a task execution record when execution starts.
 * Returns the execution ID for later updates.
 */
export async function createTaskExecution(
  params: CreateTaskExecutionParams,
): Promise<string> {
  const id = generateTaskExecutionId();
  const now = new Date();

  await db.insert(taskExecutions).values({
    id,
    taskId: params.taskId,
    userId: params.userId,
    scheduleKey: params.scheduleKey ?? null,
    jobId: params.jobId ?? null,
    status: "running",
    startedAt: now,
    createdAt: now,
  });

  return id;
}

/**
 * Mark a task execution as completed.
 */
export async function completeTaskExecution(
  executionId: string,
  resultSummary?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const now = new Date();

  // Fetch startedAt to compute duration
  const [execution] = await db
    .select({ startedAt: taskExecutions.startedAt })
    .from(taskExecutions)
    .where(eq(taskExecutions.id, executionId))
    .limit(1);

  const durationMs = execution?.startedAt
    ? now.getTime() - execution.startedAt.getTime()
    : null;

  await db
    .update(taskExecutions)
    .set({
      status: "completed",
      completedAt: now,
      durationMs,
      resultSummary: resultSummary?.slice(0, 500) ?? null,
      metadata: metadata ?? null,
    })
    .where(eq(taskExecutions.id, executionId));
}

/**
 * Mark a task execution as failed.
 */
export async function failTaskExecution(
  executionId: string,
  error: string,
): Promise<void> {
  const now = new Date();

  const [execution] = await db
    .select({ startedAt: taskExecutions.startedAt })
    .from(taskExecutions)
    .where(eq(taskExecutions.id, executionId))
    .limit(1);

  const durationMs = execution?.startedAt
    ? now.getTime() - execution.startedAt.getTime()
    : null;

  await db
    .update(taskExecutions)
    .set({
      status: "failed",
      completedAt: now,
      durationMs,
      error,
    })
    .where(eq(taskExecutions.id, executionId));
}

/**
 * Record a skipped execution (e.g., due to overlap).
 */
export async function recordSkippedTaskExecution(
  params: CreateTaskExecutionParams,
): Promise<void> {
  const now = new Date();

  await db.insert(taskExecutions).values({
    id: generateTaskExecutionId(),
    taskId: params.taskId,
    userId: params.userId,
    scheduleKey: params.scheduleKey ?? null,
    jobId: params.jobId ?? null,
    status: "skipped",
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    createdAt: now,
  });
}

/**
 * Get paginated execution history for a task.
 */
export async function getTaskExecutions(
  taskId: string,
  userId: string,
  params: { cursor?: string; limit?: number } = {},
): Promise<CursorPaginatedResponse<typeof taskExecutions.$inferSelect>> {
  const limit = params.limit ?? 20;

  const conditions: SQL[] = [
    eq(taskExecutions.taskId, taskId),
    eq(taskExecutions.userId, userId),
  ];

  if (params.cursor) {
    conditions.push(
      buildCursorCondition(
        taskExecutions.createdAt,
        taskExecutions.id,
        params.cursor,
        "desc",
      ),
    );
  }

  const rows = await db
    .select()
    .from(taskExecutions)
    .where(and(...conditions))
    .orderBy(desc(taskExecutions.createdAt), desc(taskExecutions.id))
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

/**
 * Get the most recent execution for a task (for lastExecutionStatus).
 */
export async function getLastTaskExecution(taskId: string): Promise<{
  status: string;
  error: string | null;
  completedAt: Date | null;
} | null> {
  const [row] = await db
    .select({
      status: taskExecutions.status,
      error: taskExecutions.error,
      completedAt: taskExecutions.completedAt,
    })
    .from(taskExecutions)
    .where(eq(taskExecutions.taskId, taskId))
    .orderBy(desc(taskExecutions.createdAt))
    .limit(1);

  return row ?? null;
}
