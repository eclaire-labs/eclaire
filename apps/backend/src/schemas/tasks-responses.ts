// schemas/tasks-responses.ts
import z from "zod/v4";

// Re-export the shared response schemas from @eclaire/api-types
export {
  CommentUserSchema,
  TaskCommentSchema,
  TaskResponseSchema,
  TasksListResponseSchema,
} from "@eclaire/api-types/tasks";

import { TaskCommentSchema, TaskResponseSchema } from "@eclaire/api-types/tasks";

// Array of task comments
export const TaskCommentsListSchema = z.array(TaskCommentSchema).meta({
  ref: "TaskCommentsList",
  description: "Array of task comments",
});

// Created task response (for POST requests) — same fields as TaskResponseSchema
export const CreatedTaskResponseSchema = TaskResponseSchema.meta({
  ref: "CreatedTaskResponse",
});

// Task not found error
export const TaskNotFoundSchema = z
  .object({
    error: z.literal("Task not found").meta({
      description: "Task with the specified ID was not found",
    }),
  })
  .meta({ ref: "TaskNotFound" });

// Comment not found error
export const CommentNotFoundSchema = z
  .object({
    error: z.literal("Comment not found").meta({
      description: "Comment with the specified ID was not found",
    }),
  })
  .meta({ ref: "CommentNotFound" });

