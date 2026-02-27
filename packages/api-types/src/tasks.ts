import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

export const CommentUserSchema = z
  .object({
    id: z.string(),
    displayName: z.string().nullable(),
    userType: z.enum(["user", "assistant", "worker"]),
  })
  .meta({ ref: "CommentUser" });

export const TaskCommentSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    userId: z.string(),
    content: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    user: CommentUserSchema,
  })
  .meta({ ref: "TaskComment" });

export const TaskResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum(["not-started", "in-progress", "completed"]),
    dueDate: z.string().nullable(),
    assignedToId: z.string().nullable(),
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    userId: z.string(),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable(),
    comments: z.array(TaskCommentSchema).optional(),
    // Recurrence
    isRecurring: z.boolean(),
    cronExpression: z.string().nullable(),
    recurrenceEndDate: z.string().nullable(),
    nextRunAt: z.string().nullable(),
    lastRunAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    recurrenceLimit: z.number().nullable(),
    runImmediately: z.boolean(),
    enabled: z.boolean(),
  })
  .meta({ ref: "TaskResponse" });

export const TasksListResponseSchema = paginatedResponseSchema(
  TaskResponseSchema,
  "TasksListResponse",
  "tasks",
);

export type Task = z.infer<typeof TaskResponseSchema>;
export type TaskComment = z.infer<typeof TaskCommentSchema>;
export type TaskStatus = Task["status"];
export type TasksListResponse = z.infer<typeof TasksListResponseSchema>;
