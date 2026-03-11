// schemas/tasks-routes.ts

import { resolver } from "hono-openapi";
import z from "zod/v4";
import {
  commonErrors,
  commonErrorsWithValidation,
  flagColorUpdateSchema,
  isPinnedUpdateSchema,
  notFoundError,
  requestBodyResolver,
  reviewStatusUpdateSchema,
} from "./common.js";
import {
  PartialTaskSchema,
  TaskCommentCreateSchema,
  TaskCommentUpdateSchema,
  TaskSchema,
} from "./tasks-params.js";
import {
  CommentNotFoundSchema,
  CreatedTaskResponseSchema,
  TaskCommentSchema,
  TaskCommentsListSchema,
  TaskNotFoundSchema,
  TaskResponseSchema,
  TasksListResponseSchema,
} from "./tasks-responses.js";

// GET /api/tasks - Get all tasks or search tasks
export const getTasksRouteDescription = {
  tags: ["Tasks"],
  summary: "Get all tasks or search tasks",
  description:
    "Retrieve all tasks for the authenticated user, or search/filter tasks based on query parameters",
  responses: {
    200: {
      description: "List of tasks or search results",
      content: {
        "application/json": {
          schema: resolver(TasksListResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
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
        schema: requestBodyResolver(TaskSchema),
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
    ...commonErrorsWithValidation,
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
    ...commonErrors,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(PartialTaskSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(PartialTaskSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Task", TaskNotFoundSchema),
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

// Request schemas for review/flag/pin status updates
export const TaskReviewUpdateSchema = reviewStatusUpdateSchema(
  "task",
  "TaskReviewUpdate",
);
export const TaskFlagUpdateSchema = flagColorUpdateSchema(
  "task",
  "TaskFlagUpdate",
);
export const TaskPinUpdateSchema = isPinnedUpdateSchema(
  "task",
  "TaskPinUpdate",
);

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
    ...commonErrors,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(TaskReviewUpdateSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(TaskFlagUpdateSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(TaskPinUpdateSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Task", TaskNotFoundSchema),
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
    ...commonErrors,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(TaskCommentCreateSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Task", TaskNotFoundSchema),
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
        schema: requestBodyResolver(TaskCommentUpdateSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Comment", CommentNotFoundSchema),
  },
};

// DELETE /api/tasks/:taskId/comments/:commentId - Delete a comment
export const deleteTaskCommentRouteDescription = {
  tags: ["Task Comments"],
  summary: "Delete task comment",
  description: "Delete an existing task comment",
  responses: {
    204: {
      description: "Comment deleted successfully",
    },
    ...commonErrors,
    404: notFoundError("Comment", CommentNotFoundSchema),
  },
};
