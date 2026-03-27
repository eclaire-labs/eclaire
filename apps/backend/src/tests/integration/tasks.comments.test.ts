import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  globalTestCleanup,
  loggedFetch,
  type TaskComment,
  type TaskEntry,
} from "../utils/tasks-test-helpers.js";

describe("Task Comments", { timeout: 30000 }, () => {
  let taskId: string;

  beforeAll(async () => {
    const res = await loggedFetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Comment Test Task" }),
    });
    expect(res.status).toBe(201);
    const task = (await res.json()) as TaskEntry;
    taskId = task.id;
  });

  afterAll(async () => {
    if (taskId) {
      await loggedFetch(`/tasks/${taskId}`, { method: "DELETE" });
    }
    await globalTestCleanup();
  });

  describe("Comment CRUD", () => {
    let commentId: string;

    it("should create a comment", async () => {
      const res = await loggedFetch(`/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Test comment" }),
      });

      expect(res.status).toBe(201);
      const comment = (await res.json()) as TaskComment;

      expect(comment.id).toBeTypeOf("string");
      expect(comment.taskId).toBe(taskId);
      expect(comment.content).toBe("Test comment");
      expect(comment.authorActorId).toBeTypeOf("string");
      expect(Date.parse(comment.createdAt)).not.toBeNaN();

      commentId = comment.id;
    });

    it("should list comments including the created one", async () => {
      const res = await loggedFetch(`/tasks/${taskId}/comments`);

      expect(res.status).toBe(200);
      const comments = (await res.json()) as TaskComment[];

      expect(Array.isArray(comments)).toBe(true);
      expect(comments.length).toBeGreaterThanOrEqual(1);

      const match = comments.find((c) => c.id === commentId);
      expect(match).toBeDefined();
      expect(match!.content).toBe("Test comment");
    });

    it("should update a comment", async () => {
      const res = await loggedFetch(`/tasks/${taskId}/comments/${commentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Updated comment" }),
      });

      expect(res.status).toBe(200);
      const comment = (await res.json()) as TaskComment;

      expect(comment.id).toBe(commentId);
      expect(comment.content).toBe("Updated comment");
    });

    it("should delete a comment", async () => {
      const res = await loggedFetch(`/tasks/${taskId}/comments/${commentId}`, {
        method: "DELETE",
      });

      expect(res.status).toBe(204);
    });

    it("should no longer return the deleted comment", async () => {
      const res = await loggedFetch(`/tasks/${taskId}/comments`);

      expect(res.status).toBe(200);
      const comments = (await res.json()) as TaskComment[];

      const match = comments.find((c) => c.id === commentId);
      expect(match).toBeUndefined();
    });
  });

  describe("Validation", () => {
    it("should reject a comment with empty content", async () => {
      const res = await loggedFetch(`/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "" }),
      });

      expect(res.status).toBe(400);
    });

    it("should return 404 when posting a comment on a non-existent task", async () => {
      const res = await loggedFetch("/tasks/non-existent-id/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "Orphan comment" }),
      });

      expect(res.status).toBe(404);
    });

    it("should return 404 when updating a non-existent comment", async () => {
      const res = await loggedFetch(
        `/tasks/${taskId}/comments/non-existent-id`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: "Ghost update" }),
        },
      );

      expect(res.status).toBe(404);
    });

    it("should return 404 when deleting a non-existent comment", async () => {
      const res = await loggedFetch(
        `/tasks/${taskId}/comments/non-existent-id`,
        { method: "DELETE" },
      );

      expect(res.status).toBe(404);
    });
  });
});
