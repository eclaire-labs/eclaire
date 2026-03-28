import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ACTOR_ID,
  globalTestCleanup,
  loggedFetch,
  type TaskEntry,
  waitForTaskState,
} from "../utils/tasks-test-helpers.js";

describe("Task Scheduling", { timeout: 120000 }, () => {
  const taskIds: string[] = [];

  afterAll(async () => {
    for (const id of taskIds) {
      await loggedFetch(`/tasks/${id}`, { method: "DELETE" }).catch(() => {});
    }
    await globalTestCleanup();
  });

  describe("One-Time Scheduled Execution (Scenario #6)", () => {
    let scheduledTaskId: string;

    it("should create a one-time scheduled task", async () => {
      const scheduledFor = new Date(Date.now() + 10000).toISOString(); // 10s from now
      const res = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "One-time schedule test",
          prompt: "Say hello",
          scheduleType: "one_time",
          scheduleRule: scheduledFor,
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as TaskEntry;
      scheduledTaskId = task.id;
      taskIds.push(task.id);

      expect(task.scheduleType).toBe("one_time");
      expect(task.latestExecutionStatus).toBe("scheduled");
      expect(task.nextOccurrenceAt).not.toBeNull();
    });

    it("should have a queued occurrence with scheduledFor", async () => {
      const res = await loggedFetch(
        `/tasks/${scheduledTaskId}/occurrences?limit=10`,
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.items.length).toBe(1);

      const occ = data.items[0];
      expect(occ.executionStatus).toBe("queued");
      expect(occ.scheduledFor).not.toBeNull();
      expect(occ.kind).toMatch(/scheduled_run|reminder/);
    });

    it("should execute after the scheduled time", async () => {
      // Wait up to 60s for the scheduled execution to complete
      // (10s schedule delay + queue poll interval + execution time)
      const task = await waitForTaskState(
        scheduledTaskId,
        "latestExecutionStatus",
        ["completed", "failed", "running"],
        60000,
      );
      expect(["completed", "failed", "running"]).toContain(
        task.latestExecutionStatus,
      );
    });
  });

  describe("Due Date + Recurrence (Scenario #39)", () => {
    it("should create a recurring task with a due date", async () => {
      const dueDate = new Date(Date.now() + 86400000).toISOString(); // tomorrow
      const res = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Recurring with due date",
          scheduleType: "recurring",
          scheduleRule: "0 0 9 * * *", // daily at 9am
          dueDate,
        }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as TaskEntry;
      taskIds.push(task.id);

      expect(task.scheduleType).toBe("recurring");
      expect(task.dueDate).not.toBeNull();
      expect(task.nextOccurrenceAt).not.toBeNull();
    });
  });

  describe("Completed Task History (Scenario #42)", () => {
    it("should preserve occurrence history on completed task", async () => {
      // Create agent task
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "History preservation test",
          prompt: "Say done",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      // Wait for execution
      await waitForTaskState(
        task.id,
        "attentionStatus",
        ["needs_review"],
        60000,
      );

      // Approve to complete
      await loggedFetch(`/tasks/${task.id}/approve`, { method: "POST" });

      // Verify completed
      const getRes = await loggedFetch(`/tasks/${task.id}`);
      const completed = (await getRes.json()) as TaskEntry;
      expect(completed.taskStatus).toBe("completed");

      // Occurrence history should be preserved
      const occRes = await loggedFetch(
        `/tasks/${task.id}/occurrences?limit=10`,
      );
      const data = await occRes.json();
      expect(data.items.length).toBeGreaterThanOrEqual(1);
      expect(data.items[0].executionStatus).toBe("completed");

      // Should NOT be in inbox
      const inboxRes = await loggedFetch("/tasks/inbox");
      const inbox = await inboxRes.json();
      const allInboxIds = [
        ...inbox.sections.needsReview,
        ...inbox.sections.waitingOnYou,
        ...inbox.sections.failed,
        ...inbox.sections.needsTriage,
        ...inbox.sections.urgent,
      ].map((t: any) => t.taskId);
      expect(allInboxIds).not.toContain(task.id);

      // Should appear in completed filter
      const listRes = await loggedFetch(`/tasks?taskStatus=completed`);
      const list = await listRes.json();
      const found = list.items.find((t: any) => t.id === task.id);
      expect(found).toBeDefined();
    });
  });
});
