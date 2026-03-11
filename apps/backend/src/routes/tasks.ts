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
  createTask,
  deleteTask,
  findTasksPaginated,
  getTaskById,
  reprocessTask,
  updateTask,
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
  putTaskCommentRouteDescription,
  putTaskRouteDescription,
} from "../schemas/tasks-routes.js";
import type { RouteVariables } from "../types/route-variables.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";

const logger = createChildLogger("tasks");

/** Converts nullable fields to undefined for service layer compatibility. */
function toTaskServiceData<
  T extends {
    description?: string | null;
    dueDate?: string | null;
    cronExpression?: string | null;
    recurrenceEndDate?: string | null;
  },
>(data: T) {
  return {
    ...data,
    description: data.description || undefined,
    dueDate: data.dueDate || undefined,
    cronExpression: data.cronExpression || undefined,
    recurrenceEndDate: data.recurrenceEndDate || undefined,
  };
}

export const tasksRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/tasks - Get all tasks or search tasks
tasksRoutes.get(
  "/",
  describeRoute(getTasksRouteDescription),
  zValidator("query", TaskSearchParamsSchema),
  withAuth(async (c, userId) => {
    const params = c.req.valid("query");
    const { tags, startDate, endDate, dueDateStart, dueDateEnd } =
      parseSearchFields(params);

    const result = await findTasksPaginated({
      userId,
      text: params.text,
      tags,
      status: params.status,
      priority: params.priority,
      startDate,
      endDate,
      limit: params.limit,
      cursor: params.cursor,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      dueDateStart,
      dueDateEnd,
      parentId: params.parentId,
      topLevelOnly: params.topLevelOnly === "true",
    });

    return c.json(result);
  }, logger),
);

// POST /api/tasks - Create a new task
tasksRoutes.post(
  "/",
  describeRoute(postTasksRouteDescription),
  zValidator("json", TaskSchema),
  withAuth(async (c, userId) => {
    const validatedData = c.req.valid("json");
    const newTask = await createTask(toTaskServiceData(validatedData), {
      userId,
      actor: "user",
    });
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
  zValidator("json", TaskSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedTask = await updateTask(id, toTaskServiceData(validatedData), {
      userId,
      actor: "user",
    });
    if (!updatedTask) throw new NotFoundError("Task");
    return c.json(updatedTask);
  }, logger),
);

// PATCH /api/tasks/:id - Update a task (partial update)
tasksRoutes.patch(
  "/:id",
  describeRoute(patchTaskRouteDescription),
  zValidator("json", PartialTaskSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedTask = await updateTask(id, toTaskServiceData(validatedData), {
      userId,
      actor: "user",
    });
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
    const success = await deleteTask(id, userId, { userId, actor: "user" });
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
    const newComment = await createTaskComment(
      { taskId, content },
      { userId, actor: "user" },
    );
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
      { userId, actor: "user" },
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
    await deleteTaskComment(commentId, { userId, actor: "user" });
    return new Response(null, { status: 204 });
  }, logger),
);
