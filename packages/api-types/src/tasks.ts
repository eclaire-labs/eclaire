import z from "zod/v4";
import { ActorSummarySchema } from "./actors.js";
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
    authorActorId: z.string(),
    content: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    author: ActorSummarySchema,
    user: CommentUserSchema,
  })
  .meta({ ref: "TaskComment" });

export const TaskResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.enum([
      "backlog",
      "open",
      "in-progress",
      "completed",
      "cancelled",
    ]),
    priority: z.number().int().min(0).max(4),
    dueDate: z.string().nullable(),
    assigneeActorId: z.string().nullable(),
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    sortOrder: z.number().nullable(),
    parentId: z.string().nullable(),
    childCount: z.number().int().optional(),
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
    processingEnabled: z.boolean(),
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
