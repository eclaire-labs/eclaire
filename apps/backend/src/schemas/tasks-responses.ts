// schemas/tasks-responses.ts
import z from "zod/v4";

// Task comment user schema
export const CommentUserSchema = z
  .object({
    id: z.string().meta({
      description: "User ID",
    }),
    displayName: z.string().nullable().meta({
      description: "Display name of the user",
    }),
    userType: z.enum(["user", "assistant", "worker"]).meta({
      description: "Type of user",
    }),
  })
  .meta({ ref: "CommentUser" });

// Task comment schema
export const TaskCommentSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the comment",
    }),
    taskId: z.string().meta({
      description: "ID of the task this comment belongs to",
    }),
    userId: z.string().meta({
      description: "ID of the user who created the comment",
    }),
    content: z.string().meta({
      description: "Content of the comment",
    }),
    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when comment was created",
    }),
    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when comment was last updated",
    }),
    user: CommentUserSchema.meta({
      description: "User information for the comment author",
    }),
  })
  .meta({ ref: "TaskComment" });

// Array of task comments
export const TaskCommentsListSchema = z.array(TaskCommentSchema).meta({
  ref: "TaskCommentsList",
  description: "Array of task comments",
});

// Full task response schema
export const TaskResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the task",
    }),

    title: z.string().meta({
      description: "Title of the task",
    }),

    description: z.string().nullable().meta({
      description: "Detailed description of the task",
    }),

    status: z.enum(["not-started", "in-progress", "completed"]).meta({
      description: "Current status of the task",
    }),

    dueDate: z.string().nullable().meta({
      description: "Due date for the task in ISO 8601 format",
    }),

    assignedToId: z.string().nullable().meta({
      description: "User ID of the person assigned to this task",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "Review status of the task",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the task",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the task is pinned",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the task",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when task was created",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when task was last updated",
    }),

    userId: z.string().meta({
      description: "ID of the user who owns this task",
    }),

    processingStatus: z.string().meta({
      description: "Status of background processing for this task",
    }),

    comments: z.array(TaskCommentSchema).meta({
      description: "Comments associated with this task",
    }),

    // Recurrence fields
    isRecurring: z.boolean().meta({
      description: "Whether the task should recur based on a schedule",
    }),

    cronExpression: z.string().nullable().meta({
      description: "Cron expression for task recurrence",
    }),

    recurrenceEndDate: z.string().nullable().meta({
      description: "Optional end date for task recurrence in ISO 8601 format",
    }),

    nextRunAt: z.string().nullable().meta({
      description: "Next scheduled run time for the task in ISO 8601 format",
    }),

    lastRunAt: z.string().nullable().meta({
      description: "Last execution time for the task in ISO 8601 format",
    }),

    completedAt: z.string().nullable().meta({
      description: "Completion time for the task in ISO 8601 format",
    }),

    recurrenceLimit: z.number().nullable().meta({
      description: "Maximum number of executions for recurring tasks",
    }),

    runImmediately: z.boolean().meta({
      description: "Whether to execute the first recurring job immediately",
    }),

    enabled: z.boolean().meta({
      description: "Whether background processing is enabled for this task",
    }),
  })
  .meta({ ref: "TaskResponse" });

// Array of tasks response
export const TasksListResponseSchema = z.array(TaskResponseSchema).meta({
  ref: "TasksListResponse",
  description: "Array of task objects",
});

// Search results response (includes pagination info)
export const TasksSearchResponseSchema = z
  .object({
    tasks: z.array(TaskResponseSchema).meta({
      description: "Array of tasks matching the search criteria",
    }),

    totalCount: z.number().meta({
      description:
        "Total number of tasks matching the search criteria (before limit is applied)",
    }),

    limit: z.number().meta({
      description: "Maximum number of tasks returned in this response",
    }),
  })
  .meta({
    ref: "TasksSearchResponse",
    description: "Search results with pagination information",
  });

// Created task response (for POST requests)
export const CreatedTaskResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the created task",
    }),

    title: z.string().meta({
      description: "Title of the task",
    }),

    description: z.string().nullable().meta({
      description: "Description of the task",
    }),

    status: z.enum(["not-started", "in-progress", "completed"]).meta({
      description: "Initial status of the task",
    }),

    dueDate: z.string().nullable().meta({
      description: "Due date for the task in ISO 8601 format",
    }),

    assignedToId: z.string().nullable().meta({
      description: "User ID of the person assigned to this task",
    }),

    enabled: z.boolean().meta({
      description: "Whether background processing is enabled for this task",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "Review status of the task",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the task",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the task is pinned",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the task",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when task was created",
    }),

    userId: z.string().meta({
      description: "ID of the user who owns this task",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when task was last updated",
    }),

    processingStatus: z.string().meta({
      description: "Status of background processing for this task",
    }),

    comments: z.array(TaskCommentSchema).meta({
      description: "Comments associated with this task",
    }),

    // Recurrence fields
    isRecurring: z.boolean().meta({
      description: "Whether the task should recur based on a schedule",
    }),

    cronExpression: z.string().nullable().meta({
      description: "Cron expression for task recurrence",
    }),

    recurrenceEndDate: z.string().nullable().meta({
      description: "Optional end date for task recurrence in ISO 8601 format",
    }),

    nextRunAt: z.string().nullable().meta({
      description: "Next scheduled run time for the task in ISO 8601 format",
    }),

    lastRunAt: z.string().nullable().meta({
      description: "Last execution time for the task in ISO 8601 format",
    }),

    completedAt: z.string().nullable().meta({
      description: "Completion time for the task in ISO 8601 format",
    }),

    recurrenceLimit: z.number().nullable().meta({
      description: "Maximum number of executions for recurring tasks",
    }),

    runImmediately: z.boolean().meta({
      description: "Whether to execute the first recurring job immediately",
    }),
  })
  .meta({ ref: "CreatedTaskResponse" });

// Task not found error
export const TaskNotFoundSchema = z
  .object({
    error: z.literal("Task not found").meta({
      description: "Task with the specified ID was not found",
    }),
  })
  .meta({ ref: "TaskNotFound" });

// Combined response schema for GET /tasks endpoint
export const TasksGetResponseSchema = z
  .union([TasksListResponseSchema, TasksSearchResponseSchema])
  .meta({
    ref: "TasksGetResponse",
    description:
      "Response for GET /tasks - either a simple array of tasks or search results with pagination",
  });

// Comment not found error
export const CommentNotFoundSchema = z
  .object({
    error: z.literal("Comment not found").meta({
      description: "Comment with the specified ID was not found",
    }),
  })
  .meta({ ref: "CommentNotFound" });

// Comment delete success response
export const CommentDeleteSuccessSchema = z
  .object({
    message: z.string().meta({
      description: "Success message confirming comment deletion",
    }),
  })
  .meta({ ref: "CommentDeleteSuccess" });
