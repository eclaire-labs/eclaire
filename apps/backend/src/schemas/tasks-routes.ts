// schemas/tasks-routes.ts

import { resolver } from "hono-openapi";
import z from "zod/v4";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import {
  PartialTaskSchema,
  TaskCommentCreateSchema,
  TaskCommentUpdateSchema,
  TaskSchema,
  TaskSearchParamsSchema,
} from "./tasks-params.js";
import {
  CommentDeleteSuccessSchema,
  CommentNotFoundSchema,
  CreatedTaskResponseSchema,
  TaskCommentSchema,
  TaskCommentsListSchema,
  TaskNotFoundSchema,
  TaskResponseSchema,
  TasksGetResponseSchema,
  TasksListResponseSchema,
  TasksSearchResponseSchema,
} from "./tasks-responses.js";

// GET /api/tasks - Get all tasks or search tasks
export const getTasksRouteDescription = {
  tags: ["Tasks"],
  summary: "Get all tasks or search tasks",
  description:
    "Retrieve all tasks for the authenticated user, or search/filter tasks based on query parameters",
  parameters: [
    {
      name: "text",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Search text to match against task title and description",
    },
    {
      name: "tags",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Comma-separated list of tags to filter by",
    },
    {
      name: "status",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: ["not-started", "in-progress", "completed"],
      },
      description: "Filter tasks by status",
    },
    {
      name: "startDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description:
        "Filter tasks with due dates on or after this date (YYYY-MM-DD format)",
    },
    {
      name: "endDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description:
        "Filter tasks with due dates on or before this date (YYYY-MM-DD format)",
    },
    {
      name: "limit",
      in: "query" as const,
      required: false,
      schema: {
        type: "integer" as const,
        minimum: 1,
        maximum: 100,
        default: 50,
      },
      description: "Maximum number of tasks to return",
    },
    {
      name: "dueDateStart",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description:
        "Filter tasks with due dates on or after this date (YYYY-MM-DD format)",
    },
    {
      name: "dueDateEnd",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description:
        "Filter tasks with due dates on or before this date (YYYY-MM-DD format)",
    },
  ],
  responses: {
    200: {
      description: "List of tasks or search results",
      content: {
        "application/json": {
          schema: resolver(TasksGetResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid search parameters",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// POST /api/tasks - Create a new task
export const postTasksRouteDescription = {
  tags: ["Tasks"],
  summary: "Create a new task",
  description: "Create a new task for the authenticated user",
  requestBody: {
    description: "Task creation data",
    content: {
      "application/json": {
        schema: resolver(TaskSchema) as any,
      },
    },
  },
  responses: {
    201: {
      description: "Task created successfully",
      content: {
        "application/json": {
          schema: resolver(CreatedTaskResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/tasks/:id - Get a specific task
export const getTaskByIdRouteDescription = {
  tags: ["Tasks"],
  summary: "Get task by ID",
  description: "Retrieve a specific task by its unique identifier",
  responses: {
    200: {
      description: "Task details",
      content: {
        "application/json": {
          schema: resolver(TaskResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/tasks/:id - Update a task (full update)
export const putTaskRouteDescription = {
  tags: ["Tasks"],
  summary: "Update task (full)",
  description:
    "Completely update a task with new data. All fields are optional but provided fields will replace existing values.",
  requestBody: {
    description: "Complete task data",
    content: {
      "application/json": {
        schema: resolver(PartialTaskSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Task updated successfully",
      content: {
        "application/json": {
          schema: resolver(TaskResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/tasks/:id - Update a task (partial update)
export const patchTaskRouteDescription = {
  tags: ["Tasks"],
  summary: "Update task (partial)",
  description:
    "Partially update a task with new data. Only provided fields will be updated.",
  requestBody: {
    description: "Partial task data",
    content: {
      "application/json": {
        schema: resolver(PartialTaskSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Task updated successfully",
      content: {
        "application/json": {
          schema: resolver(TaskResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// Response schema for successful task deletion
export const TaskDeleteSuccessSchema = z
  .object({
    message: z.string().meta({
      description: "Success message confirming task deletion",
    }),
  })
  .meta({ ref: "TaskDeleteSuccess" });

// Request schema for review status update
export const TaskReviewUpdateSchema = z
  .object({
    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "New review status for the task",
      examples: ["accepted", "rejected"],
    }),
  })
  .meta({ ref: "TaskReviewUpdate" });

// Request schema for flag color update
export const TaskFlagUpdateSchema = z
  .object({
    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the task (null to remove flag)",
        examples: ["red", "green", null],
      }),
  })
  .meta({ ref: "TaskFlagUpdate" });

// Request schema for pin status update
export const TaskPinUpdateSchema = z
  .object({
    isPinned: z.boolean().meta({
      description: "Whether to pin or unpin the task",
      examples: [true, false],
    }),
  })
  .meta({ ref: "TaskPinUpdate" });

// DELETE /api/tasks/:id - Delete a task
export const deleteTaskRouteDescription = {
  tags: ["Tasks"],
  summary: "Delete task",
  description: "Delete a task permanently",
  responses: {
    200: {
      description: "Task deleted successfully",
      content: {
        "application/json": {
          schema: resolver(TaskDeleteSuccessSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/tasks/:id/review - Update review status
export const patchTaskReviewRouteDescription = {
  tags: ["Tasks"],
  summary: "Update task review status",
  description: "Update the review status of a task",
  requestBody: {
    description: "Review status update data",
    content: {
      "application/json": {
        schema: resolver(TaskReviewUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Task review status updated successfully",
      content: {
        "application/json": {
          schema: resolver(TaskResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/tasks/:id/flag - Update flag color
export const patchTaskFlagRouteDescription = {
  tags: ["Tasks"],
  summary: "Update task flag color",
  description: "Update the flag color of a task",
  requestBody: {
    description: "Flag color update data",
    content: {
      "application/json": {
        schema: resolver(TaskFlagUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Task flag color updated successfully",
      content: {
        "application/json": {
          schema: resolver(TaskResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/tasks/:id/pin - Toggle pin status
export const patchTaskPinRouteDescription = {
  tags: ["Tasks"],
  summary: "Update task pin status",
  description: "Update the pin status of a task",
  requestBody: {
    description: "Pin status update data",
    content: {
      "application/json": {
        schema: resolver(TaskPinUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Task pin status updated successfully",
      content: {
        "application/json": {
          schema: resolver(TaskResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/tasks/:id/comments - Get comments for a task
export const getTaskCommentsRouteDescription = {
  tags: ["Task Comments"],
  summary: "Get task comments",
  description: "Retrieve all comments for a specific task",
  responses: {
    200: {
      description: "List of comments for the task",
      content: {
        "application/json": {
          schema: resolver(TaskCommentsListSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// POST /api/tasks/:id/comments - Create a comment for a task
export const postTaskCommentRouteDescription = {
  tags: ["Task Comments"],
  summary: "Create task comment",
  description: "Create a new comment for a specific task",
  requestBody: {
    description: "Comment creation data",
    content: {
      "application/json": {
        schema: resolver(TaskCommentCreateSchema) as any,
      },
    },
  },
  responses: {
    201: {
      description: "Comment created successfully",
      content: {
        "application/json": {
          schema: resolver(TaskCommentSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/tasks/:taskId/comments/:commentId - Update a comment
export const putTaskCommentRouteDescription = {
  tags: ["Task Comments"],
  summary: "Update task comment",
  description: "Update an existing task comment",
  requestBody: {
    description: "Comment update data",
    content: {
      "application/json": {
        schema: resolver(TaskCommentUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Comment updated successfully",
      content: {
        "application/json": {
          schema: resolver(TaskCommentSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Comment not found",
      content: {
        "application/json": {
          schema: resolver(CommentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// DELETE /api/tasks/:taskId/comments/:commentId - Delete a comment
export const deleteTaskCommentRouteDescription = {
  tags: ["Task Comments"],
  summary: "Delete task comment",
  description: "Delete an existing task comment",
  responses: {
    200: {
      description: "Comment deleted successfully",
      content: {
        "application/json": {
          schema: resolver(CommentDeleteSuccessSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Comment not found",
      content: {
        "application/json": {
          schema: resolver(CommentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/tasks/:id/execution-tracking - Update task execution tracking
export const putTaskExecutionTrackingRouteDescription = {
  tags: ["Job Processing"],
  summary: "Update task execution tracking",
  description:
    "Update task execution tracking information. This endpoint is used by system workers and is not intended for public use.",
  requestBody: {
    description: "Task execution tracking data",
    content: {
      "application/json": {
        schema: {
          type: "object" as const,
          properties: {
            lastRunAt: {
              type: "string" as const,
              format: "date-time" as const,
              description: "ISO 8601 timestamp when task execution started",
            },
            nextRunAt: {
              type: "string" as const,
              format: "date-time" as const,
              nullable: true,
              description:
                "ISO 8601 timestamp for next scheduled run (for recurring tasks)",
            },
          },
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task execution tracking updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              message: {
                type: "string" as const,
                description: "Success message",
              },
              updated: {
                type: "array" as const,
                items: { type: "string" as const },
                description: "List of fields that were updated",
              },
            },
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    403: {
      description: "Unauthorized to update this task",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
    404: {
      description: "Task not found",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/tasks/:id/assistant-status - Update task status as assigned assistant
export const putTaskAssistantStatusRouteDescription = {
  tags: ["Tasks"],
  summary: "Update task status as assigned assistant",
  description:
    "Update the status of a task as its assigned assistant. Only the assigned assistant can update the task status through this endpoint.",
  requestBody: {
    description: "Task status update data",
    content: {
      "application/json": {
        schema: {
          type: "object" as const,
          properties: {
            status: {
              type: "string" as const,
              enum: ["not-started", "in-progress", "completed"],
              description: "New task status",
            },
            assignedAssistantId: {
              type: "string" as const,
              description: "ID of the assistant assigned to this task",
            },
            completedAt: {
              type: "string" as const,
              format: "date-time" as const,
              description:
                "ISO 8601 timestamp when task was completed (for completed status)",
            },
          },
          required: ["status", "assignedAssistantId"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Task status updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              success: {
                type: "boolean" as const,
                description: "Whether the update was successful",
              },
              message: {
                type: "string" as const,
                description: "Success message",
              },
            },
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Task not found or not assigned to assistant",
      content: {
        "application/json": {
          schema: resolver(TaskNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};
