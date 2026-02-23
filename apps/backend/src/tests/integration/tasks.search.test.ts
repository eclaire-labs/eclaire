import { afterAll, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  type TaskEntry,
  type TaskSearchResponse,
} from "../utils/tasks-test-helpers.js";

describe("Task Search and Filtering", { timeout: 30000 }, () => {
  let searchTaskId: string | null = null;

  // Global cleanup after all tests complete
  afterAll(async () => {
    await globalTestCleanup();
  });

  describe("Search Operations", () => {
    it("POST /api/tasks - should create a task for search testing", async () => {
      const searchTaskData = {
        title: "Searchable Task",
        description: "This task has unique searchable content.",
        status: "completed",
        tags: ["urgent", "testing"],
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchTaskData),
      });

      expect(response.status).toBe(201);

      const data = (await response.json()) as TaskEntry;
      searchTaskId = data.id;
      expect(data.title).toBe(searchTaskData.title);
      expect(data.tags.sort()).toEqual(searchTaskData.tags.sort());
    });

    it("GET /api/tasks?text=searchable - should search tasks by text", async () => {
      const response = await loggedFetch(`/tasks?text=searchable`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskSearchResponse;

      expect(data.tasks).toBeInstanceOf(Array);
      expect(data.totalCount).toBeTypeOf("number");
      expect(data.limit).toBeTypeOf("number");
      const found = data.tasks.find((t) => t.id === searchTaskId);
      expect(found).toBeDefined();
      expect(found?.title).toContain("Searchable");
    });

    it("GET /api/tasks?tags=urgent - should filter tasks by tags", async () => {
      const response = await loggedFetch(`/tasks?tags=urgent`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskSearchResponse;

      expect(data.tasks).toBeInstanceOf(Array);
      const found = data.tasks.find((t) => t.id === searchTaskId);
      expect(found).toBeDefined();
      expect(found?.tags).toContain("urgent");
    });

    it("GET /api/tasks?status=completed - should filter tasks by status", async () => {
      const response = await loggedFetch(`/tasks?status=completed`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskSearchResponse;

      expect(data.tasks).toBeInstanceOf(Array);
      const found = data.tasks.find((t) => t.id === searchTaskId);
      expect(found).toBeDefined();
      expect(found?.status).toBe("completed");
    });

    it("GET /api/tasks?limit=1 - should respect pagination limit", async () => {
      const response = await loggedFetch(`/tasks?limit=1`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskSearchResponse;

      expect(data.tasks).toBeInstanceOf(Array);
      expect(data.tasks.length).toBe(1);
      expect(data.limit).toBe(1);
    });

    it("DELETE /api/tasks/:id - should delete the search task", async () => {
      expect(
        searchTaskId,
        "Test setup failed: searchTaskId is null",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks/${searchTaskId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(204);
    });
  });
});
