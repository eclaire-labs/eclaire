import {
  and,
  Column,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  like,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db, txManager, schema } from "@/db";
import { generateTaskId } from "@/lib/id-generator";

const {
  assetProcessingJobs,
  tags,
  taskComments,
  tasks,
  tasksTags,
  users,
} = schema;
import { getNextExecutionTime, isValidCronExpression } from "@/lib/cron-utils";
import { formatToISO8601, getOrCreateTags } from "@/lib/db-helpers";
import { ValidationError } from "@/lib/errors";
import { getQueue, QueueNames } from "@/lib/queues";
import { getQueueMode } from "@/lib/env-validation";
import { getCurrentTimestamp } from "@/lib/db-queue-helpers";
import { getQueueAdapter } from "@/lib/queue-adapter";
import { createChildLogger } from "../logger";
import { recordHistory } from "./history";

const logger = createChildLogger("services:tasks");

/**
 * Validates an assignedToId and returns the validated user ID
 * @param assignedToId - The user ID to validate (can be null/undefined)
 * @param currentUserId - The current user's ID (fallback for null/empty)
 * @param allowFallback - Whether to fallback to currentUserId for invalid IDs (false = throw error)
 * @returns Promise<string> - The validated user ID
 * @throws Error if assignedToId is invalid and allowFallback is false
 */
async function validateAssignedToId(
  assignedToId: string | null | undefined,
  currentUserId: string,
  allowFallback: boolean = true,
): Promise<string> {
  // If null, undefined, or empty string, assign to current user
  if (!assignedToId || !assignedToId.trim()) {
    return currentUserId;
  }

  // Check if the assigned user exists
  const assignedUser = await db.query.users.findFirst({
    where: eq(users.id, assignedToId),
  });

  if (assignedUser) {
    return assignedToId;
  }

  // User not found - either fallback or throw error
  if (allowFallback) {
    logger.warn(
      {
        invalidAssignedTo: assignedToId,
        currentUserId,
      },
      "Invalid assignedTo user ID provided, defaulting to current user",
    );
    return currentUserId;
  } else {
    throw new Error(
      `Invalid user ID: ${assignedToId}. User must exist and be either self or assistant.`,
    );
  }
}

/**
 * Checks if a user ID belongs to an AI assistant
 * @param userId - The user ID to check
 * @returns Promise<boolean> - True if the user is an AI assistant
 */
async function isAIAssistant(userId: string): Promise<boolean> {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { userType: true },
    });
    return user?.userType === "assistant";
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error checking if user is AI assistant",
    );
    return false;
  }
}

/**
 * Calculates delay for AI assistant job based on due date
 * @param dueDate - The task due date (Date object or null)
 * @returns number - Delay in milliseconds (0 for immediate processing)
 */
function calculateAIAssistantJobDelay(dueDate: Date | null): number {
  if (!dueDate) {
    // No due date - process immediately
    return 0;
  }

  const now = new Date();
  const delay = dueDate.getTime() - now.getTime();

  // If due date is in the past or very soon (within 1 minute), process immediately
  if (delay <= 60000) {
    return 0;
  }

  // Otherwise, delay until the due date
  return delay;
}

interface CreateTaskParams {
  title: string;
  description?: string;
  status?: string;
  dueDate?: string;
  assignedToId?: string;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  enabled?: boolean;
  isRecurring?: boolean;
  cronExpression?: string;
  recurrenceEndDate?: string;
  recurrenceLimit?: number;
  runImmediately?: boolean;
}

interface UpdateTaskParams {
  title?: string;
  description?: string;
  status?: string;
  dueDate?: string | null;
  assignedToId?: string | null;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  enabled?: boolean;
  isRecurring?: boolean;
  cronExpression?: string;
  recurrenceEndDate?: string | null;
  recurrenceLimit?: number | null;
  runImmediately?: boolean;
  completedAt?: string | null;
}

// Export the status type for external use (e.g., API route)
export type TaskStatus = "not-started" | "in-progress" | "completed";

/**
 * Creates or updates a scheduler for a recurring task
 * Uses BullMQ scheduler
 *
 * @param taskId - The task ID
 * @param cronExpression - Valid cron expression
 * @param taskData - Task data for the job
 * @param endDate - Optional end date for recurrence
 * @param limit - Optional maximum number of executions
 * @param immediately - Optional flag to execute first job immediately
 * @returns Promise<boolean> - Success status
 */
async function upsertTaskScheduler(
  taskId: string,
  cronExpression: string,
  taskData: any,
  endDate?: Date | null,
  limit?: number,
  immediately?: boolean,
): Promise<boolean> {
  const queueMode = getQueueMode();

  try {
    if (queueMode === "redis") {
      // Redis mode: Use BullMQ scheduler
      const queue = getQueue(QueueNames.TASK_EXECUTION_PROCESSING);
      if (!queue) {
        logger.error(
          { taskId },
          "Failed to get task execution queue for scheduler",
        );
        return false;
      }

      const schedulerId = `recurring-task-${taskId}`;

      await queue.upsertJobScheduler(
        schedulerId,
        {
          pattern: cronExpression,
          endDate: endDate || undefined,
          limit: limit,
          immediately: immediately,
        },
        {
          name: `recurring-task-job-${taskId}`,
          data: {
            ...taskData,
            isRecurring: true,
            cronExpression: cronExpression,
          },
          opts: {
            removeOnComplete: 1000,
            removeOnFail: 100,
          },
        },
      );

      logger.info(
        { taskId, cronExpression, schedulerId: `recurring-task-${taskId}`, limit, immediately, queueMode },
        "Created/updated task scheduler (Redis/BullMQ)",
      );
    } else {
      // Database mode: Update task record, scheduler loop will pick it up
      const now = getCurrentTimestamp();
      const nextRunAt = immediately ? now : getNextExecutionTime(cronExpression);

      await db
        .update(tasks)
        .set({
          isRecurring: true,
          cronExpression: cronExpression,
          recurrenceEndDate: endDate,
          recurrenceLimit: limit,
          runImmediately: immediately || false,
          nextRunAt: nextRunAt,
          updatedAt: now,
        })
        .where(eq(tasks.id, taskId));

      logger.info(
        { taskId, cronExpression, nextRunAt, limit, immediately, queueMode },
        "Updated task scheduler (Database mode)",
      );
    }

    return true;
  } catch (error) {
    logger.error(
      {
        taskId,
        cronExpression,
        limit,
        immediately,
        queueMode,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to create/update task scheduler",
    );
    return false;
  }
}

/**
 * Cancels a task execution job
 * In Redis mode: removes the BullMQ job
 * In Database mode: deletes pending jobs from asset_processing_jobs
 *
 * @param taskId - The task ID
 * @returns Promise<boolean> - Success status
 */
async function cancelTaskExecutionJob(taskId: string): Promise<boolean> {
  const queueMode = getQueueMode();

  try {
    if (queueMode === "redis") {
      // Redis mode: Remove BullMQ job
      const queue = getQueue(QueueNames.TASK_EXECUTION_PROCESSING);
      if (!queue) {
        logger.error(
          { taskId },
          "Failed to get task execution queue to cancel job",
        );
        return false;
      }

      const jobId = `task-execution-${taskId}`;

      // Try to get the job and cancel it
      const job = await queue.getJob(jobId);
      if (job) {
        try {
          await job.remove();
          logger.info({ taskId, jobId, queueMode }, "Cancelled task execution job (Redis)");
        } catch (removeError) {
          // Job might be locked by another worker - this is expected during execution
          const errorMessage =
            removeError instanceof Error ? removeError.message : "Unknown error";
          if (errorMessage.includes("locked by another worker")) {
            logger.warn(
              { taskId, jobId },
              "Task execution job is locked by another worker, skipping removal",
            );
            return true; // Consider this a successful cancellation attempt
          } else {
            logger.error(
              { taskId, jobId, error: errorMessage },
              "Failed to remove task execution job",
            );
            return false;
          }
        }
      } else {
        logger.debug({ taskId, jobId }, "No task execution job found to cancel");
      }
    } else {
      // Database mode: Delete pending jobs for this task
      const result = await db
        .delete(assetProcessingJobs)
        .where(
          and(
            eq(assetProcessingJobs.assetType, "tasks"),
            eq(assetProcessingJobs.assetId, taskId),
            eq(assetProcessingJobs.status, "pending")
          )
        );

      logger.info({ taskId, queueMode }, "Cancelled pending task execution jobs (Database)");
    }

    return true;
  } catch (error) {
    logger.error(
      {
        taskId,
        queueMode,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to cancel task execution job",
    );
    return false;
  }
}

/**
 * Removes a scheduler for a recurring task
 * In Redis mode: removes BullMQ scheduler
 * In Database mode: clears recurrence fields on task
 *
 * @param taskId - The task ID
 * @returns Promise<boolean> - Success status
 */
async function removeTaskScheduler(taskId: string): Promise<boolean> {
  const queueMode = getQueueMode();

  try {
    logger.info({ taskId, queueMode }, "Starting scheduler removal process");

    if (queueMode === "redis") {
      // Redis mode: Remove BullMQ scheduler
      const queue = getQueue(QueueNames.TASK_EXECUTION_PROCESSING);
      if (!queue) {
        logger.error(
          { taskId },
          "Failed to get task execution queue to remove scheduler",
        );
        return false;
      }

      const schedulerId = `recurring-task-${taskId}`;
      await queue.removeJobScheduler(schedulerId);

      logger.info(
        { taskId, schedulerId, queueMode },
        "Successfully removed task scheduler (Redis)",
      );
    } else {
      // Database mode: Clear recurrence fields
      const now = getCurrentTimestamp();

      await db
        .update(tasks)
        .set({
          isRecurring: false,
          cronExpression: null,
          recurrenceEndDate: null,
          recurrenceLimit: null,
          runImmediately: false,
          nextRunAt: null,
          updatedAt: now,
        })
        .where(eq(tasks.id, taskId));

      logger.info(
        { taskId, queueMode },
        "Successfully removed task scheduler (Database)",
      );
    }

    return true;
  } catch (error) {
    logger.error(
      {
        taskId,
        queueMode,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to remove task scheduler",
    );
    return false;
  }
}

/**
 * Validates recurrence parameters
 * @param isRecurring - Whether task should recur
 * @param cronExpression - Cron expression for recurrence
 * @param recurrenceEndDate - Optional end date
 * @param recurrenceLimit - Optional execution limit
 * @returns Object with validation result and error message
 */
function validateRecurrenceParams(
  isRecurring?: boolean,
  cronExpression?: string | null,
  recurrenceEndDate?: string | null,
  recurrenceLimit?: number | null,
): { isValid: boolean; error?: string } {
  if (!isRecurring) {
    return { isValid: true };
  }

  if (
    cronExpression === undefined ||
    cronExpression === null ||
    cronExpression === ""
  ) {
    return {
      isValid: false,
      error: "Cron expression is required when isRecurring is true",
    };
  }

  if (!isValidCronExpression(cronExpression)) {
    return { isValid: false, error: "Invalid cron expression" };
  }

  if (recurrenceEndDate) {
    const endDate = new Date(recurrenceEndDate);
    if (isNaN(endDate.getTime())) {
      return { isValid: false, error: "Invalid recurrence end date format" };
    }

    if (endDate <= new Date()) {
      return {
        isValid: false,
        error: "Recurrence end date must be in the future",
      };
    }
  }

  if (recurrenceLimit !== undefined && recurrenceLimit !== null) {
    if (!Number.isInteger(recurrenceLimit) || recurrenceLimit <= 0) {
      return {
        isValid: false,
        error: "Recurrence limit must be a positive integer",
      };
    }
  }

  return { isValid: true };
}

/**
 * Cleans a task object for API response by removing DB-specific fields
 * and adding properly formatted date fields.
 */
function cleanTaskForResponse(
  task: any,
  tags: string[],
  processingStatus?: string | null,
  comments: any[] = [],
) {
  const dueDate = task.dueDate != null ? formatToISO8601(task.dueDate) : null;
  const nextRunAt =
    task.nextRunAt != null ? formatToISO8601(task.nextRunAt) : null;
  const lastRunAt =
    task.lastRunAt != null ? formatToISO8601(task.lastRunAt) : null;
  const completedAt =
    task.completedAt != null ? formatToISO8601(task.completedAt) : null;

  // Create a new object excluding the timestamp fields
  const { createdAt, updatedAt, ...cleanedTask } = task;

  return {
    ...cleanedTask,
    dueDate, // Now correctly formatted ISO string or null
    nextRunAt, // Formatted ISO string or null
    lastRunAt, // Formatted ISO string or null
    completedAt, // Formatted ISO string or null
    // createdAt and updatedAt are already Date objects
    createdAt: createdAt ? formatToISO8601(createdAt) : null,
    updatedAt: updatedAt ? formatToISO8601(updatedAt) : null,
    processingStatus: processingStatus || "pending",
    tags: tags,
    comments: comments,
    // Ensure dueDate in the cleaned task is the formatted string or null
    // The original Date dueDate from the DB is now replaced
  };
}

export async function createTask(taskData: CreateTaskParams, userId: string) {
  try {
    // Validate recurrence parameters first
    const recurrenceValidation = validateRecurrenceParams(
      taskData.isRecurring,
      taskData.cronExpression,
      taskData.recurrenceEndDate,
      taskData.recurrenceLimit,
    );

    if (!recurrenceValidation.isValid) {
      throw new ValidationError(
        recurrenceValidation.error || "Invalid recurrence parameters",
      );
    }

    // The task ID will be generated automatically by the schema default function
    // No need to manually generate it here

    // Convert dueDate string to Date object
    const dueDateValue = taskData.dueDate ? new Date(taskData.dueDate) : null;

    // Convert recurrenceEndDate string to Date object
    const recurrenceEndDateValue = taskData.recurrenceEndDate
      ? new Date(taskData.recurrenceEndDate)
      : null;

    // Calculate next run time for recurring tasks
    let nextRunAtValue: Date | null = null;
    if (taskData.isRecurring && taskData.cronExpression) {
      nextRunAtValue = getNextExecutionTime(taskData.cronExpression);
    }

    // Set completedAt if task is being created with "completed" status
    const taskStatus = taskData.status || "not-started";
    const completedAtValue = taskStatus === "completed" ? new Date() : null;

    // Validate assignedTo user exists if provided, otherwise default to current user
    const assignedToUserId = await validateAssignedToId(
      taskData.assignedToId,
      userId,
      true, // Allow fallback for create operations
    );

    // Pre-generate task ID before transaction
    const taskId = generateTaskId();
    // Note: Job ID is generated by queue adapter when job is created

    // Execute transaction
    await txManager.withTransaction(async (tx) => {
      await tx.tasks.insert({
        id: taskId,
        userId: userId,
        title: taskData.title,
        description: taskData.description || null,
        status: taskStatus,
        dueDate: dueDateValue,
        assignedToId: assignedToUserId,
        completedAt: completedAtValue,
        enabled: taskData.enabled ?? true,
        reviewStatus: taskData.reviewStatus || "pending",
        flagColor: taskData.flagColor || null,
        isPinned: taskData.isPinned || false,
        // Recurrence fields
        isRecurring: taskData.isRecurring || false,
        cronExpression: taskData.cronExpression || null,
        recurrenceEndDate: recurrenceEndDateValue,
        recurrenceLimit: taskData.recurrenceLimit || null,
        runImmediately: taskData.runImmediately || false,
        nextRunAt: nextRunAtValue,
        // createdAt and updatedAt are handled by schema defaults
      });

      // Note: Processing job creation moved outside transaction to avoid race condition.
      // The queue adapter's upsert handles job creation atomically with jobData.
    });

    // Handle tags if provided
    if (taskData.tags && taskData.tags.length > 0) {
      await addTagsToTask(taskId, taskData.tags, userId);
    }

    // Record history for task creation
    await recordHistory({
      action: "create",
      itemType: "task",
      itemId: taskId,
      itemName: taskData.title,
      // Use the actual task data for 'afterData'
      afterData: {
        id: taskId,
        title: taskData.title,
        description: taskData.description || null,
        status: taskStatus,
        dueDate: taskData.dueDate,
        tags: taskData.tags,
        assignedToId: assignedToUserId,
      },
      actor: "user",
      userId: userId,
    });

    const queueAdapter = getQueueAdapter();
    await queueAdapter.enqueueTask({
      taskId: taskId,
      title: taskData.title,
      description: taskData.description || "",
      userId: userId,
      jobType: "tag_generation",
    });
    logger.info({ taskId, userId }, "Queued task for AI tag processing");

    // Queue task execution processing if task is assigned to an AI assistant
    const isAssignedToAI = await isAIAssistant(assignedToUserId);
    if (isAssignedToAI) {
      const queue = getQueue(QueueNames.TASK_EXECUTION_PROCESSING);
      if (queue) {
        // Redis/BullMQ mode
        const delay = calculateAIAssistantJobDelay(dueDateValue);
        await queue.add("process-task-execution", {
          taskId: taskId,
          userId: userId,
          dueDate: dueDateValue ?? undefined,
          isAssignedToAI: true,
        }, {
          delay,
          removeOnComplete: {
            age: 3600 * 24,
            count: 1000,
          },
          removeOnFail: false,
        });
        logger.info(
          { taskId, userId, assignedToId: assignedToUserId, delay },
          "Queued task for execution processing (Redis)",
        );
      } else {
        // Database queue mode - use queueAdapter with execution jobType
        const delay = calculateAIAssistantJobDelay(dueDateValue);
        const scheduledFor = delay > 0 ? new Date(Date.now() + delay) : undefined;
        await queueAdapter.enqueueTask({
          taskId: taskId,
          userId: userId,
          title: taskData.title,
          description: taskData.description || "",
          isAssignedToAI: true,
          assignedToId: assignedToUserId,
          dueDate: dueDateValue ?? undefined,
          scheduledFor,
          jobType: "execution",
        });
        logger.info(
          { taskId, userId, assignedToId: assignedToUserId, delay },
          "Queued task for execution processing (Database)",
        );
      }
    }

    // Set up recurring task scheduler if task is recurring
    if (taskData.isRecurring && taskData.cronExpression) {
      const success = await upsertTaskScheduler(
        taskId,
        taskData.cronExpression,
        {
          taskId: taskId,
          title: taskData.title,
          description: taskData.description || "",
          userId: userId,
          assignedToId: assignedToUserId,
          isAssignedToAI: isAssignedToAI,
        },
        recurrenceEndDateValue,
        taskData.recurrenceLimit ?? undefined,
        taskData.runImmediately ?? undefined,
      );

      if (!success) {
        logger.error(
          { taskId },
          "Failed to create task scheduler, but task was created",
        );
        // Task was created successfully, but scheduler failed - this is a warning, not an error
      }
    }

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
  userId: string,
) {
  try {
    // Get existing task first to check current recurrence status
    const existingTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
    });

    if (!existingTask) {
      throw new Error("Task not found");
    }

    // Validate recurrence parameters if they're being updated
    if (
      "isRecurring" in taskData ||
      "cronExpression" in taskData ||
      "recurrenceEndDate" in taskData ||
      "recurrenceLimit" in taskData
    ) {
      // For partial updates, use existing task values as defaults
      const finalIsRecurring = taskData.isRecurring ?? existingTask.isRecurring;
      const finalCronExpression =
        taskData.cronExpression ?? existingTask.cronExpression;
      const finalRecurrenceEndDate =
        taskData.recurrenceEndDate ??
        (existingTask.recurrenceEndDate
          ? existingTask.recurrenceEndDate.toISOString()
          : null);
      const finalRecurrenceLimit =
        taskData.recurrenceLimit ?? existingTask.recurrenceLimit;

      const recurrenceValidation = validateRecurrenceParams(
        finalIsRecurring,
        finalCronExpression,
        finalRecurrenceEndDate,
        finalRecurrenceLimit,
      );

      if (!recurrenceValidation.isValid) {
        throw new ValidationError(
          recurrenceValidation.error || "Invalid recurrence parameters",
        );
      }
    }

    // Get current task tags before update for history
    const currentTaskTags = await getTaskTags(id);

    // Create a data object without tags for the task update
    const { tags: tagNames, ...taskUpdateData } = taskData;

    // Validate assignedToId if it's being updated - strict validation (no fallback)
    if ("assignedToId" in taskUpdateData) {
      const validatedAssignedToId = await validateAssignedToId(
        taskUpdateData.assignedToId,
        userId,
        false, // No fallback for update operations - strict validation
      );
      taskUpdateData.assignedToId = validatedAssignedToId;
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

    // Handle recurrence fields
    let recurrenceEndDateValue: Date | null = null;
    let includeRecurrenceEndDateUpdate = false;
    let recurrenceLimitValue: number | null = null;
    let includeRecurrenceLimitUpdate = false;
    let runImmediatelyValue: boolean | null = null;
    let includeRunImmediatelyUpdate = false;
    let nextRunAtValue: Date | null = null;
    let includeNextRunAtUpdate = false;

    if (Object.hasOwn(taskUpdateData, "recurrenceEndDate")) {
      includeRecurrenceEndDateUpdate = true;
      recurrenceEndDateValue = taskUpdateData.recurrenceEndDate
        ? new Date(taskUpdateData.recurrenceEndDate)
        : null;
    }

    if (Object.hasOwn(taskUpdateData, "recurrenceLimit")) {
      includeRecurrenceLimitUpdate = true;
      recurrenceLimitValue = taskUpdateData.recurrenceLimit ?? null;
    }

    if (Object.hasOwn(taskUpdateData, "runImmediately")) {
      includeRunImmediatelyUpdate = true;
      runImmediatelyValue = taskUpdateData.runImmediately ?? false;
    }

    // Calculate next run time if cron expression is being updated
    if (taskUpdateData.isRecurring && taskUpdateData.cronExpression) {
      includeNextRunAtUpdate = true;
      nextRunAtValue = getNextExecutionTime(taskUpdateData.cronExpression);
    } else if (taskUpdateData.isRecurring === false) {
      // If task is being set to non-recurring, clear next run time and scheduler ID
      includeNextRunAtUpdate = true;
      nextRunAtValue = null;
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
    const updateSet: { [key: string]: any } = {
      ...taskUpdateData,
      updatedAt: new Date(), // Use current date
    };

    // Conditionally add dueDate to the update set
    if (includeDueDateUpdate) {
      updateSet.dueDate = dueDateValue;
    } else {
      // If dueDate was not in the input, remove it from the updateSet
      // to avoid accidentally setting it to undefined or null
      delete updateSet.dueDate;
    }

    // Conditionally add recurrence fields to the update set
    if (includeRecurrenceEndDateUpdate) {
      updateSet.recurrenceEndDate = recurrenceEndDateValue;
    }

    if (includeRecurrenceLimitUpdate) {
      updateSet.recurrenceLimit = recurrenceLimitValue;
    }

    if (includeRunImmediatelyUpdate) {
      updateSet.runImmediately = runImmediatelyValue;
    }

    if (includeNextRunAtUpdate) {
      updateSet.nextRunAt = nextRunAtValue;
    }

    if (includeCompletedAtUpdate) {
      updateSet.completedAt = completedAtValue;
    }

    // Clear recurrence fields when disabling recurrence
    if (taskUpdateData.isRecurring === false) {
      updateSet.cronExpression = null;
      updateSet.recurrenceLimit = null;
      updateSet.runImmediately = false;
    }

    // Remove the original properties if they exist from taskUpdateData spread
    if (Object.hasOwn(updateSet, "dueDate") && !includeDueDateUpdate) {
      delete updateSet.dueDate;
    }
    if (
      Object.hasOwn(updateSet, "recurrenceEndDate") &&
      !includeRecurrenceEndDateUpdate
    ) {
      delete updateSet.recurrenceEndDate;
    }
    if (
      Object.hasOwn(updateSet, "recurrenceLimit") &&
      !includeRecurrenceLimitUpdate
    ) {
      delete updateSet.recurrenceLimit;
    }
    if (
      Object.hasOwn(updateSet, "runImmediately") &&
      !includeRunImmediatelyUpdate
    ) {
      delete updateSet.runImmediately;
    }
    if (Object.hasOwn(updateSet, "nextRunAt") && !includeNextRunAtUpdate) {
      delete updateSet.nextRunAt;
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

    const updatedTaskResult = await db
      .update(tasks)
      .set(updateSet)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();

    if (!updatedTaskResult.length) {
      throw new Error("Task update failed or task not found");
    }
    const updatedDbTask = updatedTaskResult[0];

    // Handle tags if provided
    if (tagNames) {
      // Remove existing tags
      await db.delete(tasksTags).where(eq(tasksTags.taskId, id));

      // Add new tags
      if (tagNames.length > 0) {
        await addTagsToTask(id, tagNames, userId);
      }
    }

    // Record history for task update
    // Format existingTask's dueDate for comparison if needed
    const formattedExistingTask = cleanTaskForResponse(
      existingTask,
      currentTaskTags,
    );
    await recordHistory({
      action: "update",
      itemType: "task",
      itemId: id,
      itemName: taskData.title || existingTask.title,
      beforeData: formattedExistingTask, // Use formatted data for consistency
      // Construct afterData based on the update, ensuring dueDate is the input string/null
      afterData: {
        ...formattedExistingTask,
        ...taskData,
        tags: tagNames ?? currentTaskTags,
      },
      actor: "user",
      userId: userId,
    });

    // Queue task execution processing if assignment to AI assistant has changed
    const finalAssignedToId =
      taskUpdateData.assignedToId || existingTask.assignedToId;
    const assignmentChanged =
      "assignedToId" in taskUpdateData &&
      taskUpdateData.assignedToId !== existingTask.assignedToId;
    const dueDateChanged =
      includeDueDateUpdate &&
      dueDateValue?.getTime() !== existingTask.dueDate?.getTime();
    const nextRunAtChanged =
      includeNextRunAtUpdate &&
      nextRunAtValue?.getTime() !== existingTask.nextRunAt?.getTime();

    if (assignmentChanged || dueDateChanged) {
      // Cancel existing task execution job before creating new one
      await cancelTaskExecutionJob(id);

      if (finalAssignedToId) {
        const isAssignedToAI = await isAIAssistant(finalAssignedToId);
        if (isAssignedToAI) {
          const finalDueDate = includeDueDateUpdate
            ? dueDateValue
            : existingTask.dueDate;
          const delay = calculateAIAssistantJobDelay(finalDueDate);

          const queue = getQueue(QueueNames.TASK_EXECUTION_PROCESSING);
          if (queue) {
            // Redis/BullMQ mode
            await queue.add("process-task-execution", {
              taskId: id,
              userId: userId,
              dueDate: finalDueDate ?? undefined,
              isAssignedToAI: true,
            }, {
              delay,
              removeOnComplete: {
                age: 3600 * 24,
                count: 1000,
              },
              removeOnFail: false,
            });
            logger.info(
              { taskId: id, userId, assignedToId: finalAssignedToId, delay },
              "Queued updated task for execution processing (Redis)",
            );
          } else {
            // Database queue mode - use queueAdapter with execution jobType
            const queueAdapter = getQueueAdapter();
            const scheduledFor = delay > 0 ? new Date(Date.now() + delay) : undefined;
            await queueAdapter.enqueueTask({
              taskId: id,
              userId: userId,
              title: existingTask.title,
              description: existingTask.description || "",
              isAssignedToAI: true,
              assignedToId: finalAssignedToId,
              dueDate: finalDueDate ?? undefined,
              scheduledFor,
              jobType: "execution",
            });
            logger.info(
              { taskId: id, userId, assignedToId: finalAssignedToId, delay },
              "Queued updated task for execution processing (Database)",
            );
          }
        }
      }
    }

    // Handle recurrence scheduler updates
    const recurrenceChanged =
      "isRecurring" in taskUpdateData ||
      "cronExpression" in taskUpdateData ||
      "recurrenceEndDate" in taskUpdateData ||
      "recurrenceLimit" in taskUpdateData ||
      "runImmediately" in taskUpdateData;

    // Determine final recurrence state
    const finalIsRecurring =
      taskUpdateData.isRecurring ?? existingTask.isRecurring;
    const finalCronExpression =
      taskUpdateData.cronExpression ?? existingTask.cronExpression;

    // Check if we need to update recurring scheduler due to:
    // 1. Recurrence parameters changed (cron, end date, recurring flag)
    // 2. Assignment changed and task is/will be recurring
    // 3. Task transitions from non-recurring to recurring
    // 4. Task transitions from recurring to non-recurring
    const shouldUpdateRecurringScheduler =
      recurrenceChanged ||
      (assignmentChanged &&
        (existingTask.isRecurring || finalIsRecurring) &&
        existingTask.cronExpression);

    if (shouldUpdateRecurringScheduler) {
      const finalRecurrenceEndDate = includeRecurrenceEndDateUpdate
        ? recurrenceEndDateValue
        : existingTask.recurrenceEndDate;

      logger.info(
        {
          taskId: id,
          assignmentChanged,
          recurrenceChanged,
          finalIsRecurring,
          finalCronExpression,
          existingIsRecurring: existingTask.isRecurring,
          existingCronExpression: existingTask.cronExpression,
          finalAssignedToId,
          existingAssignedToId: existingTask.assignedToId,
        },
        "Processing recurring task scheduler update",
      );

      if (finalIsRecurring && finalCronExpression) {
        // Update or create scheduler with updated assignment information
        const isAssignedToAI = finalAssignedToId
          ? await isAIAssistant(finalAssignedToId)
          : false;
        const finalRecurrenceLimit = includeRecurrenceLimitUpdate
          ? recurrenceLimitValue
          : existingTask.recurrenceLimit;
        const finalRunImmediately = includeRunImmediatelyUpdate
          ? runImmediatelyValue
          : existingTask.runImmediately;

        const success = await upsertTaskScheduler(
          id,
          finalCronExpression,
          {
            taskId: id,
            title: taskData.title || existingTask.title,
            description: taskData.description ?? existingTask.description ?? "",
            userId: userId,
            assignedToId: finalAssignedToId,
            isAssignedToAI: isAssignedToAI,
          },
          finalRecurrenceEndDate,
          finalRecurrenceLimit ?? undefined,
          finalRunImmediately ?? undefined,
        );

        if (!success) {
          logger.error(
            {
              taskId: id,
              cronExpression: finalCronExpression,
              assignedToId: finalAssignedToId,
            },
            "Failed to update recurring task scheduler",
          );
        } else {
          logger.info(
            {
              taskId: id,
              assignmentChanged,
              recurrenceChanged,
              assignedToId: finalAssignedToId,
              cronExpression: finalCronExpression,
              isAssignedToAI,
            },
            "Successfully updated recurring task scheduler",
          );
        }
      } else {
        // Remove scheduler if task is no longer recurring
        logger.info(
          {
            taskId: id,
            reason: finalIsRecurring
              ? "missing cron expression"
              : "task no longer recurring",
            finalIsRecurring,
            finalCronExpression,
          },
          "Removing recurring task scheduler",
        );
        const success = await removeTaskScheduler(id);
        if (!success) {
          logger.error(
            { taskId: id },
            "Failed to remove recurring task scheduler",
          );
        }
      }
    }

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
      throw new Error("Task not found"); // Re-throw specific error
    }

    // Differentiate between not found and other errors if possible
    if (error instanceof Error && error.message === "Task not found") {
      // If thrown earlier
      throw error;
    }

    // Re-throw validation errors (like Invalid user ID) to preserve specific error messages
    if (error instanceof Error && error.message.includes("Invalid user ID")) {
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
  status: "not-started" | "in-progress" | "completed",
  assignedAssistantId: string,
  completedAt?: string | null,
): Promise<void> {
  try {
    logger.info(
      { taskId, status, assignedAssistantId, completedAt },
      "Updating task status as assistant",
    );

    // Get the task to validate assignment and get task owner
    const task = await db.query.tasks.findFirst({
      where: eq(tasks.id, taskId),
      columns: {
        id: true,
        userId: true,
        assignedToId: true,
        status: true,
        completedAt: true,
      },
    });

    if (!task) {
      throw new Error("Task not found");
    }

    // Verify the assistant is actually assigned to this task
    if (task.assignedToId !== assignedAssistantId) {
      throw new Error(
        `Assistant ${assignedAssistantId} is not assigned to task ${taskId}`,
      );
    }

    const beforeData = {
      status: task.status,
      completedAt: task.completedAt,
    };

    // Prepare update data
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
      actor: "assistant", // Important: shows this was done by assistant
      metadata: {
        updatedFields: ["status", ...(completedAt ? ["completedAt"] : [])],
        statusChange: `${beforeData.status} → ${status}`,
        assistantId: assignedAssistantId, // Store assistant ID in metadata instead
      },
    });

    logger.info(
      {
        taskId,
        status,
        assignedAssistantId,
        taskOwner: task.userId,
      },
      "Task status updated successfully by assistant",
    );
  } catch (error) {
    logger.error(
      {
        taskId,
        status,
        assignedAssistantId,
        completedAt,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to update task status as assistant",
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
export async function deleteTask(id: string, userId: string) {
  try {
    logger.info({ taskId: id, userId }, "Starting task deletion process");

    // Get existing task for history
    const existingTask = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, userId)),
    });

    if (!existingTask) {
      logger.warn({ taskId: id, userId }, "Task not found for deletion");
      throw new Error("Task not found");
    }

    logger.info(
      {
        taskId: id,
        isRecurring: existingTask.isRecurring,
        cronExpression: existingTask.cronExpression,
        recurrenceEndDate: existingTask.recurrenceEndDate,
      },
      "Task data retrieved for deletion",
    );

    // Get task tags before deletion for history
    const taskTags = await getTaskTags(id);

    // Remove recurring task scheduler if exists - BEFORE deleting task data
    if (existingTask.isRecurring) {
      logger.info({ taskId: id }, "Removing recurring task scheduler");
      const schedulerRemoved = await removeTaskScheduler(id);
      logger.info({ taskId: id, schedulerRemoved }, "Scheduler removal result");
    }

    // Cancel task execution job if it exists - don't fail if job is locked
    logger.info({ taskId: id }, "Cancelling task execution job");
    const cancelSuccess = await cancelTaskExecutionJob(id);
    if (!cancelSuccess) {
      logger.warn(
        { taskId: id },
        "Task execution job cancellation failed, proceeding with deletion",
      );
    }

    // Delete task-tag relationships first
    await db.delete(tasksTags).where(eq(tasksTags.taskId, id));

    // Delete processing jobs for this task
    await db
      .delete(assetProcessingJobs)
      .where(
        and(
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.assetId, id),
        ),
      );

    // Delete the task
    const deletedTask = await db
      .delete(tasks)
      .where(and(eq(tasks.id, id), eq(tasks.userId, userId)))
      .returning();

    if (!deletedTask.length) {
      throw new Error("Task not found");
    }

    // Record history for task deletion
    await recordHistory({
      action: "delete",
      itemType: "task",
      itemId: id,
      itemName: existingTask.title,
      beforeData: { ...existingTask, tags: taskTags },
      actor: "user",
      userId: userId,
    });

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

// Get all tasks for a user with their tags
export async function getAllTasks(userId: string) {
  try {
    // Get all tasks for the user with processing status
    const tasksList = await db
      .select({
        task: tasks,
        status: assetProcessingJobs.status,
      })
      .from(tasks)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(tasks.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.jobType, "tag_generation"),
        ),
      )
      .where(eq(tasks.userId, userId));

    // For each task, get its tags
    const tasksWithTags = await Promise.all(
      tasksList.map(async (result) => {
        const task = result.task;
        const taskTagNames = await getTaskTags(task.id);
        return cleanTaskForResponse(task, taskTagNames, result.status);
      }),
    );

    return tasksWithTags;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting all tasks",
    );
    throw new Error("Failed to fetch tasks");
  }
}

// Get a single task by ID with its tags
export async function getTaskById(taskId: string, userId: string) {
  try {
    // Get the task by ID
    const [result] = await db
      .select({
        task: tasks,
        status: assetProcessingJobs.status,
      })
      .from(tasks)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(tasks.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.jobType, "tag_generation"),
        ),
      )
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));

    if (!result) {
      // Return null instead of throwing an error
      return null;
    }

    const task = result.task;

    // Get tags for the task
    const taskTagNames = await getTaskTags(taskId);

    // Get comments for the task
    const taskCommentsData = await getTaskCommentsWithUsers(taskId);

    return cleanTaskForResponse(
      task,
      taskTagNames,
      result.status,
      taskCommentsData,
    );
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
async function getTaskCommentsWithUsers(taskId: string) {
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

  return comments.map((comment) => ({
    ...comment,
    createdAt: comment.createdAt ? formatToISO8601(comment.createdAt) : null,
    updatedAt: comment.updatedAt ? formatToISO8601(comment.updatedAt) : null,
  }));
}

// Helper function to add tags to a task
async function addTagsToTask(
  taskId: string,
  tagNames: string[],
  userId: string,
  tx: any = db,
) {
  if (!tagNames.length) return;
  // Pass the transaction object to getOrCreateTags
  const tagList = await getOrCreateTags(tagNames, userId, tx);
  if (tagList.length > 0) {
    await tx.insert(tasksTags).values(
      tagList.map((tag) => ({
        taskId: taskId,
        tagId: tag.id,
      })),
    );
  }
}

// Helper function to get a task with its tags
async function getTaskWithTags(taskId: string) {
  const task = await db.query.tasks.findFirst({
    where: eq(tasks.id, taskId),
  });

  if (!task) return null;

  const taskTagNames = await getTaskTags(taskId);

  return cleanTaskForResponse(task, taskTagNames);
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
function _buildTaskQueryConditions(
  userId: string,
  text?: string,
  status?: TaskStatus,
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): (SQL | undefined)[] {
  // Return type allowing undefined for clarity before filtering/spreading
  // Explicitly type the array elements
  const definedConditions: (SQL | undefined)[] = [eq(tasks.userId, userId)];

  if (text && text.trim()) {
    const searchTerm = `%${text.trim()}%`;
    definedConditions.push(
      or(like(tasks.title, searchTerm), like(tasks.description, searchTerm)),
    );
  }

  if (status) {
    definedConditions.push(eq(tasks.status, status));
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

  // Return the array including potential undefined values.
  // The `and(...conditions)` spread in the calling functions handles filtering undefined.
  return definedConditions;
}

/**
 * Search tasks by text, tags, status, and date range.
 *
 * @param userId - The ID of the user.
 * @param text - Optional text search.
 * @param tagsList - Optional array of tags.
 * @param status - Optional task status.
 * @param startDate - Optional start date (due date).
 * @param endDate - Optional end date (due date).
 * @param limit - Optional maximum number of results.
 * @param dueDateStart - Optional start due date filter.
 * @param dueDateEnd - Optional end due date filter.
 * @returns An array of tasks.
 */
export async function findTasks(
  userId: string,
  text?: string,
  tagsList?: string[],
  status?: TaskStatus,
  startDate?: Date,
  endDate?: Date,
  limit = 50,
  dueDateStart?: Date,
  dueDateEnd?: Date,
) {
  try {
    const conditions = _buildTaskQueryConditions(
      userId,
      text,
      status,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );

    const query = db
      .select({
        task: tasks,
        status: assetProcessingJobs.status,
      })
      .from(tasks)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(tasks.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "tasks"),
          eq(assetProcessingJobs.jobType, "tag_generation"),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(tasks.createdAt))
      .limit(limit);

    let entriesList = await query;

    if (tagsList && tagsList.length > 0) {
      const entryIds = entriesList.map((e) => e.task.id);
      if (entryIds.length === 0) return [];

      const entriesWithAllTags = await db
        .select({ taskId: tasksTags.taskId })
        .from(tasksTags)
        .innerJoin(tags, eq(tasksTags.tagId, tags.id))
        .where(
          and(
            inArray(tasksTags.taskId, entryIds),
            eq(tags.userId, userId),
            inArray(tags.name, tagsList),
          ),
        )
        .groupBy(tasksTags.taskId)
        .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);

      const filteredEntryIds = entriesWithAllTags.map((e) => e.taskId);
      entriesList = entriesList.filter((entry) =>
        filteredEntryIds.includes(entry.task.id),
      );
    }

    const resultsWithTags = await Promise.all(
      entriesList.map(async (result) => {
        const task = result.task;
        const entryTagNames = await getTaskTags(task.id);
        return cleanTaskForResponse(task, entryTagNames, result.status);
      }),
    );

    return resultsWithTags;
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
 * @param userId - The ID of the user.
 * @param text - Optional text search.
 * @param tagsList - Optional array of tags.
 * @param status - Optional task status.
 * @param startDate - Optional start date (due date).
 * @param endDate - Optional end date (due date).
 * @param dueDateStart - Optional start due date filter.
 * @param dueDateEnd - Optional end due date filter.
 * @returns The total count of matching tasks.
 */
export async function countTasks(
  userId: string,
  text?: string,
  tagsList?: string[],
  status?: TaskStatus,
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): Promise<number> {
  try {
    const conditions = _buildTaskQueryConditions(
      userId,
      text,
      status,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );

    const baseQuery = db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(...conditions));

    if (!tagsList || tagsList.length === 0) {
      const countResult = await db
        .select({ value: count() })
        .from(tasks)
        .where(and(...conditions));
      return countResult[0]?.value ?? 0;
    }

    const matchingEntries = await baseQuery;
    const entryIds = matchingEntries.map((e) => e.id);
    if (entryIds.length === 0) return 0;

    const entriesWithAllTags = await db
      .select({ taskId: tasksTags.taskId })
      .from(tasksTags)
      .innerJoin(tags, eq(tasksTags.tagId, tags.id))
      .where(
        and(
          inArray(tasksTags.taskId, entryIds),
          eq(tags.userId, userId),
          inArray(tags.name, tagsList),
        ),
      )
      .groupBy(tasksTags.taskId)
      .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);

    return entriesWithAllTags.length;
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
    const { retryAssetProcessing } = await import("./processing-status");
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
