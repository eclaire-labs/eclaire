// schemas/tasks-responses.ts
import { z } from "zod";
import "zod-openapi/extend";

// Task comment user schema
export const CommentUserSchema = z
  .object({
    id: z.string().openapi({
      description: "User ID",
    }),
    displayName: z.string().nullable().openapi({
      description: "Display name of the user",
    }),
    userType: z.enum(["user", "assistant", "worker"]).openapi({
      description: "Type of user",
    }),
  })
  .openapi({ ref: "CommentUser" });

// Task comment schema
export const TaskCommentSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the comment",
    }),
    taskId: z.string().openapi({
      description: "ID of the task this comment belongs to",
    }),
    userId: z.string().openapi({
      description: "ID of the user who created the comment",
    }),
    content: z.string().openapi({
      description: "Content of the comment",
    }),
    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when comment was created",
    }),
    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when comment was last updated",
    }),
    user: CommentUserSchema.openapi({
      description: "User information for the comment author",
    }),
  })
  .openapi({ ref: "TaskComment" });

// Array of task comments
export const TaskCommentsListSchema = z.array(TaskCommentSchema).openapi({
  ref: "TaskCommentsList",
  description: "Array of task comments",
});

// Full task response schema
export const TaskResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the task",
    }),

    title: z.string().openapi({
      description: "Title of the task",
    }),

    description: z.string().nullable().openapi({
      description: "Detailed description of the task",
    }),

    status: z.enum(["not-started", "in-progress", "completed"]).openapi({
      description: "Current status of the task",
    }),

    dueDate: z.string().nullable().openapi({
      description: "Due date for the task in ISO 8601 format",
    }),

    assignedToId: z.string().nullable().openapi({
      description: "User ID of the person assigned to this task",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the task",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the task",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the task is pinned",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the task",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when task was created",
    }),

    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when task was last updated",
    }),

    userId: z.string().openapi({
      description: "ID of the user who owns this task",
    }),

    processingStatus: z.string().openapi({
      description: "Status of background processing for this task",
    }),

    comments: z.array(TaskCommentSchema).openapi({
      description: "Comments associated with this task",
    }),

    // Recurrence fields
    isRecurring: z.boolean().openapi({
      description: "Whether the task should recur based on a schedule",
    }),

    cronExpression: z.string().nullable().openapi({
      description: "Cron expression for task recurrence",
    }),

    recurrenceEndDate: z.string().nullable().openapi({
      description: "Optional end date for task recurrence in ISO 8601 format",
    }),

    nextRunAt: z.string().nullable().openapi({
      description: "Next scheduled run time for the task in ISO 8601 format",
    }),

    lastRunAt: z.string().nullable().openapi({
      description: "Last execution time for the task in ISO 8601 format",
    }),

    completedAt: z.string().nullable().openapi({
      description: "Completion time for the task in ISO 8601 format",
    }),

    recurrenceLimit: z.number().nullable().openapi({
      description: "Maximum number of executions for recurring tasks",
    }),

    runImmediately: z.boolean().openapi({
      description: "Whether to execute the first recurring job immediately",
    }),

    enabled: z.boolean().openapi({
      description: "Whether background processing is enabled for this task",
    }),
  })
  .openapi({ ref: "TaskResponse" });

// Array of tasks response
export const TasksListResponseSchema = z.array(TaskResponseSchema).openapi({
  ref: "TasksListResponse",
  description: "Array of task objects",
});

// Search results response (includes pagination info)
export const TasksSearchResponseSchema = z
  .object({
    tasks: z.array(TaskResponseSchema).openapi({
      description: "Array of tasks matching the search criteria",
    }),

    totalCount: z.number().openapi({
      description:
        "Total number of tasks matching the search criteria (before limit is applied)",
    }),

    limit: z.number().openapi({
      description: "Maximum number of tasks returned in this response",
    }),
  })
  .openapi({
    ref: "TasksSearchResponse",
    description: "Search results with pagination information",
  });

// Created task response (for POST requests)
export const CreatedTaskResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the created task",
    }),

    title: z.string().openapi({
      description: "Title of the task",
    }),

    description: z.string().nullable().openapi({
      description: "Description of the task",
    }),

    status: z.enum(["not-started", "in-progress", "completed"]).openapi({
      description: "Initial status of the task",
    }),

    dueDate: z.string().nullable().openapi({
      description: "Due date for the task in ISO 8601 format",
    }),

    assignedToId: z.string().nullable().openapi({
      description: "User ID of the person assigned to this task",
    }),

    enabled: z.boolean().openapi({
      description: "Whether background processing is enabled for this task",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the task",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the task",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the task is pinned",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the task",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when task was created",
    }),

    userId: z.string().openapi({
      description: "ID of the user who owns this task",
    }),

    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when task was last updated",
    }),

    processingStatus: z.string().openapi({
      description: "Status of background processing for this task",
    }),

    comments: z.array(TaskCommentSchema).openapi({
      description: "Comments associated with this task",
    }),

    // Recurrence fields
    isRecurring: z.boolean().openapi({
      description: "Whether the task should recur based on a schedule",
    }),

    cronExpression: z.string().nullable().openapi({
      description: "Cron expression for task recurrence",
    }),

    recurrenceEndDate: z.string().nullable().openapi({
      description: "Optional end date for task recurrence in ISO 8601 format",
    }),

    nextRunAt: z.string().nullable().openapi({
      description: "Next scheduled run time for the task in ISO 8601 format",
    }),

    lastRunAt: z.string().nullable().openapi({
      description: "Last execution time for the task in ISO 8601 format",
    }),

    completedAt: z.string().nullable().openapi({
      description: "Completion time for the task in ISO 8601 format",
    }),

    recurrenceLimit: z.number().nullable().openapi({
      description: "Maximum number of executions for recurring tasks",
    }),

    runImmediately: z.boolean().openapi({
      description: "Whether to execute the first recurring job immediately",
    }),
  })
  .openapi({ ref: "CreatedTaskResponse" });

// Task not found error
export const TaskNotFoundSchema = z
  .object({
    error: z.literal("Task not found").openapi({
      description: "Task with the specified ID was not found",
    }),
  })
  .openapi({ ref: "TaskNotFound" });

// Combined response schema for GET /tasks endpoint
export const TasksGetResponseSchema = z
  .union([TasksListResponseSchema, TasksSearchResponseSchema])
  .openapi({
    ref: "TasksGetResponse",
    description:
      "Response for GET /tasks - either a simple array of tasks or search results with pagination",
  });

// Comment not found error
export const CommentNotFoundSchema = z
  .object({
    error: z.literal("Comment not found").openapi({
      description: "Comment with the specified ID was not found",
    }),
  })
  .openapi({ ref: "CommentNotFound" });

// Comment delete success response
export const CommentDeleteSuccessSchema = z
  .object({
    message: z.string().openapi({
      description: "Success message confirming comment deletion",
    }),
  })
  .openapi({ ref: "CommentDeleteSuccess" });
