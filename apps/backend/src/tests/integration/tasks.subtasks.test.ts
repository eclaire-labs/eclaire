import { afterAll, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  loggedFetch2,
  type TaskEntry,
  type TaskListResponse,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Sub-task Operations", { timeout: 30000 }, () => {
  let parentTaskId: string;
  let subTaskId: string;
  let standaloneTaskId: string;

  afterAll(async () => {
    await globalTestCleanup();
  });

  // ---------------------------------------------------------------------------
  // Setup: create a parent task
  // ---------------------------------------------------------------------------

  describe("Creating sub-tasks", () => {
    it("should create a parent task first", async () => {
      await delay(200);
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Parent Task" }),
      });
      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      parentTaskId = data.id;
      expect(data.parentId).toBeNull();
      expect(data.childCount).toBe(0);
    });

    it("POST with valid parentId should create a sub-task", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Sub-task 1",
          parentId: parentTaskId,
        }),
      });
      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      subTaskId = data.id;
      expect(data.parentId).toBe(parentTaskId);
    });

    it("POST without parentId should create a top-level task", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Standalone Task" }),
      });
      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      standaloneTaskId = data.id;
      expect(data.parentId).toBeNull();
    });

    it("POST with parentId of non-existent task should return 400", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Orphan",
          parentId: "tsk_nonexistent",
        }),
      });
      expect(response.status).toBe(400);
    });

    it("POST with parentId of another user's task should return 400", async () => {
      // Create a task as user 2
      const user2Response = await loggedFetch2("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "User 2 Task" }),
      });
      expect(user2Response.status).toBe(201);
      const user2Task = (await user2Response.json()) as TaskEntry;

      // Try to create a sub-task under user 2's task as user 1
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cross-user sub-task",
          parentId: user2Task.id,
        }),
      });
      expect(response.status).toBe(400);
    });

    it("POST with parentId pointing to a sub-task should return 400 (single-level nesting)", async () => {
      const response = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Nested sub-task",
          parentId: subTaskId,
        }),
      });
      expect(response.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Updating parentId
  // ---------------------------------------------------------------------------

  describe("Updating parentId", () => {
    it("PATCH to set parentId on an existing task should succeed", async () => {
      const response = await loggedFetch(`/tasks/${standaloneTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: parentTaskId }),
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.parentId).toBe(parentTaskId);
    });

    it("PATCH to clear parentId (set null) should succeed", async () => {
      const response = await loggedFetch(`/tasks/${standaloneTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: null }),
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.parentId).toBeNull();
    });

    it("PATCH with parentId = own id should return 400", async () => {
      const response = await loggedFetch(`/tasks/${standaloneTaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId: standaloneTaskId }),
      });
      expect(response.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------------------
  // Query filters
  // ---------------------------------------------------------------------------

  describe("Query filters", () => {
    it("GET /api/tasks?parentId=<id> should return only children", async () => {
      const response = await loggedFetch(`/tasks?parentId=${parentTaskId}`, {
        method: "GET",
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;
      expect(data.items.length).toBeGreaterThanOrEqual(1);
      for (const item of data.items) {
        expect(item.parentId).toBe(parentTaskId);
      }
    });

    it("GET /api/tasks?topLevelOnly=true should exclude sub-tasks", async () => {
      const response = await loggedFetch(`/tasks?topLevelOnly=true`, {
        method: "GET",
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;
      for (const item of data.items) {
        expect(item.parentId).toBeNull();
      }
    });

    it("GET /api/tasks (no filter) should return all tasks", async () => {
      const response = await loggedFetch(`/tasks`, { method: "GET" });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;
      // Should include both parent tasks and sub-tasks
      const hasParent = data.items.some((t) => t.parentId !== null);
      const hasTopLevel = data.items.some((t) => t.parentId === null);
      expect(hasParent).toBe(true);
      expect(hasTopLevel).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // childCount
  // ---------------------------------------------------------------------------

  describe("childCount", () => {
    it("GET /api/tasks/:id should include childCount", async () => {
      const response = await loggedFetch(`/tasks/${parentTaskId}`, {
        method: "GET",
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry;
      expect(data.childCount).toBeGreaterThanOrEqual(1);
    });

    it("GET /api/tasks (list) should include childCount on each item", async () => {
      const response = await loggedFetch(`/tasks?topLevelOnly=true`, {
        method: "GET",
      });
      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskListResponse;
      for (const item of data.items) {
        expect(item.childCount).toBeTypeOf("number");
      }
    });

    it("creating a sub-task should increment parent childCount", async () => {
      // Get current childCount
      const beforeResp = await loggedFetch(`/tasks/${parentTaskId}`, {
        method: "GET",
      });
      const before = (await beforeResp.json()) as TaskEntry;
      const countBefore = before.childCount ?? 0;

      // Create another sub-task
      const createResp = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Sub-task for count test",
          parentId: parentTaskId,
        }),
      });
      expect(createResp.status).toBe(201);

      // Check updated childCount
      const afterResp = await loggedFetch(`/tasks/${parentTaskId}`, {
        method: "GET",
      });
      const after = (await afterResp.json()) as TaskEntry;
      expect(after.childCount).toBe(countBefore + 1);
    });
  });

  // ---------------------------------------------------------------------------
  // Cascade delete
  // ---------------------------------------------------------------------------

  describe("Cascade delete", () => {
    it("DELETE parent task should also delete children", async () => {
      // Create a fresh parent with a child for isolation
      const parentResp = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Cascade Parent" }),
      });
      const parent = (await parentResp.json()) as TaskEntry;

      const childResp = await loggedFetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Cascade Child",
          parentId: parent.id,
        }),
      });
      const child = (await childResp.json()) as TaskEntry;

      // Delete parent
      const deleteResp = await loggedFetch(`/tasks/${parent.id}`, {
        method: "DELETE",
      });
      expect(deleteResp.status).toBe(204);

      // Child should also be gone
      const childGetResp = await loggedFetch(`/tasks/${child.id}`, {
        method: "GET",
      });
      expect(childGetResp.status).toBe(404);
    });
  });
});
