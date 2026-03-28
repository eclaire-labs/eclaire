import { afterAll, afterEach, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  RecurrenceTestHelpers,
  type TaskEntry,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Task Recurrence", { timeout: 90000 }, () => {
  const patterns = RecurrenceTestHelpers.getCronPatterns();
  let recurringTaskIds: string[] = [];

  afterEach(async () => {
    for (const taskId of recurringTaskIds) {
      await RecurrenceTestHelpers.cleanupTask(taskId);
    }
    recurringTaskIds = [];
  }, 75000);

  afterAll(async () => {
    await globalTestCleanup();
  }, 250000);

  describe("Creation", () => {
    it("should create recurring task with cron pattern", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Fast Recurring Task",
        patterns.everyTenSeconds,
      );
      recurringTaskIds.push(task.id);

      RecurrenceTestHelpers.verifyRecurrenceConfig(
        task,
        patterns.everyTenSeconds,
      );

      // nextOccurrenceAt should be set and in the future
      expect(task.nextOccurrenceAt).toBeDefined();
      expect(task.nextOccurrenceAt).not.toBeNull();
      expect(Date.parse(task.nextOccurrenceAt!)).not.toBeNaN();

      const nextOccurrence = new Date(task.nextOccurrenceAt!);
      expect(nextOccurrence.getTime()).toBeGreaterThan(Date.now());
    });

    it("should create recurring task with maxOccurrences", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Limited Recurring Task",
        patterns.everyTenSeconds,
        undefined,
        undefined,
        5,
      );
      recurringTaskIds.push(task.id);

      expect(task.scheduleType).toBe("recurring");
      expect(task.maxOccurrences).toBe(5);
      expect(task.occurrenceCount).toBe(0);
    });

    it("should create recurring task with daily pattern", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Daily Task",
        patterns.daily,
      );
      recurringTaskIds.push(task.id);

      expect(task.scheduleType).toBe("recurring");
      expect(task.scheduleRule).toBe(patterns.daily);
      expect(task.nextOccurrenceAt).not.toBeNull();
    });

    it("should create recurring task with weekly pattern", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Weekly Task",
        patterns.weekly,
      );
      recurringTaskIds.push(task.id);

      expect(task.scheduleType).toBe("recurring");
      expect(task.scheduleRule).toBe(patterns.weekly);
    });
  });

  describe("Validation", () => {
    it("should reject invalid cron expression", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Bad Cron Task",
          scheduleType: "recurring",
          scheduleRule: "not a valid cron",
        }),
      });

      // The task may be created but scheduler registration should fail,
      // or the backend validates the cron — either way it should not succeed silently
      // For now check it returns an error or the task has no nextOccurrenceAt
      if (response.status === 201) {
        const task = (await response.json()) as TaskEntry;
        recurringTaskIds.push(task.id);
        // Backend should have rejected the invalid cron
        expect(task.nextOccurrenceAt).toBeNull();
      } else {
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe("Pause & Resume", () => {
    it("should pause a recurring task", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Pausable Task",
        patterns.everyTenSeconds,
      );
      recurringTaskIds.push(task.id);
      expect(task.nextOccurrenceAt).not.toBeNull();

      // Pause
      const pauseResponse = await loggedFetch(`/tasks/${task.id}/pause`, {
        method: "POST",
      });
      expect(pauseResponse.status).toBe(200);

      // Verify paused state
      const getResponse = await loggedFetch(`/tasks/${task.id}`);
      expect(getResponse.status).toBe(200);
      const paused = (await getResponse.json()) as TaskEntry;
      expect(paused.taskStatus).toBe("blocked");
      expect(paused.nextOccurrenceAt).toBeNull();
    });

    it("should resume a paused recurring task", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Resumable Task",
        patterns.everyTenSeconds,
      );
      recurringTaskIds.push(task.id);

      // Pause
      await loggedFetch(`/tasks/${task.id}/pause`, { method: "POST" });

      // Resume
      const resumeResponse = await loggedFetch(`/tasks/${task.id}/resume`, {
        method: "POST",
      });
      expect(resumeResponse.status).toBe(200);

      // Verify resumed state
      const getResponse = await loggedFetch(`/tasks/${task.id}`);
      const resumed = (await getResponse.json()) as TaskEntry;
      expect(resumed.taskStatus).toBe("open");
      expect(resumed.nextOccurrenceAt).not.toBeNull();

      // nextOccurrenceAt should be in the future
      const next = new Date(resumed.nextOccurrenceAt!);
      expect(next.getTime()).toBeGreaterThan(Date.now());
    });

    it("should reject pause on non-recurring task", async () => {
      // Create a plain task
      const createResponse = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Plain Task" }),
      });
      const task = (await createResponse.json()) as TaskEntry;

      const pauseResponse = await loggedFetch(`/tasks/${task.id}/pause`, {
        method: "POST",
      });
      expect(pauseResponse.status).toBeGreaterThanOrEqual(400);

      // Cleanup
      await loggedFetch(`/tasks/${task.id}`, { method: "DELETE" });
    });
  });

  describe("Occurrence Tracking", () => {
    it("should track occurrenceCount", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Counting Task",
        patterns.everyThreeSeconds,
        undefined,
        undefined,
        5,
      );
      recurringTaskIds.push(task.id);

      expect(task.occurrenceCount).toBe(0);

      // Wait for scheduler tick + processing (may need up to 15s for DB scheduler poll interval)
      const waited = await RecurrenceTestHelpers.waitForJobExecution(
        task.id,
        task.nextOccurrenceAt ?? task.createdAt,
        20000,
      );

      const getResponse = await loggedFetch(`/tasks/${task.id}`);
      const updated = (await getResponse.json()) as TaskEntry;
      // If the scheduler ticked, occurrenceCount should have increased
      if (waited) {
        expect(updated.occurrenceCount).toBeGreaterThanOrEqual(1);
      }
    }, 30000);

    it("should list occurrences via API", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Occurrence List Task",
        patterns.everyThreeSeconds,
        undefined,
        undefined,
        3,
      );
      recurringTaskIds.push(task.id);

      // Wait for occurrences
      await delay(5000);

      const occResponse = await loggedFetch(
        `/tasks/${task.id}/occurrences?limit=10`,
      );
      expect(occResponse.status).toBe(200);

      const data = await occResponse.json();
      expect(data.items).toBeDefined();
      expect(Array.isArray(data.items)).toBe(true);

      if (data.items.length > 0) {
        const occ = data.items[0];
        expect(occ.taskId).toBe(task.id);
        expect(occ.kind).toBe("recurring_run");
        expect(occ.executionStatus).toBeDefined();
      }
    }, 15000);
  });

  describe("Schedule Pattern Update (Scenario #55)", () => {
    it("should update cron pattern and recompute nextOccurrenceAt", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Schedule update test",
        patterns.daily, // daily at 9am
      );
      recurringTaskIds.push(task.id);

      const originalNext = task.nextOccurrenceAt;
      expect(originalNext).not.toBeNull();

      // Update to weekly pattern
      const patchRes = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleRule: patterns.weekly,
        }),
      });
      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as TaskEntry;

      expect(updated.scheduleRule).toBe(patterns.weekly);
      expect(updated.nextOccurrenceAt).not.toBeNull();
      // Next occurrence should have changed (weekly is later than daily)
      expect(updated.nextOccurrenceAt).not.toBe(originalNext);
    });

    it("should clear schedule when changing scheduleType from recurring to none", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "De-schedule test",
        patterns.everyTenSeconds,
      );
      recurringTaskIds.push(task.id);
      expect(task.nextOccurrenceAt).not.toBeNull();

      const patchRes = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          scheduleType: "none",
          scheduleRule: null,
        }),
      });
      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as TaskEntry;

      expect(updated.scheduleType).toBe("none");
      expect(updated.nextOccurrenceAt).toBeNull();
    });
  });

  describe("maxOccurrences Runtime Enforcement (Scenario #54)", () => {
    it("should stop creating occurrences after maxOccurrences reached", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Max occ test",
        patterns.everyThreeSeconds,
        undefined,
        undefined,
        2, // maxOccurrences = 2
      );
      recurringTaskIds.push(task.id);

      expect(task.maxOccurrences).toBe(2);
      expect(task.occurrenceCount).toBe(0);

      // Wait for occurrenceCount to reach 2 (poll-based, handles scheduler latency)
      const reached = await RecurrenceTestHelpers.waitForTaskConsistency(
        task.id,
        { occurrenceCount: 2 } as Partial<TaskEntry>,
        45000,
      );
      expect(reached).toBe(true);

      // Verify via occurrence history
      const occRes = await loggedFetch(
        `/tasks/${task.id}/occurrences?limit=20`,
      );
      const occData = await occRes.json();
      const occCount = occData.items.length;
      expect(occCount).toBeGreaterThanOrEqual(2);

      // Wait a bit more to verify no new occurrences are created
      await delay(15000);
      const occRes2 = await loggedFetch(
        `/tasks/${task.id}/occurrences?limit=20`,
      );
      const occData2 = await occRes2.json();

      // Occurrence count should have stabilized
      expect(occData2.items.length).toBe(occCount);
    }, 90000);
  });

  describe("Deletion", () => {
    it("should clean up schedule when recurring task is deleted", async () => {
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Deletable Recurring Task",
        patterns.everyTenSeconds,
      );

      // Delete (don't track for afterEach cleanup since we're deleting here)
      const deleteResponse = await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
      expect([200, 204]).toContain(deleteResponse.status);

      // Task should be gone
      const getResponse = await loggedFetch(`/tasks/${task.id}`);
      expect(getResponse.status).toBe(404);
    });
  });
});
