// schemas/tasks-params.ts
import { z } from "zod";
import "zod-openapi/extend";

// Full task creation/update schema
export const TaskSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .openapi({
        description: "Title of the task",
        examples: [
          "Complete project documentation",
          "Review code changes",
          "Schedule team meeting",
        ],
      }),

    description: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Optional detailed description of the task",
        examples: [
          "Write comprehensive documentation for the new API endpoints",
          "Review and approve pull request #123",
        ],
      }),

    status: z
      .enum(["not-started", "in-progress", "completed"])
      .optional()
      .default("not-started")
      .openapi({
        description: "Current status of the task",
        examples: ["not-started", "in-progress", "completed"],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Due date for the task in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    assignedToId: z
      .string()
      .optional()
      .openapi({
        description: "User ID of the person assigned to this task",
        examples: ["user123", "user456"],
      }),

    enabled: z
      .boolean()
      .default(true)
      .openapi({
        description: "Whether background processing is enabled for this task",
        examples: [true, false],
      }),

    tags: z
      .array(z.string())
      .default([])
      .openapi({
        description: "Array of tags to categorize the task",
        examples: [
          ["urgent", "development"],
          ["meeting", "planning"],
          ["documentation", "api"],
        ],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .openapi({
        description: "Review status of the task",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .openapi({
        description: "Flag color for the task (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .openapi({
        description: "Whether the task is pinned",
        examples: [true, false],
      }),

    isRecurring: z
      .boolean()
      .default(false)
      .openapi({
        description: "Whether the task should recur based on a schedule",
        examples: [true, false],
      }),

    cronExpression: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description:
          "Cron expression for task recurrence (required when isRecurring is true)",
        examples: ["0 9 * * 1", "0 0 1 * *", "0 18 * * 5"],
      }),

    recurrenceEndDate: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Optional end date for task recurrence in ISO 8601 format",
        examples: ["2025-12-31T23:59:59Z", null],
      }),

    recurrenceLimit: z
      .number()
      .int()
      .positive()
      .optional()
      .openapi({
        description: "Maximum number of executions for recurring tasks",
        examples: [5, 10, 100],
      }),

    runImmediately: z
      .boolean()
      .default(false)
      .openapi({
        description: "Whether to execute the first recurring job immediately",
        examples: [true, false],
      }),
  })
  .openapi({
    ref: "TaskRequest",
    description: "Complete task data for creation or full update",
  });

// Partial task update schema
export const PartialTaskSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .optional()
      .openapi({
        description: "Title of the task",
        examples: ["Updated task title"],
      }),

    description: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Optional detailed description of the task",
        examples: ["Updated task description"],
      }),

    status: z
      .enum(["not-started", "in-progress", "completed"])
      .optional()
      .openapi({
        description: "Current status of the task",
        examples: ["completed", "in-progress"],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Due date for the task in ISO 8601 format",
        examples: ["2025-07-01T10:00:00Z", null],
      }),

    assignedToId: z
      .string()
      .optional()
      .openapi({
        description: "User ID of the person assigned to this task",
        examples: ["user456"],
      }),

    enabled: z
      .boolean()
      .optional()
      .openapi({
        description: "Whether background processing is enabled for this task",
        examples: [true, false],
      }),

    tags: z
      .array(z.string())
      .optional()
      .openapi({
        description: "Array of tags to categorize the task",
        examples: [["updated", "priority"]],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
      .openapi({
        description: "Review status of the task",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .openapi({
        description: "Flag color for the task (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .optional()
      .openapi({
        description: "Whether the task is pinned",
        examples: [true, false],
      }),

    isRecurring: z
      .boolean()
      .optional()
      .openapi({
        description: "Whether the task should recur based on a schedule",
        examples: [true, false],
      }),

    cronExpression: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description:
          "Cron expression for task recurrence (required when isRecurring is true)",
        examples: ["0 9 * * 1", "0 0 1 * *", "0 18 * * 5"],
      }),

    recurrenceEndDate: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Optional end date for task recurrence in ISO 8601 format",
        examples: ["2025-12-31T23:59:59Z", null],
      }),

    recurrenceLimit: z
      .number()
      .int()
      .positive()
      .optional()
      .nullable()
      .openapi({
        description: "Maximum number of executions for recurring tasks",
        examples: [5, 10, 100, null],
      }),

    runImmediately: z
      .boolean()
      .optional()
      .openapi({
        description: "Whether to execute the first recurring job immediately",
        examples: [true, false],
      }),

    completedAt: z
      .string()
      .optional()
      .nullable()
      .openapi({
        description: "Completion time for the task in ISO 8601 format",
        examples: ["2025-06-15T14:30:00Z", null],
      }),
  })
  .openapi({
    ref: "PartialTaskRequest",
    description: "Partial task data for updates",
  });

// Task search/filter parameters schema
export const TaskSearchParamsSchema = z
  .object({
    text: z
      .string()
      .optional()
      .openapi({
        description: "Search text to match against task title and description",
        examples: ["documentation", "meeting", "urgent"],
      }),

    tags: z
      .string()
      .optional()
      .openapi({
        description: "Comma-separated list of tags to filter by",
        examples: ["urgent,development", "meeting,planning"],
      }),

    status: z
      .enum(["not-started", "in-progress", "completed"])
      .optional()
      .openapi({
        description: "Filter tasks by status",
        examples: ["in-progress", "completed"],
      }),

    startDate: z
      .string()
      .optional()
      .openapi({
        description:
          "Filter tasks with due dates on or after this date (YYYY-MM-DD format)",
        examples: ["2025-06-01", "2025-12-31"],
      }),

    endDate: z
      .string()
      .optional()
      .openapi({
        description:
          "Filter tasks with due dates on or before this date (YYYY-MM-DD format)",
        examples: ["2025-06-30", "2025-12-31"],
      }),

    limit: z.coerce
      .number()
      .min(1)
      .optional()
      .default(50)
      .openapi({
        description: "Maximum number of tasks to return",
        examples: [10, 25, 50, 9999],
      }),

    dueDateStart: z
      .string()
      .optional()
      .openapi({
        description:
          "Filter tasks with due dates on or after this date (YYYY-MM-DD format)",
        examples: ["2025-06-01", "2025-12-31"],
      }),

    dueDateEnd: z
      .string()
      .optional()
      .openapi({
        description:
          "Filter tasks with due dates on or before this date (YYYY-MM-DD format)",
        examples: ["2025-06-30", "2025-12-31"],
      }),
  })
  .openapi({
    ref: "TaskSearchParams",
    description: "Query parameters for searching and filtering tasks",
  });

// Task comment creation schema
export const TaskCommentCreateSchema = z
  .object({
    content: z
      .string()
      .min(1, "Comment content is required")
      .openapi({
        description: "Content of the comment",
        examples: [
          "This task is completed and tested successfully.",
          "I've reviewed the requirements and started implementation.",
          "The AI assistant has processed this task.",
        ],
      }),
  })
  .openapi({
    ref: "TaskCommentCreate",
    description: "Data for creating a new task comment",
  });

// Task comment update schema
export const TaskCommentUpdateSchema = z
  .object({
    content: z
      .string()
      .min(1, "Comment content is required")
      .openapi({
        description: "Updated content of the comment",
        examples: [
          "This task is completed and tested successfully (updated).",
          "I've reviewed the requirements and started implementation (edited).",
        ],
      }),
  })
  .openapi({
    ref: "TaskCommentUpdate",
    description: "Data for updating an existing task comment",
  });

// Path parameters
export const TaskIdParam = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier of the task",
      examples: ["clxyz123abc", "task_12345"],
    }),
  })
  .openapi({
    ref: "TaskIdParam",
    description: "Path parameter for task ID",
  });

export const CommentIdParam = z
  .object({
    commentId: z.string().openapi({
      description: "Unique identifier of the comment",
      examples: ["tc-xyz123abc", "tc-comment456"],
    }),
  })
  .openapi({
    ref: "CommentIdParam",
    description: "Path parameter for comment ID",
  });
