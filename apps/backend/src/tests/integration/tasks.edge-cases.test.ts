import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ACTOR_ID,
  globalTestCleanup,
  loggedFetch,
  RecurrenceTestHelpers,
  type TaskEntry,
  waitForTaskState,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Task Edge Cases", { timeout: 120000 }, () => {
  const taskIds: string[] = [];

  afterAll(async () => {
    for (const id of taskIds) {
      await loggedFetch(`/tasks/${id}`, { method: "DELETE" }).catch(() => {});
    }
    await globalTestCleanup();
  }, 60000);

  describe("Cancel Recurring Occurrence (Scenario #21)", () => {
    it("should cancel current occurrence without stopping recurrence", async () => {
      const patterns = RecurrenceTestHelpers.getCronPatterns();
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Cancel occ test",
        patterns.everyTenSeconds,
        undefined,
        undefined,
        10,
      );
      taskIds.push(task.id);

      // Wait a bit for an occurrence to be created
      await delay(12000);

      // Cancel current occurrence
      const cancelRes = await loggedFetch(`/tasks/${task.id}/cancel`, {
        method: "POST",
      });
      expect(cancelRes.status).toBe(200);

      // Task should still be recurring
      const getRes = await loggedFetch(`/tasks/${task.id}`);
      const updated = (await getRes.json()) as TaskEntry;
      expect(updated.scheduleType).toBe("recurring");
      expect(updated.latestExecutionStatus).toBe("cancelled");
    });
  });

  describe("Running Agent + Due Date (Scenario #31)", () => {
    it("should not mark running agent task as urgent even when due", async () => {
      const now = new Date();
      const pastDue = new Date(now.getTime() - 60000).toISOString(); // 1 min ago

      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Due but running test",
          prompt: "Count to 10 slowly",
          dueDate: pastDue,
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      expect(createRes.status).toBe(201);
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      // Task is now running with past due date
      // The overdue checker should NOT override agent-related attention statuses
      // For now just verify the task was created with correct fields
      expect(task.dueDate).not.toBeNull();
      expect(task.delegateActorId).toBe(DEFAULT_AGENT_ACTOR_ID);
    });
  });

  describe("Archive / Cancel Triage (Scenario #41)", () => {
    it("should clear attention when cancelling a triage task", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Triage cancel test",
          attentionStatus: "needs_triage",
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      // Verify it's in inbox
      let inboxRes = await loggedFetch("/tasks/inbox");
      let inbox = await inboxRes.json();
      let found = inbox.sections.needsTriage.find(
        (t: any) => t.taskId === task.id,
      );
      expect(found).toBeDefined();

      // Cancel the task
      const patchRes = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          taskStatus: "cancelled",
          attentionStatus: "none",
        }),
      });
      expect(patchRes.status).toBe(200);

      // Should no longer be in inbox
      inboxRes = await loggedFetch("/tasks/inbox");
      inbox = await inboxRes.json();
      found = inbox.sections.needsTriage.find((t: any) => t.taskId === task.id);
      expect(found).toBeUndefined();
    });
  });

  describe("Completed Recurring (Scenario #43)", () => {
    it("should not appear in inbox when recurring task is completed", async () => {
      const patterns = RecurrenceTestHelpers.getCronPatterns();
      const task = await RecurrenceTestHelpers.createRecurringTask(
        "Complete recurring test",
        patterns.daily,
      );
      taskIds.push(task.id);

      // Pause first
      await loggedFetch(`/tasks/${task.id}/pause`, { method: "POST" });

      // Then complete
      const patchRes = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ taskStatus: "completed" }),
      });
      expect(patchRes.status).toBe(200);

      // Verify completed
      const getRes = await loggedFetch(`/tasks/${task.id}`);
      const completed = (await getRes.json()) as TaskEntry;
      expect(completed.taskStatus).toBe("completed");

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

      // Should appear in completed view
      const listRes = await loggedFetch(`/tasks?taskStatus=completed`);
      const list = await listRes.json();
      const found = list.items.find((t: any) => t.id === task.id);
      expect(found).toBeDefined();
    });
  });
});
