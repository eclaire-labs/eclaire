import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import { ValidationError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment,
} from "../lib/services/taskComments.js";
import {
  countTasks,
  createTask,
  deleteTask,
  findTasks,
  getAllTasks,
  getTaskById,
  reprocessTask,
  TaskNotFoundError,
  type TaskStatus,
  TaskUnauthorizedError,
  updateTask,
  updateTaskExecutionTrackingWithPermissions,
  updateTaskStatusAsAssistant,
} from "../lib/services/tasks.js";
// Import schemas
import {
  PartialTaskSchema,
  TaskSchema,
  TaskSearchParamsSchema,
} from "../schemas/tasks-params.js";
// Import route descriptions
import {
  deleteTaskCommentRouteDescription,
  deleteTaskRouteDescription,
  getTaskByIdRouteDescription,
  getTaskCommentsRouteDescription,
  getTasksRouteDescription,
  patchTaskFlagRouteDescription,
  patchTaskPinRouteDescription,
  patchTaskReviewRouteDescription,
  patchTaskRouteDescription,
  postTaskCommentRouteDescription,
  postTasksRouteDescription,
  putTaskAssistantStatusRouteDescription,
  putTaskCommentRouteDescription,
  putTaskExecutionTrackingRouteDescription,
  putTaskRouteDescription,
} from "../schemas/tasks-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("tasks");

export const tasksRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/tasks - Get all tasks or search tasks
tasksRoutes.get("/", describeRoute(getTasksRouteDescription), async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const queryParams = c.req.query();

    // If no search parameters, return all tasks
    if (Object.keys(queryParams).length === 0) {
      const tasks = await getAllTasks(userId);
      return c.json(tasks);
    }

    // Parse and validate search parameters
    try {
      const params = TaskSearchParamsSchema.parse({
        text: queryParams.text || undefined,
        tags: queryParams.tags || undefined,
        status: (queryParams.status as TaskStatus) || undefined,
        startDate: queryParams.startDate || undefined,
        endDate: queryParams.endDate || undefined,
        dueDateStart: queryParams.dueDateStart || undefined,
        dueDateEnd: queryParams.dueDateEnd || undefined,
        limit: queryParams.limit || 50,
      });

      // Process tags if provided (convert from comma-separated string to array)
      const tagsList = params.tags
        ? params.tags.split(",").map((tag: string) => tag.trim())
        : undefined;

      // Parse dates if provided
      const startDate = params.startDate
        ? new Date(params.startDate)
        : undefined;
      const endDate = params.endDate ? new Date(params.endDate) : undefined;
      const dueDateStart = params.dueDateStart
        ? new Date(params.dueDateStart)
        : undefined;
      const dueDateEnd = params.dueDateEnd
        ? new Date(params.dueDateEnd)
        : undefined;

      // Search tasks with provided criteria
      const tasks = await findTasks(
        userId,
        params.text,
        tagsList,
        params.status,
        startDate,
        endDate,
        params.limit,
        dueDateStart,
        dueDateEnd,
      );

      // Get total count for pagination
      const totalCount = await countTasks(
        userId,
        params.text,
        tagsList,
        params.status,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
      );

      return c.json({
        tasks,
        totalCount,
        limit: params.limit,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid search parameters", details: error.issues },
          400,
        );
      }
      throw error;
    }
  } catch (error: unknown) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting tasks",
    );
    return c.json({ error: "Failed to fetch tasks" }, 500);
  }
});

// POST /api/tasks - Create a new task
tasksRoutes.post(
  "/",
  describeRoute(postTasksRouteDescription),
  zValidator("json", TaskSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");
      // Convert null dueDate to undefined for CreateTaskParams compatibility
      const taskData = {
        ...validatedData,
        dueDate: validatedData.dueDate || undefined,
        description: validatedData.description || undefined,
        cronExpression: validatedData.cronExpression || undefined,
        recurrenceEndDate: validatedData.recurrenceEndDate || undefined,
      };
      const newTask = await createTask(taskData, userId);

      return c.json(newTask, 201);
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error creating task",
      );

      if (error instanceof ValidationError) {
        return c.json({ error: error.message }, 400);
      }

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.issues },
          400,
        );
      }

      return c.json({ error: "Failed to create task" }, 500);
    }
  },
);

// GET /api/tasks/:id - Get a specific task
tasksRoutes.get(
  "/:id",
  describeRoute(getTaskByIdRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      try {
        const task = await getTaskById(id, userId);

        if (!task) {
          return c.json({ error: "Task not found" }, 404);
        }

        return c.json(task);
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        throw error;
      }
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error getting task",
      );
      return c.json({ error: "Failed to fetch task" }, 500);
    }
  },
);

// PUT /api/tasks/:id - Update a task (full update)
tasksRoutes.put(
  "/:id",
  describeRoute(putTaskRouteDescription),
  zValidator("json", PartialTaskSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      const validatedData = c.req.valid("json");

      try {
        const taskData = {
          ...validatedData,
          description: validatedData.description || undefined,
          dueDate: validatedData.dueDate || undefined,
          cronExpression: validatedData.cronExpression || undefined,
        };

        // biome-ignore lint/suspicious/noImplicitAnyLet: type inferred from updateTask call
        let updatedTask;
        try {
          updatedTask = await updateTask(id, taskData, userId);
        } catch (serviceError) {
          if (serviceError instanceof ValidationError) {
            return c.json({ error: serviceError.message }, 400);
          }

          // Re-throw other errors to be handled by outer catch
          throw serviceError;
        }

        if (!updatedTask) {
          return c.json({ error: "Task not found" }, 404);
        }

        return c.json(updatedTask);
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        if ((error as Error).message.includes("Invalid user ID")) {
          return c.json({ error: (error as Error).message }, 400);
        }
        if (error instanceof ValidationError) {
          return c.json({ error: error.message }, 400);
        }
        throw error;
      }
    } catch (error: unknown) {
      const requestId = c.get("requestId");

      if (error instanceof ValidationError) {
        return c.json({ error: error.message }, 400);
      }

      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating task",
      );
      return c.json({ error: "Failed to update task" }, 500);
    }
  },
);

// PATCH /api/tasks/:id - Update a task (partial update)
tasksRoutes.patch(
  "/:id",
  describeRoute(patchTaskRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");

      // Manual validation to get better error handling
      const body = await c.req.json();
      const requestId = c.get("requestId");

      logger.debug(
        {
          requestId,
          taskId: id,
          userId,
          body,
        },
        "PATCH task request received",
      );

      const validationResult = PartialTaskSchema.safeParse(body);

      if (!validationResult.success) {
        logger.warn(
          {
            requestId,
            taskId: id,
            userId,
            body,
            validationErrors: validationResult.error.issues,
          },
          "Task PATCH validation failed",
        );
        return c.json(
          {
            error: "Invalid request data",
            details: validationResult.error.issues,
          },
          400,
        );
      }

      const validatedData = validationResult.data;

      try {
        const taskData = {
          ...validatedData,
          description: validatedData.description || undefined,
          dueDate: validatedData.dueDate || undefined,
          cronExpression: validatedData.cronExpression || undefined,
        };
        const updatedTask = await updateTask(id, taskData, userId);

        if (!updatedTask) {
          return c.json({ error: "Task not found" }, 404);
        }

        return c.json(updatedTask);
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        throw error;
      }
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating task",
      );

      return c.json({ error: "Failed to update task" }, 500);
    }
  },
);

// POST /api/tasks/:id/reprocess - Re-process an existing task
tasksRoutes.post("/:id/reprocess", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Parse body for optional force parameter
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;

    const result = await reprocessTask(id, userId, force);

    if (result.success) {
      return c.json(
        {
          message: "Task queued for reprocessing successfully",
          taskId: id,
        },
        202,
      ); // 202 Accepted: The request has been accepted for processing
    } else {
      return c.json({ error: result.error }, 400);
    }
  } catch (error) {
    logger.error({ err: error }, "Error reprocessing task");
    return c.json({ error: "Failed to reprocess task" }, 500);
  }
});

// DELETE /api/tasks/:id - Delete a task
tasksRoutes.delete(
  "/:id",
  describeRoute(deleteTaskRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");

      try {
        const success = await deleteTask(id, userId);

        if (!success) {
          return c.json({ error: "Task not found" }, 404);
        }

        return new Response(null, { status: 204 });
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        throw error;
      }
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error deleting task",
      );
      return c.json({ error: "Failed to delete task" }, 500);
    }
  },
);

// PATCH /api/tasks/:id/review - Update review status
tasksRoutes.patch(
  "/:id/review",
  describeRoute(patchTaskReviewRouteDescription),
  zValidator(
    "json",
    z.object({
      reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
        description: "New review status for the task",
        examples: ["accepted", "rejected"],
      }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { reviewStatus } = c.req.valid("json");

      try {
        const updatedTask = await updateTask(id, { reviewStatus }, userId);

        if (!updatedTask) {
          return c.json({ error: "Task not found" }, 404);
        }

        return c.json(updatedTask);
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, "Error updating task review status");
      return c.json({ error: "Failed to update task review status" }, 500);
    }
  },
);

// PATCH /api/tasks/:id/flag - Update flag color
tasksRoutes.patch(
  "/:id/flag",
  describeRoute(patchTaskFlagRouteDescription),
  zValidator(
    "json",
    z.object({
      flagColor: z
        .enum(["red", "yellow", "orange", "green", "blue"])
        .nullable()
        .meta({
          description: "Flag color for the task (null to remove flag)",
          examples: ["red", "green", null],
        }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { flagColor } = c.req.valid("json");

      try {
        const updatedTask = await updateTask(id, { flagColor }, userId);

        if (!updatedTask) {
          return c.json({ error: "Task not found" }, 404);
        }

        return c.json(updatedTask);
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, "Error updating task flag");
      return c.json({ error: "Failed to update task flag" }, 500);
    }
  },
);

// PATCH /api/tasks/:id/pin - Toggle pin status
tasksRoutes.patch(
  "/:id/pin",
  describeRoute(patchTaskPinRouteDescription),
  zValidator(
    "json",
    z.object({
      isPinned: z.boolean().meta({
        description: "Whether to pin or unpin the task",
        examples: [true, false],
      }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { isPinned } = c.req.valid("json");

      try {
        const updatedTask = await updateTask(id, { isPinned }, userId);

        if (!updatedTask) {
          return c.json({ error: "Task not found" }, 404);
        }

        return c.json(updatedTask);
      } catch (error) {
        if ((error as Error).message === "Task not found") {
          return c.json({ error: "Task not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error({ err: error }, "Error updating task pin status");
      return c.json({ error: "Failed to update task pin status" }, 500);
    }
  },
);

// PUT /api/tasks/:id/execution-tracking - Update task execution tracking
// Note: nextRunAt is now managed by the queue scheduler, not stored on the task
tasksRoutes.put(
  "/:id/execution-tracking",
  describeRoute(putTaskExecutionTrackingRouteDescription),
  zValidator(
    "json",
    z.object({
      lastExecutedAt: z.string().optional().meta({
        description: "ISO 8601 timestamp when task was last executed",
      }),
    }),
  ),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const taskId = c.req.param("id");
      const { lastExecutedAt } = c.req.valid("json");

      const result = await updateTaskExecutionTrackingWithPermissions(
        taskId,
        userId,
        lastExecutedAt,
      );

      return c.json(result);
    } catch (error: unknown) {
      if (error instanceof TaskNotFoundError) {
        return c.json({ error: "Task not found" }, 404);
      }
      if (error instanceof TaskUnauthorizedError) {
        return c.json({ error: "Unauthorized to update this task" }, 403);
      }

      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating task execution tracking",
      );

      return c.json({ error: "Failed to update task execution tracking" }, 500);
    }
  },
);

// PUT /api/tasks/:id/assistant-status - Update task status as assigned assistant
tasksRoutes.put(
  "/:id/assistant-status",
  describeRoute(putTaskAssistantStatusRouteDescription),
  zValidator(
    "json",
    z.object({
      status: z.enum(["not-started", "in-progress", "completed"]).meta({
        description: "New task status",
      }),
      assignedAssistantId: z.string().meta({
        description: "ID of the assistant assigned to this task",
      }),
      completedAt: z.string().optional().meta({
        description:
          "ISO 8601 timestamp when task was completed (for completed status)",
      }),
    }),
  ),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const taskId = c.req.param("id");
      const { status, assignedAssistantId, completedAt } = c.req.valid("json");

      await updateTaskStatusAsAssistant(
        taskId,
        status,
        assignedAssistantId,
        completedAt || null,
      );

      return c.json({
        success: true,
        message: `Task status updated to ${status}`,
      });
    } catch (error: any) {
      logger.error(
        {
          taskId: c.req.param("id"),
          error: error.message,
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating task status as assistant",
      );

      // Return appropriate error status
      if (
        error.message.includes("not assigned") ||
        error.message.includes("Task not found")
      ) {
        return c.json({ error: error.message }, 404);
      }

      return c.json({ error: "Failed to update task status" }, 500);
    }
  },
);

// GET /api/tasks/:id/comments - Get comments for a task
tasksRoutes.get(
  "/:id/comments",
  describeRoute(getTaskCommentsRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const taskId = c.req.param("id");
      const comments = await getTaskComments(taskId, userId);

      return c.json(comments);
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error getting task comments",
      );

      if (
        error instanceof Error &&
        error.message === "Task not found or access denied"
      ) {
        return c.json({ error: "Task not found" }, 404);
      }

      return c.json({ error: "Failed to fetch task comments" }, 500);
    }
  },
);

// POST /api/tasks/:id/comments - Create a comment for a task
tasksRoutes.post(
  "/:id/comments",
  describeRoute(postTaskCommentRouteDescription),
  zValidator(
    "json",
    z.object({
      content: z.string().min(1).meta({
        description: "Comment content",
        example: "This task is completed and tested successfully.",
      }),
    }),
  ),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const taskId = c.req.param("id");
      const { content } = c.req.valid("json");

      const newComment = await createTaskComment({ taskId, content }, userId);

      return c.json(newComment, 201);
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          taskId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error creating task comment",
      );

      if (error instanceof Error && error.message === "Task not found") {
        return c.json({ error: "Task not found" }, 404);
      }

      return c.json({ error: "Failed to create task comment" }, 500);
    }
  },
);

// PUT /api/tasks/:taskId/comments/:commentId - Update a comment
tasksRoutes.put(
  "/:taskId/comments/:commentId",
  describeRoute(putTaskCommentRouteDescription),
  zValidator(
    "json",
    z.object({
      content: z.string().min(1).meta({
        description: "Updated comment content",
        example: "This task is completed and tested successfully (updated).",
      }),
    }),
  ),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const commentId = c.req.param("commentId");
      const { content } = c.req.valid("json");

      const updatedComment = await updateTaskComment(
        commentId,
        { content },
        userId,
      );

      return c.json(updatedComment);
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          commentId: c.req.param("commentId"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating task comment",
      );

      if (
        error instanceof Error &&
        error.message === "Comment not found or access denied"
      ) {
        return c.json({ error: "Comment not found" }, 404);
      }

      return c.json({ error: "Failed to update task comment" }, 500);
    }
  },
);

// DELETE /api/tasks/:taskId/comments/:commentId - Delete a comment
tasksRoutes.delete(
  "/:taskId/comments/:commentId",
  describeRoute(deleteTaskCommentRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const commentId = c.req.param("commentId");
      await deleteTaskComment(commentId, userId);

      return new Response(null, { status: 204 });
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          commentId: c.req.param("commentId"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error deleting task comment",
      );

      if (
        error instanceof Error &&
        error.message === "Comment not found or access denied"
      ) {
        return c.json({ error: "Comment not found" }, 404);
      }

      return c.json({ error: "Failed to delete task comment" }, 500);
    }
  },
);
