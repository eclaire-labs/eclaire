import { afterAll, describe, expect, it } from "vitest";
import {
  AI_ASSISTANT_USER_ID,
  type CommentDeleteResponse,
  globalTestCleanup,
  loggedFetch,
  loggedFetchAsAssistant,
  type TaskComment,
  type TaskDeleteResponse,
  type TaskEntry,
} from "../utils/tasks-test-helpers.js";
import { delay } from "../utils/test-helpers.js";

describe("Task Comments", { timeout: 30000 }, () => {
  let commentTaskId: string | null = null;
  let createdCommentId: string | null = null;

  // Global cleanup after all tests complete
  afterAll(async () => {
    await globalTestCleanup();
  });

  describe("Comment CRUD Operations", () => {
    it("POST /api/tasks - should create a task for comment testing", async () => {
      const commentTaskData = {
        title: "Task for Comment Testing",
        description: "This task will be used to test comment functionality.",
        status: "not-started",
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commentTaskData),
      });

      expect(response.status).toBe(201);
      const data = (await response.json()) as TaskEntry;
      commentTaskId = data.id;

      // Verify comments field is initialized as empty array
      expect(data.comments).toEqual([]);
      expect(data.title).toBe(commentTaskData.title);
    });

    it("GET /api/tasks/:id/comments - should return empty comments for new task", async () => {
      expect(commentTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${commentTaskId}/comments`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const comments = (await response.json()) as TaskComment[];
      expect(comments).toEqual([]);
    });

    it("POST /api/tasks/:id/comments - should create a new comment", async () => {
      expect(commentTaskId).not.toBeNull();

      const commentData = {
        content: "This is a test comment for the task.",
      };

      const response = await loggedFetch(`/tasks/${commentTaskId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(commentData),
      });

      expect(response.status).toBe(201);
      const comment = (await response.json()) as TaskComment;

      expect(comment.id).toBeTypeOf("string");
      expect(comment.taskId).toBe(commentTaskId);
      expect(comment.content).toBe(commentData.content);
      expect(comment.user).toBeDefined();
      expect(comment.user.userType).toBe("user");
      expect(Date.parse(comment.createdAt)).not.toBeNaN();
      expect(Date.parse(comment.updatedAt)).not.toBeNaN();

      createdCommentId = comment.id;
    });

    it("GET /api/tasks/:id/comments - should return the created comment", async () => {
      expect(commentTaskId).not.toBeNull();
      expect(createdCommentId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${commentTaskId}/comments`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const comments = (await response.json()) as TaskComment[];

      expect(comments).toHaveLength(1);
      const comment = comments[0];
      expect(comment).toBeDefined();
      expect(comment!.id).toBe(createdCommentId);
      expect(comment!.content).toBe("This is a test comment for the task.");
      expect(comment!.user.userType).toBe("user");
    });

    it("GET /api/tasks/:id - should include comments in task response", async () => {
      expect(commentTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${commentTaskId}`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const task = (await response.json()) as TaskEntry;

      expect(task.comments).toHaveLength(1);
      expect(task.comments![0]).toBeDefined();
      expect(task.comments![0]!.id).toBe(createdCommentId);
      expect(task.comments![0]!.content).toBe(
        "This is a test comment for the task.",
      );
    });

    it("PUT /api/tasks/:taskId/comments/:commentId - should update the comment", async () => {
      expect(commentTaskId).not.toBeNull();
      expect(createdCommentId).not.toBeNull();

      const updatedCommentData = {
        content: "This is an updated test comment.",
      };

      const response = await loggedFetch(
        `/tasks/${commentTaskId}/comments/${createdCommentId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedCommentData),
        },
      );

      expect(response.status).toBe(200);
      const comment = (await response.json()) as TaskComment;

      expect(comment.id).toBe(createdCommentId);
      expect(comment.content).toBe(updatedCommentData.content);
      expect(comment.user.userType).toBe("user");
    });

    it("DELETE /api/tasks/:taskId/comments/:commentId - should delete the comment", async () => {
      expect(commentTaskId).not.toBeNull();
      expect(createdCommentId).not.toBeNull();

      const response = await loggedFetch(
        `/tasks/${commentTaskId}/comments/${createdCommentId}`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(204);
    });
  });

  describe("AI Assistant Comments", () => {
    it("POST /api/tasks/:id/comments - AI assistant should create a comment", async () => {
      expect(commentTaskId).not.toBeNull();

      const aiCommentData = {
        content: "This comment is from the AI assistant.",
      };

      const response = await loggedFetchAsAssistant(
        `/tasks/${commentTaskId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(aiCommentData),
        },
      );

      expect(response.status).toBe(201);
      const comment = (await response.json()) as TaskComment;

      expect(comment.content).toBe(aiCommentData.content);
      expect(comment.user.userType).toBe("assistant");
      expect(comment.user.id).toBe(AI_ASSISTANT_USER_ID);
    });

    it("GET /api/tasks/:id/comments - should return multiple comments in correct order", async () => {
      expect(commentTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${commentTaskId}/comments`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const comments = (await response.json()) as TaskComment[];

      expect(comments).toHaveLength(1);
      // Only AI assistant comment should remain (user comment was deleted)
      expect(comments[0]).toBeDefined();
      expect(comments[0]!.user.userType).toBe("assistant");
    });

    it("GET /api/tasks/:id/comments - should not include deleted comment", async () => {
      expect(commentTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${commentTaskId}/comments`, {
        method: "GET",
      });

      expect(response.status).toBe(200);
      const comments = (await response.json()) as TaskComment[];

      expect(comments).toHaveLength(1);
      expect(comments[0]).toBeDefined();
      expect(comments[0]!.user.userType).toBe("assistant");
    });
  });

  describe("AI Assistant Task Assignment", () => {
    let assignmentTaskId: string | null = null;

    it("POST /api/tasks - should create task assigned to current user by default", async () => {
      const taskData = {
        title: "Task for Assignment Testing",
        description: "This task will test assignment functionality.",
        status: "not-started",
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(201);
      const task = (await response.json()) as TaskEntry;
      assignmentTaskId = task.id;

      // Task should be assigned to current user by default
      expect(task.assignedToId).not.toBeNull();
      expect(task.assignedToId).not.toBe(AI_ASSISTANT_USER_ID);
    });

    it("PUT /api/tasks/:id - should allow assignment to AI assistant", async () => {
      expect(assignmentTaskId).not.toBeNull();

      const updateData = {
        assignedToId: AI_ASSISTANT_USER_ID,
      };

      const response = await loggedFetch(`/tasks/${assignmentTaskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(200);
      const task = (await response.json()) as TaskEntry;

      expect(task.assignedToId).toBe(AI_ASSISTANT_USER_ID);
    });

    it("POST /api/tasks - should allow explicit assignment to AI assistant during creation", async () => {
      const taskData = {
        title: "Task Assigned to AI Assistant",
        description: "This task is explicitly assigned to AI assistant.",
        status: "not-started",
        assignedToId: AI_ASSISTANT_USER_ID,
      };

      const response = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(taskData),
      });

      expect(response.status).toBe(201);
      const task = (await response.json()) as TaskEntry;

      expect(task.assignedToId).toBe(AI_ASSISTANT_USER_ID);
      expect(task.title).toBe(taskData.title);

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
    });

    it(
      "POST /api/tasks - should create AI assistant task and generate comment",
      { timeout: 65000 },
      async () => {
        const taskData = {
          title: "AI Assistant Comment Test",
          description: "This task should generate an AI assistant comment.",
          status: "not-started",
          assignedToId: AI_ASSISTANT_USER_ID,
        };

        const response = await loggedFetch(`/tasks`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taskData),
        });

        expect(response.status).toBe(201);
        const task = (await response.json()) as TaskEntry;

        expect(task.assignedToId).toBe(AI_ASSISTANT_USER_ID);
        expect(task.title).toBe(taskData.title);

        // Poll for AI assistant comments (indicates task execution occurred)
        let aiCommentCount = 0;
        const maxWaitTime = 60000; // 30 seconds max wait
        const pollInterval = 3000; // Check every 3 seconds
        const startTime = Date.now();

        while (aiCommentCount === 0 && Date.now() - startTime < maxWaitTime) {
          const commentsResponse = await loggedFetch(
            `/tasks/${task.id}/comments`,
            {
              method: "GET",
            },
          );
          expect(commentsResponse.status).toBe(200);
          const comments = (await commentsResponse.json()) as TaskComment[];

          const aiComments = comments.filter(
            (c) => c.user.userType === "assistant",
          );
          aiCommentCount = aiComments.length;

          if (aiCommentCount === 0) {
            await delay(pollInterval);
          }
        }

        // AI assistant should have created at least one comment
        expect(aiCommentCount).toBeGreaterThanOrEqual(1);

        // Clean up
        await loggedFetch(`/tasks/${task.id}`, {
          method: "DELETE",
        });
      },
    );

    it("PUT /api/tasks/:id - should return error for assignment to non-existent user", async () => {
      expect(assignmentTaskId).not.toBeNull();

      const updateData = {
        assignedToId: "non-existent-user-id",
      };

      const response = await loggedFetch(`/tasks/${assignmentTaskId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(updateData),
      });

      expect(response.status).toBe(400);
      const errorResponse = (await response.json()) as any;

      // Should return an error when assigned user doesn't exist
      expect(errorResponse).toHaveProperty("error");
      expect(errorResponse.error).toContain("Invalid user ID");
    });

    it("DELETE /api/tasks/:id - should clean up assignment test task", async () => {
      expect(assignmentTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${assignmentTaskId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(204);
    });
  });

  describe("Comment Validation", () => {
    it("POST /api/tasks/:id/comments - should reject empty comment content", async () => {
      // First create a task to test with
      const taskResponse = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "Test Task for Comment Validation" }),
      });

      expect(taskResponse.status).toBe(201);
      const task = (await taskResponse.json()) as TaskEntry;

      // Try to create comment with empty content
      const invalidCommentData = {
        content: "",
      };

      const response = await loggedFetch(`/tasks/${task.id}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(invalidCommentData),
      });

      expect(response.status).toBe(400); // Bad Request

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
    });

    it("POST /api/tasks/:id/comments - should return 404 for non-existent task", async () => {
      const nonExistentTaskId = "non-existent-task-id";
      const commentData = {
        content: "This comment is for a non-existent task.",
      };

      const response = await loggedFetch(
        `/tasks/${nonExistentTaskId}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(commentData),
        },
      );

      expect(response.status).toBe(404); // Not Found
    });

    it("GET /api/tasks/:id/comments - should return 404 for non-existent task", async () => {
      const nonExistentTaskId = "non-existent-task-id";

      const response = await loggedFetch(
        `/tasks/${nonExistentTaskId}/comments`,
        {
          method: "GET",
        },
      );

      expect(response.status).toBe(404); // Not Found
    });

    it("PUT /api/tasks/:taskId/comments/:commentId - should return 404 for non-existent comment", async () => {
      // First create a task
      const taskResponse = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test Task for Comment Update Validation",
        }),
      });

      expect(taskResponse.status).toBe(201);
      const task = (await taskResponse.json()) as TaskEntry;

      const nonExistentCommentId = "non-existent-comment-id";
      const updateData = {
        content: "Updated content",
      };

      const response = await loggedFetch(
        `/tasks/${task.id}/comments/${nonExistentCommentId}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updateData),
        },
      );

      expect(response.status).toBe(404); // Not Found

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
    });

    it("DELETE /api/tasks/:taskId/comments/:commentId - should return 404 for non-existent comment", async () => {
      // First create a task
      const taskResponse = await loggedFetch(`/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: "Test Task for Comment Delete Validation",
        }),
      });

      expect(taskResponse.status).toBe(201);
      const task = (await taskResponse.json()) as TaskEntry;

      const nonExistentCommentId = "non-existent-comment-id";

      const response = await loggedFetch(
        `/tasks/${task.id}/comments/${nonExistentCommentId}`,
        {
          method: "DELETE",
        },
      );

      expect(response.status).toBe(404); // Not Found

      // Clean up
      await loggedFetch(`/tasks/${task.id}`, {
        method: "DELETE",
      });
    });
  });

  describe("Test Cleanup", () => {
    it("DELETE /api/tasks/:id - should clean up comment test task", async () => {
      expect(commentTaskId).not.toBeNull();

      const response = await loggedFetch(`/tasks/${commentTaskId}`, {
        method: "DELETE",
      });

      expect(response.status).toBe(204);
    });
  });
});
