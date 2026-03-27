import { afterAll, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  type TaskEntry,
  type TaskListResponse,
} from "../utils/tasks-test-helpers.js";

describe("Task Extended Features", { timeout: 30000 }, () => {
  afterAll(() => globalTestCleanup());

  // -----------------------------------------------------------------
  // Due Date Functionality
  // -----------------------------------------------------------------
  describe("Due Date Functionality", () => {
    let taskId: string | null = null;

    it("should create a task with dueAt", async () => {
      const dueAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const response = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Due Date Test Task",
          dueAt,
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      taskId = data.id;

      expect(data.dueAt).not.toBeNull();
      const timeDiff = Math.abs(
        new Date(data.dueAt!).getTime() - new Date(dueAt).getTime(),
      );
      expect(timeDiff).toBeLessThan(1000);
    });

    it("should update dueAt to a new date via PATCH", async () => {
      expect(taskId).not.toBeNull();

      const newDueAt = new Date(
        Date.now() + 14 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ dueAt: newDueAt }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.dueAt).not.toBeNull();
      const timeDiff = Math.abs(
        new Date(data.dueAt!).getTime() - new Date(newDueAt).getTime(),
      );
      expect(timeDiff).toBeLessThan(1000);
    });

    it("should clear dueAt by patching to null", async () => {
      expect(taskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ dueAt: null }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.dueAt).toBeNull();
    });

    it("should filter tasks by due date range", async () => {
      expect(taskId).not.toBeNull();

      // Re-set a dueAt so the task shows up in range queries
      const testDueAt = new Date(
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ dueAt: testDueAt }),
      });

      const dueDateStart = new Date().toISOString().split("T")[0];
      const dueDateEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split("T")[0];

      const response = await loggedFetch(
        `/tasks?dueDateStart=${dueDateStart}&dueDateEnd=${dueDateEnd}`,
        { method: "GET" },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;
      const found = data.items.find((t) => t.id === taskId);
      expect(found).toBeDefined();
    });

    afterAll(async () => {
      if (taskId) {
        await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
      }
    });
  });

  // -----------------------------------------------------------------
  // CompletedAt Auto-Setting
  // -----------------------------------------------------------------
  describe("CompletedAt Auto-Setting", () => {
    let taskId: string | null = null;

    it("should auto-set completedAt when taskStatus changes to completed", async () => {
      // Create a task in "open" status
      const createResp = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "CompletedAt Auto-Set Test",
          taskStatus: "open",
        }),
      });
      expect(createResp.status).toBe(201);
      const created = (await createResp.json()) as TaskEntry;
      taskId = created.id;
      expect(created.completedAt).toBeNull();

      // PATCH to "completed"
      const beforeUpdate = new Date();
      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ taskStatus: "completed" }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.taskStatus).toBe("completed");
      expect(data.completedAt).not.toBeNull();

      const completedAtDate = new Date(data.completedAt!);
      const timeDiff = Math.abs(
        completedAtDate.getTime() - beforeUpdate.getTime(),
      );
      expect(timeDiff).toBeLessThan(5000);
    });

    it("should clear completedAt when taskStatus changes back to open", async () => {
      expect(taskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ taskStatus: "open" }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.taskStatus).toBe("open");
      expect(data.completedAt).toBeNull();
    });

    afterAll(async () => {
      if (taskId) {
        await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
      }
    });
  });

  // -----------------------------------------------------------------
  // Tag Operations
  // -----------------------------------------------------------------
  describe("Tag Operations", () => {
    let taskId: string | null = null;

    it("should create a task with tags", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Tag Test Task",
          tags: ["tag1", "tag2"],
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      taskId = data.id;

      expect(data.tags).toEqual(expect.arrayContaining(["tag1", "tag2"]));
      expect(data.tags).toHaveLength(2);
    });

    it("should update tags via PATCH", async () => {
      expect(taskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ tags: ["tag3"] }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.tags).toEqual(["tag3"]);
    });

    it("should clear tags by patching to empty array", async () => {
      expect(taskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ tags: [] }),
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.tags).toEqual([]);
    });

    afterAll(async () => {
      if (taskId) {
        await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
      }
    });
  });

  // -----------------------------------------------------------------
  // Processing
  // -----------------------------------------------------------------
  describe("Processing", () => {
    let enabledTaskId: string | null = null;
    let disabledTaskId: string | null = null;

    it("should set processingStatus to pending when processingEnabled is true", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Processing Enabled Task",
          processingEnabled: true,
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      enabledTaskId = data.id;

      expect(data.processingEnabled).toBe(true);
      expect(data.processingStatus).toBe("pending");
    });

    it("should set processingStatus to null when processingEnabled is false", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: "Processing Disabled Task",
          processingEnabled: false,
        }),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      disabledTaskId = data.id;

      expect(data.processingEnabled).toBe(false);
      expect(data.processingStatus ?? null).toBeNull();
    });

    it("POST /tasks/:id/reprocess should return 200-level status", async () => {
      expect(enabledTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${enabledTaskId}/reprocess`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      // The reprocess endpoint returns 202 on success
      expect([200, 202]).toContain(response.status);
    });

    afterAll(async () => {
      const ids = [enabledTaskId, disabledTaskId].filter(Boolean);
      for (const id of ids) {
        await loggedFetch(`/tasks/${id}`, { method: "DELETE" });
      }
    });
  });

  // -----------------------------------------------------------------
  // Extended Search & Filtering
  // -----------------------------------------------------------------
  describe("Extended Search & Filtering", () => {
    const taskIds: string[] = [];
    const uniquePrefix = `xsearch_${Date.now()}`;

    it("should set up diverse test data", async () => {
      const tasks = [
        {
          title: `${uniquePrefix} Alpha`,
          description: "Frontend development task",
          taskStatus: "open" as const,
          tags: ["frontend", "urgent"],
        },
        {
          title: `${uniquePrefix} Beta`,
          description: "Backend API work",
          taskStatus: "in_progress" as const,
          tags: ["backend", "urgent"],
        },
        {
          title: `${uniquePrefix} Gamma`,
          description: "Documentation update",
          taskStatus: "completed" as const,
          tags: ["docs"],
        },
      ];

      for (const taskData of tasks) {
        const response = await loggedFetch("/tasks", {
          method: "POST",
          body: JSON.stringify(taskData),
        });
        expect(response.status).toBe(201);
        const data = (await response.json()) as TaskEntry;
        taskIds.push(data.id);
      }

      expect(taskIds).toHaveLength(3);
    });

    it("should search tasks by text", async () => {
      const response = await loggedFetch(
        `/tasks?text=${encodeURIComponent(uniquePrefix)}`,
        { method: "GET" },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;
      expect(data.items.length).toBeGreaterThanOrEqual(3);
    });

    it("should filter tasks by taskStatus", async () => {
      const response = await loggedFetch(
        `/tasks?text=${encodeURIComponent(uniquePrefix)}&taskStatus=open`,
        { method: "GET" },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;

      const matching = data.items.filter((t) => t.title.includes(uniquePrefix));
      expect(matching.length).toBe(1);
      expect(matching[0]?.taskStatus).toBe("open");
    });

    it("should combine text and taskStatus filters", async () => {
      const response = await loggedFetch(
        `/tasks?text=${encodeURIComponent(uniquePrefix)}&taskStatus=in_progress`,
        { method: "GET" },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;

      const matching = data.items.filter((t) => t.title.includes(uniquePrefix));
      expect(matching.length).toBe(1);
      expect(matching[0]?.taskStatus).toBe("in_progress");
    });

    it("should filter tasks by tags", async () => {
      const response = await loggedFetch(
        `/tasks?text=${encodeURIComponent(uniquePrefix)}&tags=urgent`,
        { method: "GET" },
      );

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;

      const matching = data.items.filter((t) => t.title.includes(uniquePrefix));
      expect(matching.length).toBe(2);
      for (const task of matching) {
        expect(task.tags).toContain("urgent");
      }
    });

    afterAll(async () => {
      for (const id of taskIds) {
        await loggedFetch(`/tasks/${id}`, { method: "DELETE" });
      }
    });
  });
});
