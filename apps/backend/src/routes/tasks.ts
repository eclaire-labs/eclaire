import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { parseSearchFields } from "../lib/search-params.js";
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
  getTaskById,
  reprocessTask,
  updateTask,
  updateTaskExecutionTrackingWithPermissions,
  updateTaskStatusAsAssistant,
} from "../lib/services/tasks.js";
import { withAuth } from "../middleware/with-auth.js";
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
import { registerCommonEndpoints } from "./shared-endpoints.js";

const logger = createChildLogger("tasks");

export const tasksRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/tasks - Get all tasks or search tasks
tasksRoutes.get(
  "/",
  describeRoute(getTasksRouteDescription),
  withAuth(async (c, userId) => {
    const params = TaskSearchParamsSchema.parse(c.req.query());
    const { tags, startDate, endDate, dueDateStart, dueDateEnd } =
      parseSearchFields(params);

    const tasks = await findTasks({
      userId,
      text: params.text,
      tags,
      status: params.status,
      startDate,
      endDate,
      limit: params.limit,
      dueDateStart,
      dueDateEnd,
    });

    const totalCount = await countTasks({
      userId,
      text: params.text,
      tags,
      status: params.status,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });

    return c.json({
      items: tasks,
      totalCount,
      limit: params.limit,
      offset: 0,
    });
  }, logger),
);

// POST /api/tasks - Create a new task
tasksRoutes.post(
  "/",
  describeRoute(postTasksRouteDescription),
  zValidator("json", TaskSchema),
  withAuth(async (c, userId) => {
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
  }, logger),
);

// GET /api/tasks/:id - Get a specific task
tasksRoutes.get(
  "/:id",
  describeRoute(getTaskByIdRouteDescription),
  withAuth(async (c, userId) => {
    const task = await getTaskById(c.req.param("id"), userId);
    if (!task) throw new NotFoundError("Task");
    return c.json(task);
  }, logger),
);

// PUT /api/tasks/:id - Update a task (full update)
tasksRoutes.put(
  "/:id",
  describeRoute(putTaskRouteDescription),
  zValidator("json", PartialTaskSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");

    const taskData = {
      ...validatedData,
      description: validatedData.description || undefined,
      dueDate: validatedData.dueDate || undefined,
      cronExpression: validatedData.cronExpression || undefined,
    };

    const updatedTask = await updateTask(id, taskData, userId);
    if (!updatedTask) throw new NotFoundError("Task");
    return c.json(updatedTask);
  }, logger),
);

// PATCH /api/tasks/:id - Update a task (partial update)
tasksRoutes.patch(
  "/:id",
  describeRoute(patchTaskRouteDescription),
  withAuth(async (c, userId) => {
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

    const taskData = {
      ...validatedData,
      description: validatedData.description || undefined,
      dueDate: validatedData.dueDate || undefined,
      cronExpression: validatedData.cronExpression || undefined,
    };
    const updatedTask = await updateTask(id, taskData, userId);
    if (!updatedTask) throw new NotFoundError("Task");
    return c.json(updatedTask);
  }, logger),
);

// DELETE /api/tasks/:id - Delete a task
tasksRoutes.delete(
  "/:id",
  describeRoute(deleteTaskRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const success = await deleteTask(id, userId);
    if (!success) throw new NotFoundError("Task");
    return new Response(null, { status: 204 });
  }, logger),
);

// Common endpoints: PATCH review/flag/pin + POST reprocess
registerCommonEndpoints(tasksRoutes, {
  resourceName: "Task",
  idKeyName: "taskId",
  updateFn: updateTask,
  reprocessFn: reprocessTask,
  routeDescriptions: {
    review: patchTaskReviewRouteDescription,
    flag: patchTaskFlagRouteDescription,
    pin: patchTaskPinRouteDescription,
  },
  logger,
});

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
  withAuth(async (c, userId) => {
    const taskId = c.req.param("id");
    const { lastExecutedAt } = c.req.valid("json");

    const result = await updateTaskExecutionTrackingWithPermissions(
      taskId,
      userId,
      lastExecutedAt,
    );

    return c.json(result);
  }, logger),
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
  withAuth(async (c, _userId) => {
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
  }, logger),
);

// GET /api/tasks/:id/comments - Get comments for a task
tasksRoutes.get(
  "/:id/comments",
  describeRoute(getTaskCommentsRouteDescription),
  withAuth(async (c, userId) => {
    const taskId = c.req.param("id");
    const comments = await getTaskComments(taskId, userId);
    return c.json(comments);
  }, logger),
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
  withAuth(async (c, userId) => {
    const taskId = c.req.param("id");
    const { content } = c.req.valid("json");
    const newComment = await createTaskComment({ taskId, content }, userId);
    return c.json(newComment, 201);
  }, logger),
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
  withAuth(async (c, userId) => {
    const commentId = c.req.param("commentId");
    const { content } = c.req.valid("json");
    const updatedComment = await updateTaskComment(
      commentId,
      { content },
      userId,
    );
    return c.json(updatedComment);
  }, logger),
);

// DELETE /api/tasks/:taskId/comments/:commentId - Delete a comment
tasksRoutes.delete(
  "/:taskId/comments/:commentId",
  describeRoute(deleteTaskCommentRouteDescription),
  withAuth(async (c, userId) => {
    const commentId = c.req.param("commentId");
    await deleteTaskComment(commentId, userId);
    return new Response(null, { status: 204 });
  }, logger),
);
