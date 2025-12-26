import { afterAll, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  type TaskDeleteResponse,
  type TaskEntry,
  TaskSearchResponse,
} from "../utils/tasks-test-helpers.js";
import { BASE_URL, delay, TEST_API_KEY } from "../utils/test-helpers.js";

describe("Task CRUD Operations", { timeout: 30000 }, () => {
  let createdTaskId: string | null = null;
  const searchTaskId: string | null = null;

  const initialTaskData = {
    title: "Test Task",
    description: "This is a test task description.",
    status: "not-started", // Changed from "pending" to valid enum value
    dueDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  };

  const updatedTaskData = {
    title: "Updated Test Task",
    description: "This is the updated task description.",
    status: "in-progress",
    dueDate: new Date(Date.now() + 172800000).toISOString(), // Day after tomorrow
  };

  // Global cleanup after all tests complete
  afterAll(async () => {
    await globalTestCleanup();
  });

  describe("Basic CRUD Operations", () => {
    it("POST /api/tasks - should create a new task", async () => {
      await delay(200);
      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(initialTaskData),
      });

      // The API now correctly returns 201 for creation
      expect(response.status).toBe(201);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBeTypeOf("string");
      expect(data.title).toBe(initialTaskData.title);
      expect(data.description).toBe(initialTaskData.description);
      expect(data.status).toBe(initialTaskData.status);

      // Validate dates in ISO format
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      expect(Date.parse(data.createdAt)).not.toBeNaN();
      expect(Date.parse(data.updatedAt)).not.toBeNaN();

      // Validate schema-defined fields
      expect(data.enabled).toBe(true);
      expect(data.tags).toEqual([]);
      expect(data.reviewStatus).toBe("pending");
      expect(data.isPinned).toBe(false);
      expect(data.comments).toEqual([]);

      // Validate ISO date format for dueDate
      if (data.dueDate) {
        expect(Date.parse(data.dueDate)).not.toBeNaN();
      }

      // Store ID for subsequent tests
      createdTaskId = data.id;
      expect(createdTaskId).not.toBeNull();
    });

    it("GET /api/tasks/:id - should retrieve the created task", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks/${createdTaskId}`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.title).toBe(initialTaskData.title);
      expect(data.description).toBe(initialTaskData.description);
      expect(data.status).toBe(initialTaskData.status);

      // Validate date information
      expect(data.createdAt).toBeDefined();
      expect(data.updatedAt).toBeDefined();
      if (data.dueDate) {
        expect(Date.parse(data.dueDate)).not.toBeNaN();
      }

      // Validate comments field
      expect(data.comments).toBeDefined();
      expect(Array.isArray(data.comments)).toBe(true);
    });

    it("GET /api/tasks - should list tasks including the new one", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry[];

      expect(data).toBeInstanceOf(Array);
      expect(data.length).toBeGreaterThan(0);

      const found = data.find((t) => t.id === createdTaskId);
      expect(
        found,
        `Task with ID ${createdTaskId} not found in the list`,
      ).toBeDefined();
      expect(found?.title).toBe(initialTaskData.title);
      expect(found?.status).toBe(initialTaskData.status);
    });

    it("PUT /api/tasks/:id - should update the task", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks/${createdTaskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updatedTaskData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.title).toBe(updatedTaskData.title);
      expect(data.description).toBe(updatedTaskData.description);
      expect(data.status).toBe(updatedTaskData.status);
    });

    it("GET /api/tasks/:id - should retrieve the updated task", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks/${createdTaskId}`, {
        method: "GET",
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.title).toBe(updatedTaskData.title);
      expect(data.description).toBe(updatedTaskData.description);
      expect(data.status).toBe(updatedTaskData.status);
    });
  });

  describe("Specialized Updates", () => {
    it("PATCH /api/tasks/:id - should partially update the task", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const partialUpdateData = {
        title: "Partially Updated Task",
        isPinned: true,
      };

      const response = await loggedFetch(`/tasks/${createdTaskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(partialUpdateData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.title).toBe(partialUpdateData.title);
      expect(data.isPinned).toBe(true);
      // Other fields should remain unchanged
      expect(data.description).toBe(updatedTaskData.description);
      expect(data.status).toBe(updatedTaskData.status);
    });

    it("PATCH /api/tasks/:id/review - should update task review status", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const reviewUpdateData = {
        reviewStatus: "accepted" as const,
      };

      const response = await loggedFetch(`/tasks/${createdTaskId}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reviewUpdateData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.reviewStatus).toBe("accepted");
      // Other fields should remain unchanged
      expect(data.title).toBe("Partially Updated Task");
      expect(data.isPinned).toBe(true);
    });

    it("PATCH /api/tasks/:id/flag - should update task flag color", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const flagUpdateData = {
        flagColor: "red" as const,
      };

      const response = await loggedFetch(`/tasks/${createdTaskId}/flag`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(flagUpdateData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.flagColor).toBe("red");
      // Other fields should remain unchanged
      expect(data.title).toBe("Partially Updated Task");
      expect(data.isPinned).toBe(true);
      expect(data.reviewStatus).toBe("accepted");
    });

    it("PATCH /api/tasks/:id/pin - should update task pin status", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const pinUpdateData = {
        isPinned: false,
      };

      const response = await loggedFetch(`/tasks/${createdTaskId}/pin`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(pinUpdateData),
      });

      expect(response.status).toBe(200);

      const data = (await response.json()) as TaskEntry;

      expect(data).toBeDefined();
      expect(data.id).toBe(createdTaskId);
      expect(data.isPinned).toBe(false);
      // Other fields should remain unchanged
      expect(data.title).toBe("Partially Updated Task");
      expect(data.flagColor).toBe("red");
      expect(data.reviewStatus).toBe("accepted");
    });
  });

  describe("Task Deletion", () => {
    it("DELETE /api/tasks/:id - should delete the task", async () => {
      expect(
        createdTaskId,
        "Test setup failed: createdTaskId is null",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks/${createdTaskId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(204);
    });

    it("GET /api/tasks/:id - should return 404 for the deleted task", async () => {
      expect(
        createdTaskId,
        "Test cleanup check requires createdTaskId",
      ).not.toBeNull();

      // Use standard fetch directly for this test case
      const response = await fetch(
        `${BASE_URL}/tasks/${createdTaskId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${TEST_API_KEY}`,
          },
        },
      );

      expect(response.status).toBe(404); // Expect Not Found
    });

    it("GET /api/tasks - should not list the deleted task", async () => {
      expect(
        createdTaskId,
        "Test cleanup check requires createdTaskId",
      ).not.toBeNull();

      const response = await loggedFetch(`/tasks`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const data = (await response.json()) as TaskEntry[];

      expect(data).toBeInstanceOf(Array);
      const found = data.find((t) => t.id === createdTaskId);
      expect(
        found,
        `Deleted task with ID ${createdTaskId} still found in the list`,
      ).toBeUndefined();

      // Reset for safety if other describe blocks run
      createdTaskId = null;
    });
  });

  describe("Validation and Error Scenarios", () => {
    it("POST /api/tasks - should reject invalid task data", async () => {
      const invalidTaskData = {
        title: "", // Empty title should fail
        status: "invalid-status", // Invalid status should fail
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invalidTaskData),
      });

      expect(response.status).toBe(400); // Bad Request
    });

    it("GET /api/tasks/:id - should return 404 for non-existent task", async () => {
      const nonExistentId = "non-existent-id";

      const response = await loggedFetch(`/tasks/${nonExistentId}`, {
        method: "GET",
      });

      expect(response.status).toBe(404); // Not Found
    });

    it("PUT /api/tasks/:id - should return 404 for non-existent task", async () => {
      const nonExistentId = "non-existent-id";

      const response = await loggedFetch(`/tasks/${nonExistentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Updated Task" }),
      });

      expect(response.status).toBe(404); // Not Found
    });

    it("PATCH /api/tasks/:id/review - should reject invalid review status", async () => {
      // First create a task to test with
      const taskResponse = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Task for Validation" }),
      });

      expect(taskResponse.status).toBe(201);
      const task = (await taskResponse.json()) as TaskEntry;

      // Now try to update with invalid review status
      const invalidReviewData = {
        reviewStatus: "invalid-status",
      };

      const response = await loggedFetch(`/tasks/${task.id}/review`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invalidReviewData),
      });

      expect(response.status).toBe(400); // Bad Request

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
    });

    it("PATCH /api/tasks/:id/flag - should reject invalid flag color", async () => {
      // First create a task to test with
      const taskResponse = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Task for Flag Validation" }),
      });

      expect(taskResponse.status).toBe(201);
      const task = (await taskResponse.json()) as TaskEntry;

      // Now try to update with invalid flag color
      const invalidFlagData = {
        flagColor: "invalid-color",
      };

      const response = await loggedFetch(`/tasks/${task.id}/flag`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invalidFlagData),
      });

      expect(response.status).toBe(400); // Bad Request

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
    });

    it("GET /api/tasks - should handle invalid limit parameter", async () => {
      const response = await loggedFetch(`/tasks?limit=-1`, {
        method: "GET",
      });

      expect(response.status).toBe(400); // Bad Request - limit should be max 100
    });

    it("GET /api/tasks - should handle invalid status filter", async () => {
      const response = await loggedFetch(`/tasks?status=invalid-status`, {
        method: "GET",
      });

      expect(response.status).toBe(400); // Bad Request
    });
  });
});
