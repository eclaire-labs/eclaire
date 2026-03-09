import { afterAll, describe, expect, it } from "vitest";
import {
  AI_ASSISTANT_USER_ID,
  loggedFetch,
  type TaskEntry,
  type TaskListResponse,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

// ---------------------------------------------------------------------------
// Due Date Functionality
// ---------------------------------------------------------------------------

describe("Tasks — Due Date Functionality", { timeout: 30000 }, () => {
  let dueDateTaskId: string | null = null;

  it("POST /api/tasks — should create a task with due date", async () => {
    await delay(200);

    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "Task with Due Date",
        description: "This task has a due date",
        tags: ["due-date-test"],
        dueDate: dueDate.toISOString(),
      }),
    });

    expect(response.status).toBe(201);

    const data = (await response.json()) as TaskEntry;
    expect(data.dueDate).not.toBeNull();
    const timeDiff = Math.abs(
      new Date(data.dueDate!).getTime() - dueDate.getTime(),
    );
    expect(timeDiff).toBeLessThan(1000); // Within 1 second

    dueDateTaskId = data.id;
  });

  it("PATCH /api/tasks/:id — should update due date", async () => {
    expect(dueDateTaskId).not.toBeNull();

    const newDueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 14 days

    const response = await loggedFetch(`/tasks/${dueDateTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: newDueDate.toISOString() }),
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as TaskEntry;
    expect(data.dueDate).not.toBeNull();
    const timeDiff = Math.abs(
      new Date(data.dueDate!).getTime() - newDueDate.getTime(),
    );
    expect(timeDiff).toBeLessThan(1000);
  });

  it("PATCH /api/tasks/:id — should clear due date with null", async () => {
    expect(dueDateTaskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${dueDateTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: null }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.dueDate).toBeNull();
  });

  it("GET /api/tasks — should filter tasks by due date range", async () => {
    // Re-set a due date for range searching
    const testDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await loggedFetch(`/tasks/${dueDateTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate: testDueDate.toISOString() }),
    });

    const startDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const endDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const response = await loggedFetch(
      `/tasks?dueDateStart=${startDate}&dueDateEnd=${endDate}`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);

    const data = (await response.json()) as TaskListResponse;
    const found = data.items.find((t) => t.id === dueDateTaskId);
    expect(found).toBeDefined();
  });

  afterAll(async () => {
    if (dueDateTaskId) {
      await loggedFetch(`/tasks/${dueDateTaskId}`, { method: "DELETE" });
    }
  });
});

// ---------------------------------------------------------------------------
// CompletedAt Auto-Setting
// ---------------------------------------------------------------------------

describe("Tasks — CompletedAt Auto-Setting", { timeout: 30000 }, () => {
  let taskId: string | null = null;

  it("POST /api/tasks — should not set completedAt for non-completed status", async () => {
    await delay(200);

    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "CompletedAt Test Task",
        status: "not-started",
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as TaskEntry;
    taskId = data.id;

    // completedAt may not be in the response for non-completed tasks
    // or it should be null
    expect((data as any).completedAt ?? null).toBeNull();
  });

  it("PATCH /api/tasks/:id — should auto-set completedAt when status changes to completed", async () => {
    expect(taskId).not.toBeNull();

    const beforeUpdate = new Date();
    const response = await loggedFetch(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.status).toBe("completed");

    // completedAt should be set to approximately now
    const completedAt = (data as any).completedAt;
    expect(completedAt).not.toBeNull();
    if (completedAt) {
      const completedAtDate = new Date(completedAt);
      const timeDiff = Math.abs(completedAtDate.getTime() - beforeUpdate.getTime());
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
    }
  });

  it("PATCH /api/tasks/:id — should clear completedAt when status changes away from completed", async () => {
    expect(taskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "in-progress" }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.status).toBe("in-progress");

    // completedAt should be cleared
    expect((data as any).completedAt ?? null).toBeNull();
  });

  afterAll(async () => {
    if (taskId) {
      await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
    }
  });
});

// ---------------------------------------------------------------------------
// Tag Operations
// ---------------------------------------------------------------------------

describe("Tasks — Tag Operations", { timeout: 30000 }, () => {
  let tagTaskId: string | null = null;

  it("POST /api/tasks — should create a task with tags", async () => {
    await delay(200);

    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "Task with Tags",
        tags: ["feature", "backend", "priority-high"],
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as TaskEntry;
    tagTaskId = data.id;

    expect(data.tags).toEqual(
      expect.arrayContaining(["feature", "backend", "priority-high"]),
    );
    expect(data.tags).toHaveLength(3);
  });

  it("PATCH /api/tasks/:id — should update tags", async () => {
    expect(tagTaskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${tagTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ tags: ["feature", "updated"] }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.tags).toEqual(expect.arrayContaining(["feature", "updated"]));
    expect(data.tags).toHaveLength(2);
  });

  it("PATCH /api/tasks/:id — should clear tags with empty array", async () => {
    expect(tagTaskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${tagTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ tags: [] }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.tags).toEqual([]);
  });

  afterAll(async () => {
    if (tagTaskId) {
      await loggedFetch(`/tasks/${tagTaskId}`, { method: "DELETE" });
    }
  });
});

// ---------------------------------------------------------------------------
// Enabled Field
// ---------------------------------------------------------------------------

describe("Tasks — Enabled Field", { timeout: 30000 }, () => {
  let enabledTaskId: string | null = null;

  it("POST /api/tasks — should default enabled to true", async () => {
    await delay(200);

    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({ title: "Enabled Test Task" }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as TaskEntry;
    enabledTaskId = data.id;

    expect(data.processingEnabled).toBe(true);
  });

  it("PATCH /api/tasks/:id — should toggle processingEnabled to false", async () => {
    expect(enabledTaskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${enabledTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ processingEnabled: false }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.processingEnabled).toBe(false);
  });

  it("PATCH /api/tasks/:id — should toggle processingEnabled back to true", async () => {
    expect(enabledTaskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${enabledTaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ processingEnabled: true }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskEntry;
    expect(data.processingEnabled).toBe(true);
  });

  afterAll(async () => {
    if (enabledTaskId) {
      await loggedFetch(`/tasks/${enabledTaskId}`, { method: "DELETE" });
    }
  });
});

// ---------------------------------------------------------------------------
// Additional Error Scenarios
// ---------------------------------------------------------------------------

describe("Tasks — Additional Error Scenarios", { timeout: 30000 }, () => {
  it("PATCH /api/tasks/:id — should return error for non-existent task", async () => {
    const response = await loggedFetch(`/tasks/non-existent-id`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Ghost" }),
    });

    expect([404, 500]).toContain(response.status);
  });

  it("DELETE /api/tasks/:id — should return error for non-existent task", async () => {
    const response = await loggedFetch(`/tasks/non-existent-id`, {
      method: "DELETE",
    });

    expect([404, 500]).toContain(response.status);
  });

  it("POST /api/tasks — should reject task with missing title", async () => {
    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({ description: "No title provided" }),
    });

    expect(response.status).toBe(400);
  });

  it("PATCH /api/tasks/:id/review — should return 404 for non-existent task", async () => {
    const response = await loggedFetch(`/tasks/non-existent-id/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus: "accepted" }),
    });

    expect(response.status).toBe(404);
  });

  it("PATCH /api/tasks/:id/flag — should return 404 for non-existent task", async () => {
    const response = await loggedFetch(`/tasks/non-existent-id/flag`, {
      method: "PATCH",
      body: JSON.stringify({ flagColor: "red" }),
    });

    expect(response.status).toBe(404);
  });

  it("PATCH /api/tasks/:id/pin — should return 404 for non-existent task", async () => {
    const response = await loggedFetch(`/tasks/non-existent-id/pin`, {
      method: "PATCH",
      body: JSON.stringify({ isPinned: true }),
    });

    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Extended Search and Filtering
// ---------------------------------------------------------------------------

describe("Tasks — Extended Search and Filtering", { timeout: 30000 }, () => {
  const testTaskIds: string[] = [];

  // Create diverse test data
  it("should set up search test data", async () => {
    await delay(200);

    const tasks = [
      {
        title: "Extended Search Alpha",
        description: "Frontend development task",
        status: "not-started" as const,
        tags: ["frontend", "urgent"],
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Extended Search Beta",
        description: "Backend API work",
        status: "in-progress" as const,
        tags: ["backend", "urgent"],
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        title: "Extended Search Gamma",
        description: "Documentation update",
        status: "completed" as const,
        tags: ["docs"],
      },
    ];

    for (const taskData of tasks) {
      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        body: JSON.stringify(taskData),
      });
      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      testTaskIds.push(data.id);
    }

    expect(testTaskIds).toHaveLength(3);
  });

  it("GET /api/tasks — should support combined text + status filter", async () => {
    const response = await loggedFetch(
      `/tasks?text=Extended+Search&status=in-progress`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskListResponse;

    // Should only find the "in-progress" task
    const matchingTasks = data.items.filter((t) =>
      t.title.includes("Extended Search"),
    );
    expect(matchingTasks.length).toBe(1);
    expect(matchingTasks[0]?.status).toBe("in-progress");
  });

  it("GET /api/tasks — should support combined text + tags filter", async () => {
    const response = await loggedFetch(
      `/tasks?text=Extended+Search&tags=urgent`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskListResponse;

    // Should find both urgent tasks
    const matchingTasks = data.items.filter((t) =>
      t.title.includes("Extended Search"),
    );
    expect(matchingTasks.length).toBe(2);
    for (const task of matchingTasks) {
      expect(task.tags).toContain("urgent");
    }
  });

  it("GET /api/tasks — should return empty results for non-matching search", async () => {
    const response = await loggedFetch(
      `/tasks?text=zzz_nonexistent_query_zzz`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskListResponse;

    expect(data.items).toHaveLength(0);
    expect(data.totalCount).toBe(0);
  });

  it("GET /api/tasks — should filter by due date range", async () => {
    const startDate = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    const endDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    const response = await loggedFetch(
      `/tasks?dueDateStart=${startDate}&dueDateEnd=${endDate}`,
      { method: "GET" },
    );

    expect(response.status).toBe(200);
    const data = (await response.json()) as TaskListResponse;

    // Should find the "Alpha" task (3 days out) but not "Beta" (7 days out)
    const matchingTasks = data.items.filter((t) =>
      t.title.includes("Extended Search"),
    );
    expect(matchingTasks.length).toBeGreaterThanOrEqual(1);
    // All returned tasks should have due dates in range
    for (const task of matchingTasks) {
      if (task.dueDate) {
        const dueDate = new Date(task.dueDate);
        expect(dueDate.getTime()).toBeGreaterThanOrEqual(
          new Date(startDate!).getTime(),
        );
      }
    }
  });

  afterAll(async () => {
    for (const id of testTaskIds) {
      await loggedFetch(`/tasks/${id}`, { method: "DELETE" });
    }
  });
});

// ---------------------------------------------------------------------------
// Task-Specific Endpoints (execution-tracking, assistant-status, reprocess)
// ---------------------------------------------------------------------------

describe("Tasks — Execution Tracking Endpoint", { timeout: 30000 }, () => {
  let taskId: string | null = null;

  it("should set up a task for execution tracking", async () => {
    await delay(200);

    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "Execution Tracking Test Task",
        status: "not-started",
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as TaskEntry;
    taskId = data.id;
  });

  it("PUT /api/tasks/:id/execution-tracking — should update lastExecutedAt", async () => {
    expect(taskId).not.toBeNull();

    const now = new Date().toISOString();
    const response = await loggedFetch(`/tasks/${taskId}/execution-tracking`, {
      method: "PUT",
      body: JSON.stringify({ lastExecutedAt: now }),
    });

    expect(response.status).toBe(200);
  });

  it("PUT /api/tasks/:id/execution-tracking — should return 404 for non-existent task", async () => {
    const response = await loggedFetch(
      `/tasks/non-existent-id/execution-tracking`,
      {
        method: "PUT",
        body: JSON.stringify({ lastExecutedAt: new Date().toISOString() }),
      },
    );

    expect([404, 500]).toContain(response.status);
  });

  afterAll(async () => {
    if (taskId) {
      await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
    }
  });
});

describe("Tasks — Assistant Status Endpoint", { timeout: 30000 }, () => {
  let taskId: string | null = null;

  it("should set up a task assigned to AI assistant", async () => {
    await delay(200);

    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "Assistant Status Test Task",
        status: "not-started",
        assignedToId: AI_ASSISTANT_USER_ID,
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as TaskEntry;
    taskId = data.id;
    expect(data.assignedToId).toBe(AI_ASSISTANT_USER_ID);
  });

  it("PUT /api/tasks/:id/assistant-status — should update task status as assistant", async () => {
    expect(taskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${taskId}/assistant-status`, {
      method: "PUT",
      body: JSON.stringify({
        status: "in-progress",
        assignedAssistantId: AI_ASSISTANT_USER_ID,
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.success).toBe(true);
  });

  it("PUT /api/tasks/:id/assistant-status — should complete task with completedAt", async () => {
    expect(taskId).not.toBeNull();

    const completedAt = new Date().toISOString();
    const response = await loggedFetch(`/tasks/${taskId}/assistant-status`, {
      method: "PUT",
      body: JSON.stringify({
        status: "completed",
        assignedAssistantId: AI_ASSISTANT_USER_ID,
        completedAt,
      }),
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data.success).toBe(true);

    // Verify the task status was updated
    const getResponse = await loggedFetch(`/tasks/${taskId}`, {
      method: "GET",
    });
    expect(getResponse.status).toBe(200);
    const task = (await getResponse.json()) as TaskEntry;
    expect(task.status).toBe("completed");
  });

  afterAll(async () => {
    if (taskId) {
      await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
    }
  });
});

describe("Tasks — Reprocess Endpoint", { timeout: 30000 }, () => {
  let taskId: string | null = null;

  it("should set up a task for reprocessing", async () => {
    await delay(200);

    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "Reprocess Test Task",
        description: "This task should be reprocessable for tag generation",
      }),
    });

    expect(response.status).toBe(201);
    const data = (await response.json()) as TaskEntry;
    taskId = data.id;
  });

  it("POST /api/tasks/:id/reprocess — should queue task for reprocessing", async () => {
    expect(taskId).not.toBeNull();

    const response = await loggedFetch(`/tasks/${taskId}/reprocess`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(202); // Accepted
    const data = (await response.json()) as any;
    expect(data.message).toContain("reprocessing");
    expect(data.taskId).toBe(taskId);
  });

  it("POST /api/tasks/:id/reprocess — should return error for non-existent task", async () => {
    const response = await loggedFetch(`/tasks/non-existent-id/reprocess`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect([400, 404, 500]).toContain(response.status);
  });

  afterAll(async () => {
    if (taskId) {
      await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
    }
  });
});
