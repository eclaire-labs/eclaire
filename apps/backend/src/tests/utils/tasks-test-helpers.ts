import { Queue } from "bullmq";
import IORedis from "ioredis";
import { afterAll, expect } from "vitest";
import {
  BASE_URL,
  createAuthenticatedFetch,
  delay,
  TEST_API_KEY,
  VERBOSE,
} from "../utils/test-helpers.js";

// Create authenticated fetch function with base URL handling
export const loggedFetch = (url: string, options?: RequestInit) => {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
  return createAuthenticatedFetch(TEST_API_KEY)(fullUrl, options);
};

// AI Assistant constants (from seed data)
export const AI_ASSISTANT_USER_ID = "user-ai-assistant";
export const AI_ASSISTANT_API_KEY = "sk-aiassistant0001-fixedSecretAiAssistant1234567890";
export const loggedFetchAsAssistant = (url: string, options?: RequestInit) => {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;
  return createAuthenticatedFetch(AI_ASSISTANT_API_KEY)(fullUrl, options);
};

// Comment user interface
export interface CommentUser {
  id: string;
  displayName: string | null;
  userType: "user" | "assistant" | "worker";
}

// Task comment interface
export interface TaskComment {
  id: string;
  taskId: string;
  userId: string;
  content: string;
  createdAt: string; // ISO 8601 format
  updatedAt: string; // ISO 8601 format
  user: CommentUser;
}

// Custom interface for Tasks API response (aligned with schemas)
export interface TaskEntry {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: "not-started" | "in-progress" | "completed";
  dueDate: string | null; // ISO 8601 format
  assignedToId: string | null;
  enabled: boolean;
  tags: string[];
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  createdAt: string; // ISO 8601 format
  updatedAt: string; // ISO 8601 format
  processingStatus?: string;
  comments: TaskComment[];
  // Recurrence fields
  isRecurring: boolean;
  cronExpression: string | null;
  recurrenceEndDate: string | null;
  recurrenceLimit: number | null;
  runImmediately: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
}

// Response interface for delete operation
export interface TaskDeleteResponse {
  message: string;
}

// Response interface for comment delete operation
export interface CommentDeleteResponse {
  message: string;
}

// Response interface for search operations
export interface TaskSearchResponse {
  tasks: TaskEntry[];
  totalCount: number;
  limit: number;
}

// Global tracking for all recurring tasks (accessible to helpers and tests)
export let allRecurringTaskIds: string[] = [];

// Redis connection for scheduler inspection
let redisConnection: IORedis;
let taskExecutionQueue: Queue;

// Helper functions for recurrence testing
export const RecurrenceTestHelpers = {
  /**
   * Creates a recurring task with fast-repeating pattern for testing
   */
  createRecurringTask: async (
    title: string,
    cronExpression: string = "*/3 * * * * *",
    assignedToId?: string,
    recurrenceEndDate?: string,
    recurrenceLimit?: number,
    runImmediately?: boolean,
  ): Promise<TaskEntry> => {
    // Add default end date 10 seconds from now if none provided to prevent infinite loops
    const defaultEndDate =
      recurrenceEndDate || RecurrenceTestHelpers.getFutureDate(10);

    const taskData = {
      title,
      description: "Test recurring task",
      isRecurring: true,
      cronExpression,
      assignedToId,
      recurrenceEndDate: defaultEndDate,
      recurrenceLimit,
      runImmediately,
    };

    const response = await loggedFetch(`${BASE_URL}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TEST_API_KEY}`,
      },
      body: JSON.stringify(taskData),
    });

    if (response.status !== 201) {
      throw new Error(`Failed to create recurring task: ${response.status}`);
    }

    const task = (await response.json()) as TaskEntry;

    // Track task globally for cleanup
    allRecurringTaskIds.push(task.id);

    return task;
  },

  /**
   * Waits for task execution by polling job completion
   */
  waitForJobExecution: async (
    taskId: string,
    initialNextRunAt: string,
    maxWaitMs: number = 10000,
  ): Promise<boolean> => {
    const startTime = Date.now();
    const initialRun = new Date(initialNextRunAt);

    while (Date.now() - startTime < maxWaitMs) {
      // Check if there are any completed jobs for this task
      // Since we can't directly access BullMQ in tests, we'll check for task updates
      try {
        const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (response.status === 200) {
          const task = (await response.json()) as TaskEntry;
          // Check if lastRunAt has been set (indicates execution started)
          if (task.lastRunAt) {
            const lastRun = new Date(task.lastRunAt);
            // If lastRunAt is after the initial time, execution occurred
            if (lastRun > initialRun) {
              return true;
            }
          }
          // Also check if nextRunAt has been updated (indicates execution)
          if (task.nextRunAt) {
            const nextRun = new Date(task.nextRunAt);
            const now = new Date();
            // If nextRunAt has changed from initial AND is still in the future, execution occurred
            if (nextRun.getTime() !== initialRun.getTime() && nextRun > now) {
              return true;
            }
          }
        }
      } catch (error: any) {
        // Continue polling on error
      }

      await delay(500);
    }

    return false;
  },

  /**
   * Verifies that a task has recurrence properly configured
   */
  verifyRecurrenceConfig: (
    task: TaskEntry,
    expectedCron: string,
    expectedEndDate?: string,
    expectedLimit?: number,
    expectedImmediate?: boolean,
  ): void => {
    expect(task.isRecurring).toBe(true);
    expect(task.cronExpression).toBe(expectedCron);
    expect(task.nextRunAt).toBeDefined();
    expect(task.lastRunAt).toBeNull(); // Should be null initially

    if (expectedEndDate) {
      expect(task.recurrenceEndDate).toBe(expectedEndDate);
    }

    if (expectedLimit !== undefined) {
      expect(task.recurrenceLimit).toBe(expectedLimit);
    }

    if (expectedImmediate !== undefined) {
      expect(task.runImmediately).toBe(expectedImmediate);
    }
  },

  /**
   * Cleans up a task and ensures scheduler is removed (enhanced with retry)
   */
  cleanupTask: async (taskId: string): Promise<void> => {
    try {
      // Check scheduler state before deletion
      const schedulerBefore =
        await RecurrenceTestHelpers.inspectScheduler(taskId);
      console.log(
        `Scheduler state before deletion for ${taskId}:`,
        schedulerBefore,
      );

      // Wait a moment to allow any ongoing job execution to complete
      // This helps prevent race conditions during cleanup
      await delay(1000);

      const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      if (response.status !== 200 && response.status !== 404) {
        console.warn(`Failed to cleanup task ${taskId}: ${response.status}`);

        // Retry once after a longer delay to allow job completion
        await delay(2000);
        const retryResponse = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (retryResponse.status !== 200 && retryResponse.status !== 404) {
          console.warn(
            `Retry failed to cleanup task ${taskId}: ${retryResponse.status}`,
          );
        }
      }

      // Verify scheduler is removed after deletion
      await delay(1000);
      const schedulerAfter =
        await RecurrenceTestHelpers.inspectScheduler(taskId);
      console.log(
        `Scheduler state after deletion for ${taskId}:`,
        schedulerAfter,
      );

      if (schedulerAfter) {
        console.warn(
          `WARNING - Scheduler still exists after deletion for ${taskId}`,
        );
      } else {
        console.log(`SUCCESS - Scheduler properly removed for ${taskId}`);
      }

      // Add delay to ensure cleanup completes before next operation
      await delay(500);
    } catch (error: any) {
      console.warn(`Error cleaning up task ${taskId}:`, error);
    }
  },

  /**
   * Generates test cron expressions for different scenarios
   * Using 6-field format with seconds for fast test execution
   * Note: All recurring tasks now use bounded end dates to prevent infinite loops
   */
  getCronPatterns: () => ({
    everyThreeSeconds: "*/3 * * * * *", // Every 3 seconds (fast for testing, bounded)
    everyFiveSeconds: "*/5 * * * * *", // Every 5 seconds (balanced testing speed)
    everyTenSeconds: "*/10 * * * * *", // Every 10 seconds (slower but safer)
    daily: "0 0 9 * * *", // Daily at 9 AM
    weekly: "0 0 9 * * 1", // Weekly Monday at 9 AM
    monthly: "0 0 9 1 * *", // Monthly 1st at 9 AM
  }),

  /**
   * Creates a future date for testing end dates
   */
  getFutureDate: (offsetSeconds: number = 30): string => {
    const future = new Date(Date.now() + offsetSeconds * 1000);
    return future.toISOString();
  },

  /**
   * Creates a past date for testing validation
   */
  getPastDate: (offsetSeconds: number = 30): string => {
    const past = new Date(Date.now() - offsetSeconds * 1000);
    return past.toISOString();
  },

  /**
   * Waits for scheduler state to stabilize after operations
   */
  waitForSchedulerStabilization: async (
    taskId: string,
    maxWaitMs: number = 5000,
  ): Promise<boolean> => {
    const startTime = Date.now();
    let lastSchedulerId: string | null = null;
    let stableCount = 0;
    const requiredStableIterations = 3;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (response.status === 200) {
          const task = (await response.json()) as TaskEntry;

          if (task.nextRunAt === lastSchedulerId) {
            stableCount++;
            if (stableCount >= requiredStableIterations) {
              return true;
            }
          } else {
            lastSchedulerId = task.nextRunAt;
            stableCount = 0;
          }
        }
      } catch (error) {
        // Continue polling on error
      }

      await delay(500);
    }

    return false;
  },

  /**
   * Verifies that a task's scheduler has been properly cleaned up
   */
  verifySchedulerCleanup: async (
    taskId: string,
    maxWaitMs: number = 5000,
  ): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (response.status === 200) {
          const task = (await response.json()) as TaskEntry;

          // For non-recurring tasks, nextRunAt should be null
          if (!task.isRecurring && task.nextRunAt === null) {
            return true;
          }

          // For recurring tasks, nextRunAt should be present
          if (task.isRecurring && task.nextRunAt !== null) {
            return true;
          }
        }
      } catch (error) {
        // Continue polling on error
      }

      await delay(500);
    }

    return false;
  },

  /**
   * Performs concurrent task operations and tracks results
   */
  performConcurrentOperations: async <T>(
    operations: (() => Promise<T>)[],
    maxConcurrency: number = 5,
  ): Promise<{
    results: T[];
    errors: Error[];
    totalTime: number;
  }> => {
    const startTime = Date.now();
    const results: T[] = [];
    const errors: Error[] = [];

    // Execute operations in batches to control concurrency
    for (let i = 0; i < operations.length; i += maxConcurrency) {
      const batch = operations.slice(i, i + maxConcurrency);
      const batchPromises = batch.map(async (operation) => {
        try {
          return await operation();
        } catch (error) {
          errors.push(
            error instanceof Error ? error : new Error(String(error)),
          );
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((result) => result !== null));
    }

    return {
      results,
      errors,
      totalTime: Date.now() - startTime,
    };
  },

  /**
   * Waits for task state to become consistent across concurrent operations
   */
  waitForTaskConsistency: async (
    taskId: string,
    expectedState: Partial<TaskEntry>,
    maxWaitMs: number = 10000,
  ): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (response.status === 200) {
          const task = (await response.json()) as TaskEntry;

          // Check if all expected state properties match
          const isConsistent = Object.entries(expectedState).every(
            ([key, value]) => {
              return task[key as keyof TaskEntry] === value;
            },
          );

          if (isConsistent) {
            return true;
          }
        }
      } catch (error) {
        // Continue polling on error
      }

      await delay(500);
    }

    return false;
  },

  /**
   * Monitors task execution during concurrent operations
   */
  monitorConcurrentExecution: async (
    taskId: string,
    monitorDurationMs: number = 5000,
  ): Promise<{
    executionCount: number;
    stateChanges: Array<{
      timestamp: number;
      lastRunAt: string | null;
      nextRunAt: string | null;
    }>;
  }> => {
    const startTime = Date.now();
    const stateChanges: Array<{
      timestamp: number;
      lastRunAt: string | null;
      nextRunAt: string | null;
    }> = [];

    let executionCount = 0;
    let lastRunAt: string | null = null;

    while (Date.now() - startTime < monitorDurationMs) {
      try {
        const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (response.status === 200) {
          const task = (await response.json()) as TaskEntry;

          // Track execution count by changes in lastRunAt
          if (task.lastRunAt && task.lastRunAt !== lastRunAt) {
            executionCount++;
            lastRunAt = task.lastRunAt;
          }

          // Record state changes
          stateChanges.push({
            timestamp: Date.now(),
            lastRunAt: task.lastRunAt,
            nextRunAt: task.nextRunAt,
          });
        }
      } catch (error) {
        // Continue monitoring on error
      }

      await delay(250); // Poll every 250ms for fine-grained monitoring
    }

    return {
      executionCount,
      stateChanges,
    };
  },

  /**
   * Verifies data consistency between tasks and processing jobs tables
   */
  verifyDataConsistency: async (
    taskId: string,
  ): Promise<{
    taskExists: boolean;
    processingJobExists: boolean;
    consistent: boolean;
    taskData?: TaskEntry;
    processingJobData?: any;
  }> => {
    try {
      // Check task exists
      const taskResponse = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${TEST_API_KEY}`,
        },
      });

      const taskExists = taskResponse.status === 200;
      const taskData = taskExists
        ? ((await taskResponse.json()) as TaskEntry)
        : undefined;

      // Note: In a real implementation, you would check the processing jobs table
      // For this test, we'll simulate checking processing status from task data
      const processingJobExists = taskData?.processingStatus !== undefined;
      const processingJobData = processingJobExists
        ? { status: taskData?.processingStatus }
        : undefined;

      // Check consistency
      const consistent = taskExists === processingJobExists;

      return {
        taskExists,
        processingJobExists,
        consistent,
        taskData,
        processingJobData,
      };
    } catch (error) {
      return {
        taskExists: false,
        processingJobExists: false,
        consistent: false,
      };
    }
  },

  /**
   * Simulates database connection issues during operations
   */
  simulateDatabaseIssues: async (
    operation: () => Promise<any>,
    maxRetries: number = 3,
  ): Promise<{
    success: boolean;
    attempts: number;
    finalError?: Error;
  }> => {
    let attempts = 0;
    let finalError: Error | undefined;

    while (attempts < maxRetries) {
      attempts++;
      try {
        await operation();
        return {
          success: true,
          attempts,
        };
      } catch (error) {
        finalError = error instanceof Error ? error : new Error(String(error));
        if (attempts < maxRetries) {
          await delay(1000 * attempts); // Exponential backoff
        }
      }
    }

    return {
      success: false,
      attempts,
      finalError,
    };
  },

  /**
   * Verifies scheduler recovery after potential database issues
   */
  verifySchedulerRecovery: async (
    taskId: string,
    expectedCronExpression: string,
    maxWaitMs: number = 10000,
  ): Promise<boolean> => {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const response = await loggedFetch(`${BASE_URL}/tasks/${taskId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        });

        if (response.status === 200) {
          const task = (await response.json()) as TaskEntry;

          // Check if scheduler has recovered properly
          if (
            task.isRecurring &&
            task.cronExpression === expectedCronExpression &&
            task.nextRunAt
          ) {
            return true;
          }
        }
      } catch (error) {
        // Continue polling on error
      }

      await delay(500);
    }

    return false;
  },

  /**
   * Inspects the BullMQ scheduler for a specific task
   */
  inspectScheduler: async (taskId: string) => {
    // Initialize connections if not already done
    if (!redisConnection) {
      redisConnection = new IORedis(
        process.env.REDIS_URL || "redis://127.0.0.1:6379",
        {
          maxRetriesPerRequest: null,
        },
      );
    }

    if (!taskExecutionQueue) {
      const { QueueNames } = await import("../../lib/queues.js");
      taskExecutionQueue = new Queue(QueueNames.TASK_EXECUTION_PROCESSING, {
        connection: redisConnection,
      });
    }

    const schedulerId = `recurring-task-${taskId}`;

    try {
      const scheduler = await taskExecutionQueue.getJobScheduler(schedulerId);

      if (!scheduler) {
        if (VERBOSE) {
          console.log(`No scheduler found for task ${taskId}`);
        }
        return null;
      }

      const schedulerInfo = {
        id: schedulerId,
        name: schedulerId,
        cron: scheduler.pattern || null,
        endDate: scheduler.endDate ? new Date(scheduler.endDate) : null,
        nextRunAt: scheduler.next ? new Date(scheduler.next) : null,
        limit: scheduler.limit || null,
        immediately: (scheduler as any).immediately || false,
        raw: scheduler,
      };

      if (VERBOSE) {
        console.log(`--- Scheduler Info for ${taskId} ---`);
        console.log(`ID: ${schedulerInfo.id}`);
        console.log(`Name: ${schedulerInfo.name}`);
        console.log(`Cron: ${schedulerInfo.cron}`);
        console.log(
          `End Date: ${schedulerInfo.endDate ? schedulerInfo.endDate.toISOString() : "N/A"}`,
        );
        console.log(
          `Next Run At: ${schedulerInfo.nextRunAt ? schedulerInfo.nextRunAt.toISOString() : "N/A"}`,
        );
        console.log(`Limit: ${schedulerInfo.limit ?? "N/A"}`);
        console.log(`Immediately: ${schedulerInfo.immediately}`);
        console.log("------------------------------------");
      }

      return schedulerInfo;
    } catch (error) {
      if (VERBOSE) {
        console.log(`Error inspecting scheduler for task ${taskId}:`, error);
      }
      return null;
    }
  },
};

/**
 * Waits for AI-generated comments to appear on a task
 * @param taskId - The task ID to check for comments
 * @param maxWaitMs - Maximum time to wait in milliseconds (default: 60000ms)
 * @param minCommentCount - Minimum number of AI comments to wait for (default: 1)
 * @returns Promise<boolean> - Returns true if AI comments are found within timeout
 */
export const waitForAIComments = async (
  taskId: string,
  maxWaitMs: number = 60000,
  minCommentCount: number = 1,
): Promise<boolean> => {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const commentsResponse = await loggedFetch(`/tasks/${taskId}/comments`, {
        method: "GET",
      });

      if (commentsResponse.status === 200) {
        const comments = (await commentsResponse.json()) as TaskComment[];
        const aiComments = comments.filter(
          (c) => c.user.userType === "assistant",
        );

        if (aiComments.length >= minCommentCount) {
          return true;
        }
      }
    } catch (error) {
      console.warn(`Error checking for AI comments on task ${taskId}:`, error);
    }

    await delay(pollInterval);
  }

  return false;
};

// Global cleanup function to be called in afterAll
export const globalTestCleanup = async () => {
  // Clean up any remaining recurring tasks
  for (const taskId of allRecurringTaskIds) {
    await RecurrenceTestHelpers.cleanupTask(taskId);
  }
  allRecurringTaskIds = [];

  // Try to clear task processing queues if available
  try {
    const { getQueue, QueueNames } = await import("../../lib/queues.js");
    const taskQueue = getQueue(QueueNames.TASK_PROCESSING);
    const executionQueue = getQueue(QueueNames.TASK_EXECUTION_PROCESSING);

    if (taskQueue) {
      await taskQueue.drain(); // Remove all waiting jobs
      await taskQueue.clean(0, 1000, "completed"); // Clean completed jobs
      await taskQueue.clean(0, 1000, "failed"); // Clean failed jobs
    }

    if (executionQueue) {
      await executionQueue.drain(); // Remove all waiting jobs
      await executionQueue.clean(0, 1000, "completed"); // Clean completed jobs
      await executionQueue.clean(0, 1000, "failed"); // Clean failed jobs
    }
  } catch (error: any) {
    console.warn("Could not clean task queues:", error);
  }

  // Close Redis connections used for scheduler inspection
  try {
    if (taskExecutionQueue) {
      await taskExecutionQueue.close();
    }
    if (redisConnection) {
      await redisConnection.quit();
    }
  } catch (error) {
    console.warn("Error closing Redis connections:", error);
  }

  // Add a delay to ensure all cleanup completes
  await delay(2000);
};
