import { afterAll, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  type TaskEntry,
  type TaskListResponse,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Task CRUD Operations", { timeout: 30000 }, () => {
  let createdTaskId: string | null = null;

  /** Throws early with a clear message if the create test didn't succeed. */
  const ensureTaskCreated = (): string => {
    if (createdTaskId) return createdTaskId;
    throw new Error(
      "Task was not created in the POST test. Check the POST test for failures.",
    );
  };

  const tomorrow = new Date(Date.now() + 86400000).toISOString();
  const dayAfterTomorrow = new Date(Date.now() + 172800000).toISOString();

  afterAll(async () => {
    await globalTestCleanup();
  });

  // ---------------------------------------------------------------------------
  // Basic CRUD Operations
  // ---------------------------------------------------------------------------
  describe("Basic CRUD Operations", () => {
    it("POST /tasks — should create a new task", async () => {
      await delay(200);

      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test Task",
          description: "This is a test task description.",
          taskStatus: "open",
          dueAt: tomorrow,
        }),
      });

      expect(response.status).toBe(201);

      const data = (await response.json()) as TaskEntry;

      expect(data.id).toBeTypeOf("string");
      expect(data.title).toBe("Test Task");
      expect(data.description).toBe("This is a test task description.");
      expect(data.taskStatus).toBe("open");
      expect(data.delegateMode).toBe("manual");
      expect(data.priority).toBe(0);
      expect(data.tags).toEqual([]);

      // Validate timestamps
      expect(Date.parse(data.createdAt)).not.toBeNaN();
      expect(Date.parse(data.updatedAt)).not.toBeNaN();

      createdTaskId = data.id;
    });

    it("GET /tasks/:id — should retrieve the created task", async () => {
      const taskId = ensureTaskCreated();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data.id).toBe(taskId);
      expect(data.title).toBe("Test Task");
      expect(data.description).toBe("This is a test task description.");
      expect(data.taskStatus).toBe("open");
      expect(data.delegateMode).toBe("manual");
      expect(data.priority).toBe(0);
      expect(data.tags).toEqual([]);
      expect(data.comments).toBeDefined();
      expect(Array.isArray(data.comments)).toBe(true);
    });

    it("GET /tasks — should list tasks including the new one", async () => {
      const taskId = ensureTaskCreated();

      const response = await loggedFetch("/tasks", { method: "GET" });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskListResponse;

      expect(data.items).toBeInstanceOf(Array);
      expect(data.items.length).toBeGreaterThan(0);
      expect(data).toHaveProperty("nextCursor");
      expect(data).toHaveProperty("hasMore");
      expect(typeof data.hasMore).toBe("boolean");

      const found = data.items.find((t) => t.id === taskId);
      expect(found, `Task ${taskId} not found in list`).toBeDefined();
      expect(found?.title).toBe("Test Task");
    });

    it("PUT /tasks/:id — should fully update the task", async () => {
      const taskId = ensureTaskCreated();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Updated",
          description: "Updated desc",
          taskStatus: "in_progress",
          dueAt: dayAfterTomorrow,
        }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data.id).toBe(taskId);
      expect(data.title).toBe("Updated");
      expect(data.description).toBe("Updated desc");
      expect(data.taskStatus).toBe("in_progress");
      if (data.dueAt) {
        expect(Date.parse(data.dueAt)).not.toBeNaN();
      }
    });

    it("PATCH /tasks/:id — should partially update the task", async () => {
      const taskId = ensureTaskCreated();

      const response = await loggedFetch(`/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: 2 }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data.id).toBe(taskId);
      expect(data.priority).toBe(2);
      // Other fields should remain unchanged from the PUT
      expect(data.title).toBe("Updated");
      expect(data.description).toBe("Updated desc");
      expect(data.taskStatus).toBe("in_progress");
    });

    it("DELETE /tasks/:id — should delete the task, then GET returns 404", async () => {
      const taskId = ensureTaskCreated();

      const deleteResponse = await loggedFetch(`/tasks/${taskId}`, {
        method: "DELETE",
      });
      expect(deleteResponse.status).toBe(204);

      const getResponse = await loggedFetch(`/tasks/${taskId}`, {
        method: "GET",
      });
      expect(getResponse.status).toBe(404);

      createdTaskId = null;
    });
  });

  // ---------------------------------------------------------------------------
  // Specialized Endpoints
  // ---------------------------------------------------------------------------
  describe("Specialized Endpoints", () => {
    let specialTaskId: string;

    it("setup — create a task for specialized endpoint tests", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Specialized Endpoints Task" }),
      });
      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      specialTaskId = data.id;
    });

    it("PATCH /tasks/:id/review — should update reviewStatus", async () => {
      const response = await loggedFetch(`/tasks/${specialTaskId}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewStatus: "pending" }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;
      expect(data.reviewStatus).toBe("pending");
    });

    it("PATCH /tasks/:id/flag — should update flagColor", async () => {
      const response = await loggedFetch(`/tasks/${specialTaskId}/flag`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagColor: "red" }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;
      expect(data.flagColor).toBe("red");
    });

    it("PATCH /tasks/:id/pin — should update isPinned", async () => {
      const response = await loggedFetch(`/tasks/${specialTaskId}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPinned: true }),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;
      expect(data.isPinned).toBe(true);
    });

    it("teardown — delete the specialized endpoint task", async () => {
      await loggedFetch(`/tasks/${specialTaskId}`, { method: "DELETE" });
    });
  });

  // ---------------------------------------------------------------------------
  // Validation Errors
  // ---------------------------------------------------------------------------
  describe("Validation Errors", () => {
    it("POST /tasks with empty title — should return 400", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "" }),
      });

      expect(response.status).toBe(400);
    });

    it("POST /tasks with invalid taskStatus — should return 400", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Valid Title",
          taskStatus: "invalid-status",
        }),
      });

      expect(response.status).toBe(400);
    });

    it("PATCH /tasks with invalid priority (5) — should return 400", async () => {
      // Create a throwaway task to patch against
      const createResponse = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Priority Validation Task" }),
      });
      expect(createResponse.status).toBe(201);
      const task = (await createResponse.json()) as TaskEntry;

      const response = await loggedFetch(`/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority: 5 }),
      });

      expect(response.status).toBe(400);

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, { method: "DELETE" });
    });

    it("GET /tasks/nonexistent-id — should return 404", async () => {
      const response = await loggedFetch("/tasks/nonexistent-id", {
        method: "GET",
      });

      expect(response.status).toBe(404);
    });

    it("GET /tasks with invalid limit (0) — should return 400", async () => {
      const response = await loggedFetch("/tasks?limit=0", {
        method: "GET",
      });

      expect(response.status).toBe(400);
    });
  });
});
