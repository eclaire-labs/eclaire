import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  loggedFetch,
  loggedFetch2,
  type TaskComment,
  type TaskEntry,
  type TaskListResponse,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

// ---------------------------------------------------------------------------
// Multi-user Isolation
// ---------------------------------------------------------------------------

describe("Tasks — Multi-user Isolation", { timeout: 30000 }, () => {
  let user1TaskId: string | null = null;

  beforeAll(async () => {
    await delay(200);

    // Create a task as user 1
    const response = await loggedFetch(`/tasks`, {
      method: "POST",
      body: JSON.stringify({
        title: "User 1 Private Task",
        description: "This should not be visible to user 2",
        status: "open",
        tags: ["isolation-test"],
      }),
    });

    expect(response.status).toBe(201);
    const task = (await response.json()) as TaskEntry;
    user1TaskId = task.id;

    // Add a comment as user 1
    const commentResponse = await loggedFetch(
      `/tasks/${user1TaskId}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ content: "Private comment from user 1" }),
      },
    );

    expect(commentResponse.status).toBe(201);
    (await commentResponse.json()) as TaskComment;
  });

  it("should not allow user 2 to GET user 1's task", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}`, {
      method: "GET",
    });

    // Should be 404 — user 2 has no access
    expect(response.status).toBe(404);
  });

  it("should not include user 1's task in user 2's list", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks`, {
      method: "GET",
    });
    expect(response.status).toBe(200);

    const data = (await response.json()) as TaskListResponse;
    const found = data.items.find((t) => t.id === user1TaskId);
    expect(found).toBeUndefined();
  });

  it("should not allow user 2 to PUT user 1's task", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}`, {
      method: "PUT",
      body: JSON.stringify({ title: "Hacked Title" }),
    });

    expect([404, 500]).toContain(response.status);
  });

  it("should not allow user 2 to PATCH user 1's task", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}`, {
      method: "PATCH",
      body: JSON.stringify({ title: "Hacked Title" }),
    });

    expect([404, 500]).toContain(response.status);
  });

  it("should not allow user 2 to DELETE user 1's task", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}`, {
      method: "DELETE",
    });

    expect([404, 500]).toContain(response.status);

    // Verify the task still exists for user 1
    const verifyResponse = await loggedFetch(`/tasks/${user1TaskId}`, {
      method: "GET",
    });
    expect(verifyResponse.status).toBe(200);
  });

  it("should not allow user 2 to GET user 1's task comments", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}/comments`, {
      method: "GET",
    });

    expect(response.status).toBe(404);
  });

  it("should not allow user 2 to POST a comment on user 1's task", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content: "Unauthorized comment" }),
    });

    expect(response.status).toBe(404);
  });

  it("should not allow user 2 to update user 1's review status", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}/review`, {
      method: "PATCH",
      body: JSON.stringify({ reviewStatus: "accepted" }),
    });

    expect(response.status).toBe(404);
  });

  it("should not allow user 2 to update user 1's flag", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}/flag`, {
      method: "PATCH",
      body: JSON.stringify({ flagColor: "red" }),
    });

    expect(response.status).toBe(404);
  });

  it("should not allow user 2 to update user 1's pin status", async () => {
    expect(user1TaskId).not.toBeNull();

    const response = await loggedFetch2(`/tasks/${user1TaskId}/pin`, {
      method: "PATCH",
      body: JSON.stringify({ isPinned: true }),
    });

    expect(response.status).toBe(404);
  });

  afterAll(async () => {
    if (user1TaskId) {
      await loggedFetch(`/tasks/${user1TaskId}`, { method: "DELETE" });
    }
  });
});
