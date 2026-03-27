import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_AGENT_ACTOR_ID,
  globalTestCleanup,
  loggedFetch,
  type TaskEntry,
  type TaskComment,
  waitForTaskState,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Task Actions & Inbox", { timeout: 180000 }, () => {
  const taskIds: string[] = [];

  afterAll(async () => {
    for (const id of taskIds) {
      await loggedFetch(`/tasks/${id}`, { method: "DELETE" }).catch(() => {});
    }
    await globalTestCleanup();
  });

  describe("Agent Auto-Execution (Scenarios #4, #5)", () => {
    let agentTaskId: string;

    it("should auto-execute when delegating to agent", async () => {
      const res = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Agent auto-exec test",
          prompt: "Say hello in one sentence",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      expect(res.status).toBe(201);
      const task = (await res.json()) as TaskEntry;
      agentTaskId = task.id;
      taskIds.push(task.id);

      // delegateMode should auto-upgrade to assist
      expect(task.delegateMode).toBe("assist");
      // Should be in progress with queued execution
      expect(task.taskStatus).toBe("in_progress");
      expect(task.latestExecutionStatus).toBe("queued");
    });

    it("should complete execution and enter needs_review", async () => {
      const task = await waitForTaskState(
        agentTaskId,
        "latestExecutionStatus",
        ["completed"],
        60000,
      );
      expect(task.attentionStatus).toBe("needs_review");
      expect(task.reviewStatus).toBe("pending");
    });

    it("should have agent output as comment", async () => {
      const res = await loggedFetch(`/tasks/${agentTaskId}/comments`);
      expect(res.status).toBe(200);
      const comments = (await res.json()) as TaskComment[];
      const aiComments = comments.filter(
        (c) => c.user.userType === "assistant",
      );
      expect(aiComments.length).toBeGreaterThanOrEqual(1);
    });

    it("should appear in inbox needsReview section", async () => {
      const res = await loggedFetch("/tasks/inbox");
      expect(res.status).toBe(200);
      const inbox = await res.json();
      const found = inbox.sections.needsReview.find(
        (t: any) => t.taskId === agentTaskId,
      );
      expect(found).toBeDefined();
      expect(inbox.totalCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Approve & Request Changes (Scenarios #24-26)", () => {
    let approveTaskId: string;
    let changesTaskId: string;

    it("should approve a needs_review task", async () => {
      // Use the task from previous describe, or create a new one
      // Create fresh to be independent
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Approve test",
          prompt: "Say yes",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      approveTaskId = task.id;
      taskIds.push(task.id);

      // Wait for execution
      await waitForTaskState(
        approveTaskId,
        "attentionStatus",
        ["needs_review"],
        60000,
      );

      // Approve
      const approveRes = await loggedFetch(`/tasks/${approveTaskId}/approve`, {
        method: "POST",
      });
      expect(approveRes.status).toBe(200);

      // Verify state
      const getRes = await loggedFetch(`/tasks/${approveTaskId}`);
      const approved = (await getRes.json()) as TaskEntry;
      expect(approved.taskStatus).toBe("completed");
      expect(approved.reviewStatus).toBe("approved");
      expect(approved.attentionStatus).toBe("none");
    });

    it("should remove approved task from inbox", async () => {
      const res = await loggedFetch("/tasks/inbox");
      const inbox = await res.json();
      const found = inbox.sections.needsReview.find(
        (t: any) => t.taskId === approveTaskId,
      );
      expect(found).toBeUndefined();
    });

    it("should handle request-changes", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Changes test",
          prompt: "Say hello",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      changesTaskId = task.id;
      taskIds.push(task.id);

      await waitForTaskState(
        changesTaskId,
        "attentionStatus",
        ["needs_review"],
        60000,
      );

      const changesRes = await loggedFetch(
        `/tasks/${changesTaskId}/request-changes`,
        { method: "POST" },
      );
      expect(changesRes.status).toBe(200);

      const getRes = await loggedFetch(`/tasks/${changesTaskId}`);
      const changed = (await getRes.json()) as TaskEntry;
      expect(changed.reviewStatus).toBe("changes_requested");
      expect(changed.attentionStatus).toBe("none");
    });
  });

  describe("Start & Cancel (Scenarios #12, #20)", () => {
    let manualTaskId: string;

    it("should start a manual task", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Start cancel test",
          prompt: "Count to 5",
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      manualTaskId = task.id;
      taskIds.push(task.id);

      const startRes = await loggedFetch(`/tasks/${manualTaskId}/start`, {
        method: "POST",
      });
      expect(startRes.status).toBe(200);
      const result = await startRes.json();
      expect(result.occurrenceId).toBeDefined();

      const getRes = await loggedFetch(`/tasks/${manualTaskId}`);
      const started = (await getRes.json()) as TaskEntry;
      expect(started.taskStatus).toBe("in_progress");
      expect(["queued", "running"]).toContain(started.latestExecutionStatus);
    });

    it("should cancel a queued/running task", async () => {
      const cancelRes = await loggedFetch(`/tasks/${manualTaskId}/cancel`, {
        method: "POST",
      });
      expect(cancelRes.status).toBe(200);

      const getRes = await loggedFetch(`/tasks/${manualTaskId}`);
      const cancelled = (await getRes.json()) as TaskEntry;
      expect(cancelled.latestExecutionStatus).toBe("cancelled");
      expect(cancelled.attentionStatus).toBe("none");
    });
  });

  describe("Retry (Scenarios #17-19)", () => {
    let failedTaskId: string;

    it("should retry a task after execution", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Retry test",
          prompt: "Say retry",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      failedTaskId = task.id;
      taskIds.push(task.id);

      // Wait for first execution to complete
      await waitForTaskState(
        failedTaskId,
        "latestExecutionStatus",
        ["completed", "failed"],
        60000,
      );

      // Retry creates a new occurrence
      const retryRes = await loggedFetch(`/tasks/${failedTaskId}/retry`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      expect(retryRes.status).toBe(200);
      const result = await retryRes.json();
      expect(result.occurrenceId).toBeDefined();

      const getRes = await loggedFetch(`/tasks/${failedTaskId}`);
      const retried = (await getRes.json()) as TaskEntry;
      expect(retried.attentionStatus).toBe("none");
      expect(["queued", "running"]).toContain(retried.latestExecutionStatus);
    });

    it("should retry with an edited prompt", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Retry prompt test",
          prompt: "Original prompt",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      await waitForTaskState(
        task.id,
        "latestExecutionStatus",
        ["completed", "failed"],
        60000,
      );

      const retryRes = await loggedFetch(`/tasks/${task.id}/retry`, {
        method: "POST",
        body: JSON.stringify({ prompt: "Try a different approach" }),
      });
      expect(retryRes.status).toBe(200);
    });
  });

  describe("Inbox State Machine (Scenarios #15, #17, #29)", () => {
    it("should show awaiting_input in waitingOnYou section", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Awaiting input test",
          attentionStatus: "awaiting_input",
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      const inboxRes = await loggedFetch("/tasks/inbox");
      const inbox = await inboxRes.json();
      const found = inbox.sections.waitingOnYou.find(
        (t: any) => t.taskId === task.id,
      );
      expect(found).toBeDefined();
    });

    it("should show failed tasks in failed section", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Failed task test",
          attentionStatus: "failed",
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      const inboxRes = await loggedFetch("/tasks/inbox");
      const inbox = await inboxRes.json();
      const found = inbox.sections.failed.find(
        (t: any) => t.taskId === task.id,
      );
      expect(found).toBeDefined();
    });

    it("should show needs_triage in needsTriage section", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Triage test",
          attentionStatus: "needs_triage",
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      const inboxRes = await loggedFetch("/tasks/inbox");
      const inbox = await inboxRes.json();
      const found = inbox.sections.needsTriage.find(
        (t: any) => t.taskId === task.id,
      );
      expect(found).toBeDefined();
    });

    it("should show urgent in urgent section", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Urgent test",
          attentionStatus: "urgent",
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      const inboxRes = await loggedFetch("/tasks/inbox");
      const inbox = await inboxRes.json();
      const found = inbox.sections.urgent.find(
        (t: any) => t.taskId === task.id,
      );
      expect(found).toBeDefined();
      expect(inbox.totalCount).toBeGreaterThanOrEqual(1);
    });

    it("should handle respond to awaiting_input task", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Respond test",
          attentionStatus: "awaiting_input",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      const respondRes = await loggedFetch(`/tasks/${task.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ response: "Here is the info you needed" }),
      });
      expect(respondRes.status).toBe(200);
    });
  });

  describe("Delegate Changes (Scenarios #36-38)", () => {
    it("should upgrade delegateMode when assigning agent", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Delegate change test" }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);
      expect(task.delegateMode).toBe("manual");

      const patchRes = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ delegateActorId: DEFAULT_AGENT_ACTOR_ID }),
      });
      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as TaskEntry;
      expect(updated.delegateActorId).toBe(DEFAULT_AGENT_ACTOR_ID);
      // delegateMode should auto-upgrade on update too
      expect(updated.delegateMode).toBe("assist");
    });

    it("should allow switching back to manual", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Back to manual test",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      // Wait for any auto-execution to start, then cancel it
      await delay(1000);
      await loggedFetch(`/tasks/${task.id}/cancel`, { method: "POST" }).catch(
        () => {},
      );

      const patchRes = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          delegateActorId: null,
          delegateMode: "manual",
        }),
      });
      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as TaskEntry;
      // delegateActorId may fall back to user ID when set to null
      expect(updated.delegateMode).toBe("manual");
    });
  });

  describe("Occurrence History", () => {
    it("should list occurrences after agent execution", async () => {
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Occurrence history test",
          prompt: "Say hi",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      // Wait for completion
      await waitForTaskState(
        task.id,
        "latestExecutionStatus",
        ["completed"],
        60000,
      );

      const occRes = await loggedFetch(
        `/tasks/${task.id}/occurrences?limit=10`,
      );
      expect(occRes.status).toBe(200);
      const data = await occRes.json();
      expect(data.items).toBeDefined();
      expect(data.items.length).toBeGreaterThanOrEqual(1);

      const occ = data.items[0];
      expect(occ.taskId).toBe(task.id);
      expect(occ.kind).toBe("manual_run");
      expect(occ.executionStatus).toBe("completed");
      expect(occ.resultSummary).toBeDefined();
    });

    it("should paginate occurrences", async () => {
      // Use an existing task that has occurrences — create and start twice
      const createRes = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Pagination test",
          prompt: "Say hi",
          delegateActorId: DEFAULT_AGENT_ACTOR_ID,
        }),
      });
      const task = (await createRes.json()) as TaskEntry;
      taskIds.push(task.id);

      await waitForTaskState(
        task.id,
        "latestExecutionStatus",
        ["completed"],
        60000,
      );

      // Fetch with limit=1
      const occRes = await loggedFetch(`/tasks/${task.id}/occurrences?limit=1`);
      expect(occRes.status).toBe(200);
      const data = await occRes.json();
      expect(data.items.length).toBeLessThanOrEqual(1);
      // hasMore and nextCursor should be present in the response shape
      expect(typeof data.hasMore).toBe("boolean");
    });
  });
});
