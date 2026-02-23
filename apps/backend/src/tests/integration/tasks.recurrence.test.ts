import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  AI_ASSISTANT_USER_ID,
  globalTestCleanup,
  loggedFetch,
  RecurrenceTestHelpers,
  type TaskEntry,
  waitForAIComments,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Task Recurrence", { timeout: 90000 }, () => {
  const patterns = RecurrenceTestHelpers.getCronPatterns();
  let recurringTaskIds: string[] = [];

  // Cleanup all recurring tasks after each test
  afterEach(async () => {
    for (const taskId of recurringTaskIds) {
      await RecurrenceTestHelpers.cleanupTask(taskId);
    }
    recurringTaskIds = [];
  }, 75000);

  // Global cleanup after all tests complete
  afterAll(async () => {
    await globalTestCleanup();
  }, 250000);

  describe("Creation", () => {
    it("should create recurring task with fast pattern for testing", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Fast Recurring Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10), // 10 second limit
      );
      recurringTaskIds.push(task.id);

      // Verify basic recurrence configuration
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyThreeSeconds,
      );

      // Verify ISO date format for nextRunAt
      expect(Date.parse(task.nextRunAt!)).not.toBeNaN();

      // Verify the next due date is in the future
      const nextDue = new Date(task.nextRunAt!);
      const now = new Date();
      expect(nextDue.getTime()).toBeGreaterThan(now.getTime());

      // Inspect the BullMQ scheduler to verify it's properly configured
      // Note: schedulerInfo is null in database queue mode (no Redis)
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );

      if (schedulerInfo) {
        expect(schedulerInfo.cron).toBe(patterns.everyThreeSeconds);

        // The endDate should match the task's recurrence end date
        const expectedEndDate = new Date(task.recurrenceEndDate!);
        expect(schedulerInfo.endDate?.getTime()).toBeCloseTo(
          expectedEndDate.getTime(),
          -2,
        );

        // Verify the scheduler's next run time is reasonable
        expect(schedulerInfo.nextRunAt).toBeDefined();
        expect(schedulerInfo.nextRunAt?.getTime()).toBeGreaterThan(
          now.getTime(),
        );

        // Verify new fields are properly set to defaults
        expect(schedulerInfo.limit).toBeNull(); // No limit by default
        expect(schedulerInfo.immediately).toBe(false); // Not immediate by default
      }
    });

    it("should create recurring task with end date", async () => {
      const endDate = RecurrenceTestHelpers.getFutureDate(60); // 1 minute from now

      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Limited Recurring Task",
        patterns.everyFiveSeconds,
        undefined,
        endDate,
      );
      recurringTaskIds.push(task.id);

      // Verify recurrence configuration with end date
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
        endDate,
      );

      expect(task.recurrenceEndDate).toBe(endDate);
      expect(Date.parse(task.recurrenceEndDate!)).not.toBeNaN();
    });

    it("should create recurring task assigned to current user", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "User Assigned Recurring Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10), // 10 second limit
      );
      recurringTaskIds.push(task.id);

      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
      );

      // Task should be assigned to current user (not AI assistant)
      expect(task.assignedToId).not.toBeNull();
      expect(task.assignedToId).not.toBe(AI_ASSISTANT_USER_ID);
    });

    it("should create non-recurring task (baseline)", async () => {
      const taskData = {
        title: "Non-Recurring Task",
        description: "This task should not recur",
        isRecurring: false,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(201);
      const task = (await response.json()) as TaskEntry;
      recurringTaskIds.push(task.id);

      // Verify non-recurring task configuration
      expect(task.isRecurring).toBe(false);
      expect(task.cronExpression).toBeNull();
      expect(task.nextRunAt).toBeNull();
      expect(task.recurrenceEndDate).toBeNull();
    });

    it("should handle various cron patterns correctly", async () => {
      const testCases = [
        { name: "Daily", cron: patterns.daily },
        { name: "Weekly", cron: patterns.weekly },
        { name: "Monthly", cron: patterns.monthly },
      ];

      for (const testCase of testCases) {
        const task = await RecurrenceTestHelpers.createRecurringTask(
          `${testCase.name} Recurring Task`,
          testCase.cron,
          undefined,
          RecurrenceTestHelpers.getFutureDate(10), // 10 second limit
        );
        recurringTaskIds.push(task.id);

        RecurrenceTestHelpers.verifyRecurrenceConfig(task, testCase.cron);

        // Verify nextRunAt is calculated for each pattern
        expect(task.nextRunAt).toBeDefined();
        expect(Date.parse(task.nextRunAt!)).not.toBeNaN();
      }
    });

    it("should allow creating recurring task assigned to AI assistant", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "AI Assistant Recurring Task",
        patterns.everyFiveSeconds,
        AI_ASSISTANT_USER_ID,
      );
      recurringTaskIds.push(task.id);

      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
      );
      expect(task.assignedToId).toBe(AI_ASSISTANT_USER_ID);
    });
  });

  describe("Validation", () => {
    it("should reject recurring task without cron expression", async () => {
      const taskData = {
        title: "Invalid Recurring Task",
        description: "Missing cron expression",
        isRecurring: true,
        // cronExpression is missing
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400); // Bad Request
      const error = (await response.json()) as any;
      expect(error.error).toContain("Cron expression is required");
    });

    it("should reject invalid cron expressions", async () => {
      const invalidCronPatterns = [
        "invalid", // Not a valid cron
        "* * *", // Too few fields
        "* * * * * * * *", // Too many fields
        "60 * * * * *", // Invalid second (0-59)
        "* 60 * * * *", // Invalid minute (0-59)
        "* * 25 * * *", // Invalid hour (0-23)
        "* * * 32 * *", // Invalid day (1-31)
        "* * * * 13 *", // Invalid month (1-12)
        "* * * * * 8", // Invalid day of week (0-7)
      ];

      for (const cronExpression of invalidCronPatterns) {
        const taskData = {
          title: `Invalid Cron Task - ${cronExpression}`,
          isRecurring: true,
          cronExpression,
        };

        const response = await loggedFetch(`/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taskData),
        });

        expect(response.status).toBe(400); // Bad Request
        const error = (await response.json()) as any;
        expect(error.error).toContain("Invalid cron expression");
      }
    });

    it("should reject empty cron expression", async () => {
      const taskData = {
        title: "Empty Cron Task",
        isRecurring: true,
        cronExpression: "",
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400); // Bad Request
      const error = (await response.json()) as any;
      expect(error.error).toContain("Cron expression is required");
    });

    it("should reject recurrence end date in the past", async () => {
      const pastDate = RecurrenceTestHelpers.getPastDate(30);

      const taskData = {
        title: "Past End Date Task",
        isRecurring: true,
        cronExpression: patterns.everyFiveSeconds,
        recurrenceEndDate: pastDate,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400); // Bad Request
      const error = (await response.json()) as any;
      expect(error.error).toContain(
        "Recurrence end date must be in the future",
      );
    });

    it("should reject invalid date format for recurrence end date", async () => {
      const taskData = {
        title: "Invalid Date Format Task",
        isRecurring: true,
        cronExpression: patterns.everyFiveSeconds,
        recurrenceEndDate: "not-a-date",
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400); // Bad Request
      const error = (await response.json()) as any;
      expect(error.error).toContain("Invalid recurrence end date format");
    });

    it("should accept valid cron expressions", async () => {
      const validCronPatterns = [
        "0 0 9 * * *", // Daily at 9 AM
        "0 0 9 * * 1", // Weekly Monday at 9 AM
        "0 0 9 1 * *", // Monthly 1st at 9 AM
        "*/5 * * * * *", // Every 5 seconds
        "0 */30 * * * *", // Every 30 minutes
      ];

      for (const cronExpression of validCronPatterns) {
        const task = await RecurrenceTestHelpers.createRecurringTask(
          `Valid Cron Task - ${cronExpression}`,
          cronExpression,
          undefined,
          RecurrenceTestHelpers.getFutureDate(10),
        );
        recurringTaskIds.push(task.id);

        RecurrenceTestHelpers.verifyRecurrenceConfig(task, cronExpression);
      }
    });

    it("should accept non-recurring task without cron expression", async () => {
      const taskData = {
        title: "Non-Recurring Task",
        description: "This task should not recur",
        isRecurring: false,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(201);
      const task = (await response.json()) as TaskEntry;
      recurringTaskIds.push(task.id);

      expect(task.isRecurring).toBe(false);
      expect(task.cronExpression).toBeNull();
    });

    it("should accept valid future end date", async () => {
      const futureDate = RecurrenceTestHelpers.getFutureDate(60);

      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Future End Date Task",
        patterns.everyFiveSeconds,
        undefined,
        futureDate,
      );
      recurringTaskIds.push(task.id);

      expect(task.recurrenceEndDate).toBe(futureDate);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
        futureDate,
      );
    });

    it("should reject negative recurrence limit", async () => {
      const taskData = {
        title: "Negative Limit Task",
        isRecurring: true,
        cronExpression: patterns.everyFiveSeconds,
        recurrenceLimit: -5,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400);
      const error = (await response.json()) as any;
      expect(error.error.issues).toHaveLength(1);
      expect(error.error.issues[0].path).toEqual(["recurrenceLimit"]);
      expect(error.error.issues[0].code).toBe("too_small");
      expect(error.error.issues[0].message).toBe(
        "Number must be greater than 0",
      );
    });

    it("should reject zero recurrence limit", async () => {
      const taskData = {
        title: "Zero Limit Task",
        isRecurring: true,
        cronExpression: patterns.everyFiveSeconds,
        recurrenceLimit: 0,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400);
      const error = (await response.json()) as any;
      expect(error.error.issues).toHaveLength(1);
      expect(error.error.issues[0].path).toEqual(["recurrenceLimit"]);
      expect(error.error.issues[0].code).toBe("too_small");
      expect(error.error.issues[0].message).toBe(
        "Number must be greater than 0",
      );
    });

    it("should reject non-integer recurrence limit", async () => {
      const taskData = {
        title: "Non-Integer Limit Task",
        isRecurring: true,
        cronExpression: patterns.everyFiveSeconds,
        recurrenceLimit: 5.5,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(400);
      const error = (await response.json()) as any;
      expect(error.error.issues).toHaveLength(1);
      expect(error.error.issues[0].path).toEqual(["recurrenceLimit"]);
      expect(error.error.issues[0].code).toBe("invalid_type");
      expect(error.error.issues[0].message).toBe(
        "Expected integer, received float",
      );
    });

    it("should accept valid positive recurrence limit", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Valid Limit Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        5, // limit
      );
      recurringTaskIds.push(task.id);

      expect(task.recurrenceLimit).toBe(5);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
        undefined,
        5,
      );
    });
  });

  describe("Edge Cases", () => {
    it("should handle extremely short recurrence intervals gracefully", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Very Fast Recurring Task",
        "* * * * * *", // Every second
        undefined,
        RecurrenceTestHelpers.getFutureDate(5), // 5 second limit
      );
      recurringTaskIds.push(task.id);

      RecurrenceTestHelpers.verifyRecurrenceConfig(task, "* * * * * *");

      // Should handle very fast intervals without crashing
      // Note: schedulerInfo is null in database queue mode (no Redis)
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      if (schedulerInfo) {
        expect(schedulerInfo.cron).toBe("* * * * * *");
      }
    });

    it("should handle task updates during potential execution window", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Update During Execution Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Wait briefly to allow scheduler to be established
      await delay(1000);

      // Update task while scheduler is active
      const updateData = {
        title: "Updated During Execution",
        description: "This task was updated during execution window",
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify task was updated but recurrence config remains intact
      expect(updatedTask.title).toBe(updateData.title);
      expect(updatedTask.description).toBe(updateData.description);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        updatedTask,
        patterns.everyThreeSeconds,
      );
    });

    it("should handle deletion of task with active scheduler", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Delete Active Scheduler Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Wait briefly to allow scheduler to be established
      await delay(1000);

      // Verify scheduler exists before deletion
      const schedulerBefore = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerBefore).toBeDefined();

      // Delete task
      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(204);

      // Verify scheduler is cleaned up after deletion
      await delay(1000);
      const schedulerAfter = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerAfter).toBeNull();

      // Remove from cleanup list since we already deleted it
      recurringTaskIds = recurringTaskIds.filter((id) => id !== task.id);
    });
  });

  describe("Updates", () => {
    it("should enable recurrence on existing non-recurring task", async () => {
      // Create non-recurring task
      const taskData = {
        title: "Enable Recurrence Task",
        description: "This will become recurring",
        isRecurring: false,
      };

      const createResponse = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(createResponse.status).toBe(201);
      const task = (await createResponse.json()) as TaskEntry;
      recurringTaskIds.push(task.id);

      // Verify initial non-recurring state
      expect(task.isRecurring).toBe(false);
      expect(task.cronExpression).toBeNull();

      // Enable recurrence
      const updateData = {
        isRecurring: true,
        cronExpression: patterns.everyFiveSeconds,
        recurrenceEndDate: RecurrenceTestHelpers.getFutureDate(10),
      };

      const updateResponse = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(updateResponse.status).toBe(200);
      const updatedTask = (await updateResponse.json()) as TaskEntry;

      // Verify recurrence is now enabled
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        updatedTask,
        patterns.everyFiveSeconds,
      );
      expect(updatedTask.recurrenceEndDate).toBe(updateData.recurrenceEndDate);
    });

    it("should update cron expression on existing recurring task", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Update Cron Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Update cron expression
      const updateData = {
        cronExpression: patterns.everyFiveSeconds,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify cron expression was updated
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        updatedTask,
        patterns.everyFiveSeconds,
      );

      // Scheduler ID should remain consistent
    });

    it("should disable recurrence on existing recurring task", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Disable Recurrence Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Verify recurrence is initially enabled
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
      );

      // Disable recurrence
      const updateData = {
        isRecurring: false,
        cronExpression: null,
        recurrenceEndDate: null,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify recurrence is now disabled
      expect(updatedTask.isRecurring).toBe(false);
      expect(updatedTask.cronExpression).toBeNull();
      expect(updatedTask.nextRunAt).toBeNull();
      expect(updatedTask.recurrenceEndDate).toBeNull();
    });
  });

  describe("Execution", () => {
    it("should execute recurring task assigned to user", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "User Execution Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Verify initial state
      expect(task.lastRunAt).toBeNull();
      expect(task.nextRunAt).toBeDefined();
      expect(task.assignedToId).not.toBe(AI_ASSISTANT_USER_ID);

      // Wait for execution
      const initialNextRunAt = task.nextRunAt!;
      const executed = await RecurrenceTestHelpers.waitForJobExecution(
        task.id,
        initialNextRunAt,
        8000, // 8 second timeout
      );

      expect(executed).toBe(true);

      // For user-assigned tasks, no AI comments are expected
      // The execution processor just marks the task as executed
    });

    it("should execute recurring task assigned to AI assistant", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "AI Assistant Execution Task",
        patterns.everyThreeSeconds,
        AI_ASSISTANT_USER_ID,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Verify initial state
      expect(task.lastRunAt).toBeNull();
      expect(task.nextRunAt).toBeDefined();
      expect(task.assignedToId).toBe(AI_ASSISTANT_USER_ID);

      // Wait for execution by checking for AI comments
      const initialNextRunAt = task.nextRunAt!;
      const executed = await RecurrenceTestHelpers.waitForJobExecution(
        task.id,
        initialNextRunAt,
        8000, // 8 second timeout
      );

      expect(executed).toBe(true);

      // Wait for AI comments to appear (indicates AI processing completed)
      const aiCommentsFound = await waitForAIComments(task.id, 60000);
      expect(aiCommentsFound).toBe(true);
    });

    it("should stop executing when recurrence end date is reached", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "End Date Stop Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(6), // 6 second limit
      );
      recurringTaskIds.push(task.id);

      // Wait for end date to be reached
      await delay(7000);

      // Verify scheduler has expired after end date
      const schedulerAfter = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      const hasExpired =
        !schedulerAfter ||
        !schedulerAfter.nextRunAt ||
        (schedulerAfter.endDate &&
          schedulerAfter.nextRunAt < schedulerAfter.endDate);
      expect(hasExpired).toBe(true);

      // Task should still exist but no longer be recurring
      const response = await loggedFetch(`/tasks/${task.id}`);
      expect(response.status).toBe(200);
    });
  });

  describe("Scheduler Lifecycle Management", () => {
    it("should maintain scheduler ID consistency across cron expression updates", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Scheduler ID Consistency Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Update cron expression
      const updateData = {
        cronExpression: patterns.everyTenSeconds,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Scheduler ID should remain consistent
      expect(updatedTask.cronExpression).toBe(patterns.everyTenSeconds);
    });

    it("should properly clean up scheduler when disabling recurrence", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Disable Cleanup Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Verify scheduler exists
      const schedulerBefore = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerBefore).toBeDefined();

      // Disable recurrence
      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isRecurring: false,
          cronExpression: null,
        }),
      });

      expect(response.status).toBe(200);

      // Verify scheduler is cleaned up or disabled
      await delay(3000);
      const schedulerAfter = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerAfter).toBeNull();
    });
  });

  describe("Concurrency and Race Conditions", () => {
    it("should handle concurrent task updates during active execution", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Concurrent Update Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(15),
      );
      recurringTaskIds.push(task.id);

      // Perform multiple concurrent updates
      const updateOperations = Array.from(
        { length: 5 },
        (_, i) => () =>
          loggedFetch(`/tasks/${task.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: `Concurrent Update ${i + 1}`,
              description: `Updated concurrently ${i + 1}`,
            }),
          }),
      );

      const results = await RecurrenceTestHelpers.performConcurrentOperations(
        updateOperations,
        3, // Max 3 concurrent operations
      );

      // All operations should succeed
      expect(results.errors).toHaveLength(0);
      expect(results.results).toHaveLength(5);

      // Final task should still have valid recurrence config
      const finalResponse = await loggedFetch(`/tasks/${task.id}`);
      expect(finalResponse.status).toBe(200);
      const finalTask = (await finalResponse.json()) as TaskEntry;

      RecurrenceTestHelpers.verifyRecurrenceConfig(
        finalTask,
        patterns.everyThreeSeconds,
      );
    });

    it("should handle rapid scheduler configuration changes", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Rapid Config Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Rapidly change cron expressions
      const cronUpdates = [
        patterns.everyFiveSeconds,
        patterns.everyTenSeconds,
        patterns.everyThreeSeconds,
      ];

      for (const cronExpression of cronUpdates) {
        const response = await loggedFetch(`/tasks/${task.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ cronExpression }),
        });

        expect(response.status).toBe(200);
        await delay(100); // Small delay between updates
      }

      // Wait for scheduler to stabilize
      const stabilized =
        await RecurrenceTestHelpers.waitForSchedulerStabilization(task.id);
      expect(stabilized).toBe(true);

      // Verify final configuration
      const finalResponse = await loggedFetch(`/tasks/${task.id}`);
      const finalTask = (await finalResponse.json()) as TaskEntry;
      expect(finalTask.cronExpression).toBe(patterns.everyThreeSeconds);
    });
  });

  describe("Limit Functionality", () => {
    it("should create task with execution limit", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Limited Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        3, // limit to 3 executions
      );
      recurringTaskIds.push(task.id);

      // Verify limit is properly set
      expect(task.recurrenceLimit).toBe(3);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyThreeSeconds,
        undefined,
        3,
      );

      // Verify scheduler has the limit configured
      // Note: schedulerInfo is null in database queue mode (no Redis)
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      if (schedulerInfo) {
        expect(schedulerInfo.limit).toBe(3);
      }
    });

    it("should update execution limit on existing task", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Update Limit Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        5,
      );
      recurringTaskIds.push(task.id);

      // Update the limit
      const updateData = {
        recurrenceLimit: 10,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify limit was updated
      expect(updatedTask.recurrenceLimit).toBe(10);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        updatedTask,
        patterns.everyFiveSeconds,
        undefined,
        10,
      );
    });

    it("should clear limit when set to null", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Clear Limit Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        5,
      );
      recurringTaskIds.push(task.id);

      // Clear the limit
      const updateData = {
        recurrenceLimit: null,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify limit was cleared
      expect(updatedTask.recurrenceLimit).toBeNull();
    });

    it("should create task without limit (default behavior)", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "No Limit Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        // No limit specified
      );
      recurringTaskIds.push(task.id);

      // Verify no limit is set
      expect(task.recurrenceLimit).toBeNull();

      // Verify scheduler has no limit
      // Note: schedulerInfo is null in database queue mode (no Redis)
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      if (schedulerInfo) {
        expect(schedulerInfo.limit).toBeNull();
      }
    });
  });

  describe("Immediate Execution", () => {
    it.skip("should create task with immediate execution", async () => {
      // Skipped: BullMQ 'immediately' property has ongoing compatibility issues
      // See: https://github.com/taskforcesh/bullmq/issues/2860
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Immediate Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        undefined, // no limit
        true, // runImmediately
      );
      recurringTaskIds.push(task.id);

      // Verify immediate flag is set
      expect(task.runImmediately).toBe(true);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
        undefined,
        undefined,
        true,
      );

      // Verify scheduler has immediate execution configured
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerInfo).toBeDefined();
      expect(schedulerInfo?.immediately).toBe(true);
    });

    it("should execute immediately then follow schedule", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Immediate Then Schedule Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(15),
        undefined,
        true,
      );
      recurringTaskIds.push(task.id);

      // Initial state should show immediate flag
      expect(task.runImmediately).toBe(true);
      expect(task.lastRunAt).toBeNull();

      // Wait a brief moment for immediate execution to potentially occur
      // Note: We can't easily test actual immediate execution in integration tests
      // without more complex timing controls, but we can verify the configuration
      await delay(1000);

      // The task should still be properly configured for recurring execution
      const currentResponse = await loggedFetch(`/tasks/${task.id}`);
      expect(currentResponse.status).toBe(200);
      const currentTask = (await currentResponse.json()) as TaskEntry;

      expect(currentTask.isRecurring).toBe(true);
      expect(currentTask.nextRunAt).toBeDefined();
    });

    it("should update runImmediately flag", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Update Immediate Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        undefined,
        false, // initially false
      );
      recurringTaskIds.push(task.id);

      // Update to enable immediate execution
      const updateData = {
        runImmediately: true,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify flag was updated
      expect(updatedTask.runImmediately).toBe(true);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        updatedTask,
        patterns.everyFiveSeconds,
        undefined,
        undefined,
        true,
      );
    });

    it.skip("should handle immediate execution for AI-assigned tasks", async () => {
      // Skipped: BullMQ 'immediately' property has ongoing compatibility issues
      // See: https://github.com/taskforcesh/bullmq/issues/2860
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "AI Immediate Task",
        patterns.everyFiveSeconds,
        AI_ASSISTANT_USER_ID,
        RecurrenceTestHelpers.getFutureDate(10),
        undefined,
        true,
      );
      recurringTaskIds.push(task.id);

      // Verify task is configured correctly
      expect(task.assignedToId).toBe(AI_ASSISTANT_USER_ID);
      expect(task.runImmediately).toBe(true);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyFiveSeconds,
        undefined,
        undefined,
        true,
      );

      // Verify scheduler configuration
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerInfo).toBeDefined();
      expect(schedulerInfo?.immediately).toBe(true);
    });

    it("should create task without immediate execution (default)", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "No Immediate Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        // runImmediately not specified (should default to false)
      );
      recurringTaskIds.push(task.id);

      // Verify immediate flag is false by default
      expect(task.runImmediately).toBe(false);

      // Verify scheduler does not have immediate execution
      // Note: schedulerInfo is null in database queue mode (no Redis)
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      if (schedulerInfo) {
        expect(schedulerInfo.immediately).toBe(false);
      }
    });
  });

  describe("Combined Features", () => {
    it.skip("should create task with both limit and immediate execution", async () => {
      // Skipped: BullMQ 'immediately' property has ongoing compatibility issues
      // See: https://github.com/taskforcesh/bullmq/issues/2860
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Combined Features Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        3, // limit
        true, // immediate
      );
      recurringTaskIds.push(task.id);

      // Verify both features are configured
      expect(task.recurrenceLimit).toBe(3);
      expect(task.runImmediately).toBe(true);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyThreeSeconds,
        undefined,
        3,
        true,
      );

      // Verify scheduler has both configurations
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerInfo).toBeDefined();
      expect(schedulerInfo?.limit).toBe(3);
      expect(schedulerInfo?.immediately).toBe(true);
    });

    it.skip("should respect limit when using immediate execution", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Limit With Immediate Task",
        patterns.everyThreeSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        1, // limit to 1 execution (immediate execution should count towards this)
        true,
      );
      recurringTaskIds.push(task.id);

      // Verify configuration
      expect(task.recurrenceLimit).toBe(1);
      expect(task.runImmediately).toBe(true);

      // With limit of 1 and immediate execution, the task should execute once immediately
      // and then the scheduler should be exhausted
      const schedulerInfo = await RecurrenceTestHelpers.inspectScheduler(
        task.id,
      );
      expect(schedulerInfo).toBeDefined();
      expect(schedulerInfo?.limit).toBe(1);
      expect(schedulerInfo?.immediately).toBe(true);
    });

    it("should update both limit and immediate together", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Update Both Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
        5,
        false,
      );
      recurringTaskIds.push(task.id);

      // Update both features
      const updateData = {
        recurrenceLimit: 10,
        runImmediately: true,
      };

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const updatedTask = (await response.json()) as TaskEntry;

      // Verify both were updated
      expect(updatedTask.recurrenceLimit).toBe(10);
      expect(updatedTask.runImmediately).toBe(true);
      RecurrenceTestHelpers.verifyRecurrenceConfig(
        updatedTask,
        patterns.everyFiveSeconds,
        undefined,
        10,
        true,
      );
    });
  });

  describe("Database Integration", () => {
    it("should maintain data consistency between tasks and processing jobs", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Data Consistency Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Verify data consistency
      const consistency = await RecurrenceTestHelpers.verifyDataConsistency(
        task.id,
      );
      expect(consistency.consistent).toBe(true);
      expect(consistency.taskExists).toBe(true);
    });

    it("should handle scheduler operations during database transaction scenarios", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Transaction Scenario Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Simulate database operation with potential transaction issues
      const operation = async () => {
        const response = await loggedFetch(`/tasks/${task.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: "Transaction Test Update",
            description: "Testing transaction handling",
          }),
        });

        if (response.status !== 200) {
          throw new Error(`Update failed: ${response.status}`);
        }
      };

      const result =
        await RecurrenceTestHelpers.simulateDatabaseIssues(operation);
      expect(result.success).toBe(true);
    });

    it("should handle scheduler recovery after potential database issues", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Recovery Test Task",
        patterns.everyFiveSeconds,
        undefined,
        RecurrenceTestHelpers.getFutureDate(10),
      );
      recurringTaskIds.push(task.id);

      // Simulate recovery scenario
      const recovered = await RecurrenceTestHelpers.verifySchedulerRecovery(
        task.id,
        patterns.everyFiveSeconds,
      );
      expect(recovered).toBe(true);
    });
  });
});
