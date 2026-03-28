import z from "zod/v4";
import { ActorSummarySchema } from "./actors.js";
import { paginatedResponseSchema } from "./common.js";

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
    userId: z.string(),

    // Content
    title: z.string(),
    description: z.string().nullable(),
    prompt: z.string().nullable(),

    // Assignment
    delegateActorId: z.string().nullable(),
    delegateMode: z.enum(["manual", "assist", "handle"]),
    delegatedByActorId: z.string().nullable(),

    // Status
    taskStatus: z.enum([
      "open",
      "in_progress",
      "blocked",
      "completed",
      "cancelled",
    ]),
    attentionStatus: z.enum([
      "none",
      "needs_triage",
      "awaiting_input",
      "needs_review",
      "failed",
      "urgent",
    ]),
    reviewStatus: z.enum(["none", "pending", "approved", "changes_requested"]),

    // Schedule
    scheduleType: z.enum(["none", "one_time", "recurring"]),
    scheduleRule: z.string().nullable(),
    scheduleSummary: z.string().nullable(),
    timezone: z.string().nullable(),
    nextOccurrenceAt: z.string().nullable(),
    maxOccurrences: z.number().int().nullable(),
    occurrenceCount: z.number().int(),

    // Denormalized latest execution
    latestExecutionStatus: z
      .enum([
        "idle",
        "scheduled",
        "queued",
        "running",
        "awaiting_input",
        "awaiting_review",
        "failed",
        "completed",
        "cancelled",
      ])
      .nullable(),
    latestResultSummary: z.string().nullable(),
    latestErrorSummary: z.string().nullable(),

    // Delivery
    deliveryTargets: z.any().nullable(),
    sourceConversationId: z.string().nullable(),

    // Scheduling
    dueDate: z.string().nullable(),
    priority: z.number().int().min(0).max(4),

    // Hierarchy
    parentId: z.string().nullable(),
    childCount: z.number().int().optional(),

    // Organization
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    sortOrder: z.number().nullable(),
    tags: z.array(z.string()),

    // AI tag generation
    processingEnabled: z.boolean(),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable(),

    // Lifecycle
    completedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),

    // Relations (optional, included when fetching detail)
    comments: z.array(TaskCommentSchema).optional(),
  })
  .meta({ ref: "TaskResponse" });

export const TaskOccurrenceSchema = z
  .object({
    id: z.string(),
    taskId: z.string(),
    userId: z.string(),

    kind: z.enum([
      "manual_run",
      "scheduled_run",
      "recurring_run",
      "reminder",
      "review_run",
    ]),

    scheduledFor: z.string().nullable(),
    startedAt: z.string().nullable(),
    completedAt: z.string().nullable(),
    durationMs: z.number().int().nullable(),

    executionStatus: z.enum([
      "idle",
      "scheduled",
      "queued",
      "running",
      "awaiting_input",
      "awaiting_review",
      "failed",
      "completed",
      "cancelled",
    ]),

    prompt: z.string().nullable(),
    resultSummary: z.string().nullable(),
    resultBody: z.string().nullable(),
    errorBody: z.string().nullable(),

    requiresReview: z.boolean(),
    reviewStatus: z.enum(["none", "pending", "approved", "changes_requested"]),

    executorActorId: z.string().nullable(),
    requestedByActorId: z.string().nullable(),
    tokenUsage: z.any().nullable(),

    deliveryResult: z.any().nullable(),

    retryOfOccurrenceId: z.string().nullable(),

    metadata: z.any().nullable(),
    createdAt: z.string(),
  })
  .meta({ ref: "TaskOccurrence" });

export const InboxTaskSchema = z
  .object({
    taskId: z.string(),
    title: z.string(),
    userId: z.string(),
    delegateActorId: z.string().nullable(),
    taskStatus: z.enum([
      "open",
      "in_progress",
      "blocked",
      "completed",
      "cancelled",
    ]),
    attentionStatus: z.enum([
      "needs_triage",
      "awaiting_input",
      "needs_review",
      "failed",
      "urgent",
    ]),
    reasonText: z.string(),
    dueDate: z.string().nullable(),
    nextOccurrenceAt: z.string().nullable(),
    latestExecutionStatus: z
      .enum([
        "idle",
        "scheduled",
        "queued",
        "running",
        "awaiting_input",
        "awaiting_review",
        "failed",
        "completed",
        "cancelled",
      ])
      .nullable(),
    latestResultSummary: z.string().nullable(),
    latestErrorSummary: z.string().nullable(),
    reviewStatus: z.enum(["none", "pending", "approved", "changes_requested"]),
    scheduleSummary: z.string().nullable(),
    tags: z.array(z.string()),
    updatedAt: z.string(),
  })
  .meta({ ref: "InboxTask" });

export const InboxResponseSchema = z
  .object({
    sections: z.object({
      needsReview: z.array(InboxTaskSchema),
      waitingOnYou: z.array(InboxTaskSchema),
      failed: z.array(InboxTaskSchema),
      needsTriage: z.array(InboxTaskSchema),
      urgent: z.array(InboxTaskSchema),
    }),
    totalCount: z.number().int(),
  })
  .meta({ ref: "InboxResponse" });

export const TasksListResponseSchema = paginatedResponseSchema(
  TaskResponseSchema,
  "TasksListResponse",
  "tasks",
);

export type Task = z.infer<typeof TaskResponseSchema>;
export type TaskComment = z.infer<typeof TaskCommentSchema>;
export type TaskStatus = Task["taskStatus"];
export type TaskOccurrence = z.infer<typeof TaskOccurrenceSchema>;
export type InboxTask = z.infer<typeof InboxTaskSchema>;
export type InboxResponse = z.infer<typeof InboxResponseSchema>;
export type TasksListResponse = z.infer<typeof TasksListResponseSchema>;
