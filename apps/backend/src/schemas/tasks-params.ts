// schemas/tasks-params.ts
import z from "zod/v4";
import { makePartial } from "./common.js";

// Full task creation/update schema
export const TaskSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .meta({
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
      .meta({
        description: "Optional detailed description of the task",
        examples: [
          "Write comprehensive documentation for the new API endpoints",
          "Review and approve pull request #123",
        ],
      }),

    status: z
      .enum(["backlog", "not-started", "in-progress", "completed", "cancelled"])
      .optional()
      .default("not-started")
      .meta({
        description: "Current status of the task",
        examples: [
          "backlog",
          "not-started",
          "in-progress",
          "completed",
          "cancelled",
        ],
      }),

    priority: z
      .number()
      .int()
      .min(0)
      .max(4)
      .optional()
      .default(0)
      .meta({
        description:
          "Priority level: 0=none, 1=urgent, 2=high, 3=medium, 4=low",
        examples: [0, 1, 2, 3, 4],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the task in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    assignedToId: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "User ID of the person assigned to this task",
        examples: ["user123", "user456"],
      }),

    processingEnabled: z
      .boolean()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this task",
        examples: [true, false],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
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
      .meta({
        description: "Review status of the task",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .optional()
      .meta({
        description: "Flag color for the task (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the task is pinned",
        examples: [true, false],
      }),

    sortOrder: z
      .number()
      .optional()
      .nullable()
      .meta({
        description: "Manual sort order (fractional). Null uses default sort.",
        examples: [1.0, 1.5, 2.0],
      }),

    parentId: z
      .string()
      .optional()
      .nullable()
      .meta({
        description:
          "ID of the parent task for sub-tasks (single-level nesting only)",
        examples: ["task_abc123", null],
      }),

    isRecurring: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the task should recur based on a schedule",
        examples: [true, false],
      }),

    cronExpression: z
      .string()
      .optional()
      .nullable()
      .meta({
        description:
          "Cron expression for task recurrence (required when isRecurring is true)",
        examples: ["0 9 * * 1", "0 0 1 * *", "0 18 * * 5"],
      }),

    recurrenceEndDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Optional end date for task recurrence in ISO 8601 format",
        examples: ["2025-12-31T23:59:59Z", null],
      }),

    recurrenceLimit: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .meta({
        description: "Maximum number of executions for recurring tasks",
        examples: [5, 10, 100],
      }),

    runImmediately: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether to execute the first recurring job immediately",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "TaskRequest",
    description: "Complete task data for creation or full update",
  });

// Partial task update schema — all fields optional, defaults stripped
export const PartialTaskSchema = makePartial(TaskSchema).meta({
  ref: "PartialTaskRequest",
  description: "Partial task data for updates",
});

// Task search/filter parameters schema
export const TaskSearchParamsSchema = z.object({
  text: z
    .string()
    .optional()
    .meta({
      description: "Search text to match against task title and description",
      examples: ["documentation", "meeting", "urgent"],
    }),

  tags: z
    .string()
    .optional()
    .meta({
      description: "Comma-separated list of tags to filter by",
      examples: ["urgent,development", "meeting,planning"],
    }),

  status: z
    .enum(["backlog", "not-started", "in-progress", "completed", "cancelled"])
    .optional()
    .meta({
      description: "Filter tasks by status",
      examples: ["backlog", "in-progress", "completed", "cancelled"],
    }),

  priority: z.coerce
    .number()
    .int()
    .min(0)
    .max(4)
    .optional()
    .meta({
      description:
        "Filter tasks by priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low",
      examples: [1, 2, 3],
    }),

  startDate: z
    .string()
    .optional()
    .meta({
      description:
        "Filter tasks with due dates on or after this date (YYYY-MM-DD format)",
      examples: ["2025-06-01", "2025-12-31"],
    }),

  endDate: z
    .string()
    .optional()
    .meta({
      description:
        "Filter tasks with due dates on or before this date (YYYY-MM-DD format)",
      examples: ["2025-06-30", "2025-12-31"],
    }),

  limit: z.coerce
    .number()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .meta({
      description: "Maximum number of tasks to return per page",
      examples: [10, 25, 50],
    }),

  cursor: z
    .string()
    .optional()
    .meta({
      description:
        "Opaque cursor for pagination. Pass the nextCursor from the previous response to get the next page.",
      examples: ["eyJzIjoiMjAyNS0wMS0wMVQwMDowMDowMFoiLCJpZCI6InRza18xMjMifQ"],
    }),

  sortBy: z
    .enum(["createdAt", "dueDate", "status", "title", "priority", "sortOrder"])
    .optional()
    .default("createdAt")
    .meta({
      description: "Field to sort tasks by",
      examples: [
        "createdAt",
        "dueDate",
        "status",
        "title",
        "priority",
        "sortOrder",
      ],
    }),

  sortDir: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc")
    .meta({
      description: "Sort direction",
      examples: ["asc", "desc"],
    }),

  dueDateStart: z
    .string()
    .optional()
    .meta({
      description:
        "Filter tasks with due dates on or after this date (YYYY-MM-DD format)",
      examples: ["2025-06-01", "2025-12-31"],
    }),

  dueDateEnd: z
    .string()
    .optional()
    .meta({
      description:
        "Filter tasks with due dates on or before this date (YYYY-MM-DD format)",
      examples: ["2025-06-30", "2025-12-31"],
    }),

  parentId: z
    .string()
    .optional()
    .meta({
      description:
        "Filter tasks by parent task ID (returns sub-tasks of the specified parent)",
      examples: ["tsk_abc123"],
    }),

  topLevelOnly: z
    .enum(["true", "false"])
    .optional()
    .meta({
      description:
        "When 'true', only return top-level tasks (exclude sub-tasks). Ignored if parentId is set.",
      examples: ["true"],
    }),
});

// Task comment creation schema
export const TaskCommentCreateSchema = z
  .object({
    content: z
      .string()
      .min(1, "Comment content is required")
      .meta({
        description: "Content of the comment",
        examples: [
          "This task is completed and tested successfully.",
          "I've reviewed the requirements and started implementation.",
          "The AI assistant has processed this task.",
        ],
      }),
  })
  .meta({
    ref: "TaskCommentCreate",
    description: "Data for creating a new task comment",
  });

// Task comment update schema
export const TaskCommentUpdateSchema = z
  .object({
    content: z
      .string()
      .min(1, "Comment content is required")
      .meta({
        description: "Updated content of the comment",
        examples: [
          "This task is completed and tested successfully (updated).",
          "I've reviewed the requirements and started implementation (edited).",
        ],
      }),
  })
  .meta({
    ref: "TaskCommentUpdate",
    description: "Data for updating an existing task comment",
  });

// Path parameters
export const TaskIdParam = z
  .object({
    id: z.string().meta({
      description: "Unique identifier of the task",
      examples: ["clxyz123abc", "task_12345"],
    }),
  })
  .meta({
    ref: "TaskIdParam",
    description: "Path parameter for task ID",
  });

export const CommentIdParam = z
  .object({
    commentId: z.string().meta({
      description: "Unique identifier of the comment",
      examples: ["tc-xyz123abc", "tc-comment456"],
    }),
  })
  .meta({
    ref: "CommentIdParam",
    description: "Path parameter for comment ID",
  });
