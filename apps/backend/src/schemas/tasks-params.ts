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
        examples: ["Complete project documentation", "Review code changes"],
      }),

    description: z.string().optional().nullable().meta({
      description: "Optional detailed description of the task",
    }),

    prompt: z.string().optional().nullable().meta({
      description: "Agent instructions — what the delegate should do",
    }),

    taskStatus: z
      .enum(["open", "in_progress", "blocked", "completed", "cancelled"])
      .optional()
      .default("open")
      .meta({
        description: "Current status of the task",
      }),

    priority: z.number().int().min(0).max(4).optional().default(0).meta({
      description: "Priority level: 0=none, 1=urgent, 2=high, 3=medium, 4=low",
    }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z"],
      }),

    delegateActorId: z.string().nullable().optional().meta({
      description: "Actor ID delegated to work on this task",
    }),

    delegateMode: z
      .enum(["manual", "assist", "handle"])
      .optional()
      .default("manual")
      .meta({
        description:
          "How the task is executed: manual (human only), assist (agent works, user reviews), handle (agent auto-completes)",
      }),

    attentionStatus: z
      .enum([
        "none",
        "needs_triage",
        "awaiting_input",
        "needs_review",
        "failed",
        "urgent",
      ])
      .optional()
      .default("none")
      .meta({ description: "Inbox attention routing status" }),

    reviewStatus: z
      .enum(["none", "pending", "approved", "changes_requested"])
      .optional()
      .default("none")
      .meta({ description: "Review status" }),

    scheduleType: z
      .enum(["none", "one_time", "recurring"])
      .optional()
      .default("none")
      .meta({ description: "Schedule type" }),

    scheduleRule: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Cron expression (recurring) or ISO datetime (one_time)",
        examples: ["0 9 * * 1", "2025-06-15T09:00:00Z"],
      }),

    scheduleSummary: z
      .string()
      .optional()
      .nullable()
      .meta({ description: "Human-readable schedule description" }),

    timezone: z
      .string()
      .optional()
      .nullable()
      .meta({ description: "IANA timezone" }),

    maxOccurrences: z
      .number()
      .int()
      .positive()
      .nullable()
      .optional()
      .meta({ description: "Maximum number of occurrences" }),

    deliveryTargets: z
      .any()
      .optional()
      .nullable()
      .meta({ description: "Where to deliver results (JSONB)" }),

    sourceConversationId: z
      .string()
      .optional()
      .nullable()
      .meta({ description: "Originating conversation ID" }),

    processingEnabled: z
      .boolean()
      .default(true)
      .meta({ description: "Whether AI tag generation is enabled" }),

    tags: z
      .array(z.string())
      .default([])
      .meta({ description: "Tags to categorize the task" }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .optional()
      .meta({ description: "Flag color (optional)" }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({ description: "Whether the task is pinned" }),

    sortOrder: z
      .number()
      .optional()
      .nullable()
      .meta({ description: "Manual sort order (fractional)" }),
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
  text: z.string().optional().meta({
    description: "Search text to match against task title and description",
  }),

  tags: z.string().optional().meta({
    description: "Comma-separated list of tags to filter by",
  }),

  taskStatus: z
    .enum(["open", "in_progress", "blocked", "completed", "cancelled"])
    .optional()
    .meta({ description: "Filter tasks by status" }),

  attentionStatus: z
    .enum([
      "none",
      "needs_triage",
      "awaiting_input",
      "needs_review",
      "failed",
      "urgent",
    ])
    .optional()
    .meta({ description: "Filter by attention status" }),

  scheduleType: z
    .enum(["none", "one_time", "recurring"])
    .optional()
    .meta({ description: "Filter by schedule type" }),

  delegateMode: z.string().optional().meta({
    description:
      "Filter by delegate mode (comma-separated for multiple, e.g. 'assist,handle')",
  }),

  priority: z.coerce.number().int().min(0).max(4).optional().meta({
    description: "Filter by priority",
  }),

  startDate: z.string().optional().meta({
    description: "Filter tasks created on or after this date (YYYY-MM-DD)",
  }),

  endDate: z.string().optional().meta({
    description: "Filter tasks created on or before this date (YYYY-MM-DD)",
  }),

  limit: z.coerce.number().min(1).max(200).optional().default(50).meta({
    description: "Maximum number of tasks to return per page",
  }),

  cursor: z.string().optional().meta({
    description: "Opaque cursor for pagination",
  }),

  sortBy: z
    .enum([
      "createdAt",
      "dueDate",
      "taskStatus",
      "title",
      "priority",
      "sortOrder",
      "updatedAt",
      "relevance",
    ])
    .optional()
    .default("createdAt")
    .meta({
      description:
        "Field to sort tasks by. Use 'relevance' with text search for best results.",
    }),

  sortDir: z.enum(["asc", "desc"]).optional().default("desc").meta({
    description: "Sort direction",
  }),

  dueDateStart: z.string().optional().meta({
    description: "Filter tasks with due dates on or after this date",
  }),

  dueDateEnd: z.string().optional().meta({
    description: "Filter tasks with due dates on or before this date",
  }),
});

// Task comment creation schema
export const TaskCommentCreateSchema = z
  .object({
    content: z.string().min(1, "Comment content is required").meta({
      description: "Content of the comment",
    }),
  })
  .meta({
    ref: "TaskCommentCreate",
    description: "Data for creating a new task comment",
  });

// Task comment update schema
export const TaskCommentUpdateSchema = z
  .object({
    content: z.string().min(1, "Comment content is required").meta({
      description: "Updated content of the comment",
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
    }),
  })
  .meta({
    ref: "CommentIdParam",
    description: "Path parameter for comment ID",
  });
