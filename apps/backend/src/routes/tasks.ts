import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { count, eq, sql } from "drizzle-orm";
import z from "zod/v4";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { parseSearchFields } from "../lib/search-params.js";
import { db, schema } from "../db/index.js";
import {
  createTaskComment,
  deleteTaskComment,
  getTaskComments,
  updateTaskComment,
} from "../lib/services/taskComments.js";
import {
  approveTask,
  cancelTaskOccurrence,
  createTask,
  deleteTask,
  findTasksPaginated,
  getInbox,
  getTaskById,
  getTaskOccurrences,
  pauseTask,
  reprocessTask,
  requestChanges,
  respondToTask,
  resumeTask,
  retryTask,
  startTask,
  updateTask,
} from "../lib/services/tasks.js";
import { principalCaller } from "../lib/services/types.js";
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
import {
  emitTaskCreated,
  emitTaskUpdated,
  emitTaskDeleted,
  emitTaskStatusChanged,
  emitOccurrenceQueued,
  emitOccurrenceCancelled,
} from "../lib/events/task-events.js";

const logger = createChildLogger("tasks");

/** Converts nullable fields to undefined for service layer compatibility.
 *  Preserves null for delegateActorId (explicitly unassigned) vs undefined (not provided). */
function toTaskServiceData<
  T extends {
    description?: string | null;
    dueDate?: string | null;
    delegateActorId?: string | null;
  },
>(data: T) {
  return {
    ...data,
    delegateActorId:
      "delegateActorId" in data ? (data.delegateActorId ?? null) : undefined,
    description: data.description || undefined,
    dueDate: data.dueDate || undefined,
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
    const {
      tags,
      delegateModes,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    } = parseSearchFields(params);

    const result = await findTasksPaginated({
      userId,
      text: params.text,
      tags,
      taskStatus: params.taskStatus,
      attentionStatus: params.attentionStatus,
      scheduleType: params.scheduleType,
      delegateModes,
      priority: params.priority,
      startDate,
      endDate,
      limit: params.limit,
      cursor: params.cursor,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      dueDateStart,
      dueDateEnd,
    });

    return c.json(result);
  }, logger),
);

// POST /api/tasks - Create a new task
tasksRoutes.post(
  "/",
  describeRoute(postTasksRouteDescription),
  zValidator("json", TaskSchema),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const validatedData = c.req.valid("json");
    const newTask = await createTask(toTaskServiceData(validatedData), caller);
    emitTaskCreated(userId, newTask.id);
    return c.json(newTask, 201);
  }, logger),
);

// GET /api/inbox - Get inbox (attention queue)
tasksRoutes.get(
  "/inbox",
  withAuth(async (c, userId) => {
    const result = await getInbox(userId);
    return c.json(result);
  }, logger),
);

// GET /api/tasks/by-actor - Task counts grouped by delegate actor
tasksRoutes.get(
  "/by-actor",
  withAuth(async (c, userId) => {
    const rows = await db
      .select({
        delegateActorId: schema.tasks.delegateActorId,
        taskStatus: schema.tasks.taskStatus,
        count: count(),
      })
      .from(schema.tasks)
      .where(eq(schema.tasks.userId, userId))
      .groupBy(schema.tasks.delegateActorId, schema.tasks.taskStatus);

    const actorIds = [
      ...new Set(rows.map((r) => r.delegateActorId).filter(Boolean)),
    ] as string[];

    const actorMap = new Map<
      string,
      { displayName: string | null; kind: string }
    >();

    if (actorIds.length > 0) {
      const actorRows = await db
        .select({
          id: schema.actors.id,
          displayName: schema.actors.displayName,
          kind: schema.actors.kind,
        })
        .from(schema.actors)
        .where(sql`${schema.actors.id} IN ${actorIds}`);

      for (const a of actorRows) {
        actorMap.set(a.id, { displayName: a.displayName, kind: a.kind });
      }
    }

    interface ActorSummary {
      actorId: string | null;
      displayName: string | null;
      kind: string;
      counts: Record<string, number>;
      total: number;
    }

    const summaryMap = new Map<string | null, ActorSummary>();

    for (const row of rows) {
      const key = row.delegateActorId;
      let summary = summaryMap.get(key);
      if (!summary) {
        const actor = key ? actorMap.get(key) : null;
        summary = {
          actorId: key,
          displayName: actor?.displayName ?? null,
          kind: actor?.kind ?? "human",
          counts: {},
          total: 0,
        };
        summaryMap.set(key, summary);
      }
      summary.counts[row.taskStatus] = row.count;
      summary.total += row.count;
    }

    const actors = [...summaryMap.values()].sort((a, b) => {
      if (a.kind === "agent" && b.kind !== "agent") return -1;
      if (a.kind !== "agent" && b.kind === "agent") return 1;
      return b.total - a.total;
    });

    return c.json({ actors });
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
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedTask = await updateTask(
      id,
      toTaskServiceData(validatedData),
      caller,
    );
    if (!updatedTask) throw new NotFoundError("Task");
    emitTaskUpdated(userId, id);
    return c.json(updatedTask);
  }, logger),
);

// PATCH /api/tasks/:id - Update a task (partial update)
tasksRoutes.patch(
  "/:id",
  describeRoute(patchTaskRouteDescription),
  zValidator("json", PartialTaskSchema),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedTask = await updateTask(
      id,
      toTaskServiceData(validatedData),
      caller,
    );
    if (!updatedTask) throw new NotFoundError("Task");
    emitTaskUpdated(userId, id);
    return c.json(updatedTask);
  }, logger),
);

// DELETE /api/tasks/:id - Delete a task
tasksRoutes.delete(
  "/:id",
  describeRoute(deleteTaskRouteDescription),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const id = c.req.param("id");
    const success = await deleteTask(id, userId, caller);
    if (!success) throw new NotFoundError("Task");
    emitTaskDeleted(userId, id);
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

// GET /api/tasks/:id/occurrences - Get occurrence history for a task
tasksRoutes.get(
  "/:id/occurrences",
  zValidator(
    "query",
    z.object({
      cursor: z.string().optional(),
      limit: z.coerce.number().min(1).max(100).default(20).optional(),
    }),
  ),
  withAuth(async (c, userId) => {
    const taskId = c.req.param("id");
    const { cursor, limit } = c.req.valid("query");
    const result = await getTaskOccurrences(taskId, userId, { cursor, limit });
    return c.json(result);
  }, logger),
);

// POST /api/tasks/:id/start - Trigger immediate execution
tasksRoutes.post(
  "/:id/start",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const result = await startTask(id, userId);
    emitOccurrenceQueued(userId, id, result.occurrenceId);
    emitTaskStatusChanged(userId, id, { taskStatus: "in_progress" });
    return c.json(result);
  }, logger),
);

// POST /api/tasks/:id/retry - Retry a failed occurrence
tasksRoutes.post(
  "/:id/retry",
  zValidator("json", z.object({ prompt: z.string().optional() }).optional()),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const result = await retryTask(id, userId, body?.prompt);
    emitOccurrenceQueued(userId, id, result.occurrenceId);
    return c.json(result);
  }, logger),
);

// POST /api/tasks/:id/cancel - Cancel current occurrence
tasksRoutes.post(
  "/:id/cancel",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await cancelTaskOccurrence(id, userId);
    emitOccurrenceCancelled(userId, id);
    emitTaskStatusChanged(userId, id);
    return c.json({ success: true });
  }, logger),
);

// POST /api/tasks/:id/pause - Pause recurrence
tasksRoutes.post(
  "/:id/pause",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await pauseTask(id, userId);
    emitTaskStatusChanged(userId, id);
    return c.json({ success: true });
  }, logger),
);

// POST /api/tasks/:id/resume - Resume recurrence
tasksRoutes.post(
  "/:id/resume",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await resumeTask(id, userId);
    emitTaskStatusChanged(userId, id);
    return c.json({ success: true });
  }, logger),
);

// POST /api/tasks/:id/approve - Approve agent result
tasksRoutes.post(
  "/:id/approve",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await approveTask(id, userId);
    emitTaskStatusChanged(userId, id, {
      taskStatus: "completed",
      attentionStatus: "none",
    });
    return c.json({ success: true });
  }, logger),
);

// POST /api/tasks/:id/request-changes - Request changes on agent result
tasksRoutes.post(
  "/:id/request-changes",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await requestChanges(id, userId);
    emitTaskStatusChanged(userId, id, { attentionStatus: "none" });
    return c.json({ success: true });
  }, logger),
);

// POST /api/tasks/:id/respond - Respond to agent question
tasksRoutes.post(
  "/:id/respond",
  zValidator("json", z.object({ response: z.string().min(1) })),
  withAuth(async (c, userId, principal) => {
    const id = c.req.param("id");
    const { response } = c.req.valid("json");
    const caller = principalCaller(principal);
    await respondToTask(id, userId, response, caller);
    emitTaskStatusChanged(userId, id, { attentionStatus: "none" });
    return c.json({ success: true });
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
      }),
    }),
  ),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const taskId = c.req.param("id");
    const { content } = c.req.valid("json");
    const newComment = await createTaskComment({ taskId, content }, caller);

    // Trigger agent run when a human comments on a delegated task
    if (caller.actor === "human") {
      const task = await getTaskById(taskId, userId);
      if (
        task &&
        task.delegateMode !== "manual" &&
        task.delegateActorId &&
        !["running", "queued"].includes(task.latestExecutionStatus ?? "")
      ) {
        const { createTaskOccurrence } = await import(
          "../lib/services/task-occurrences.js"
        );
        await createTaskOccurrence({
          taskId,
          userId,
          kind: "review_run",
          prompt: task.prompt || `Revise the task: ${task.title}`,
          executorActorId: task.delegateActorId,
          requiresReview: task.delegateMode === "assist",
        });
        await db
          .update(schema.tasks)
          .set({
            latestExecutionStatus: "queued",
            updatedAt: new Date(),
          })
          .where(eq(schema.tasks.id, taskId));
        emitTaskUpdated(userId, taskId);
      }
    }

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
      }),
    }),
  ),
  withAuth(async (c, _userId, principal) => {
    const caller = principalCaller(principal);
    const commentId = c.req.param("commentId");
    const { content } = c.req.valid("json");
    const updatedComment = await updateTaskComment(
      commentId,
      { content },
      caller,
    );
    return c.json(updatedComment);
  }, logger),
);

// DELETE /api/tasks/:taskId/comments/:commentId - Delete a comment
tasksRoutes.delete(
  "/:taskId/comments/:commentId",
  describeRoute(deleteTaskCommentRouteDescription),
  withAuth(async (c, _userId, principal) => {
    const caller = principalCaller(principal);
    const commentId = c.req.param("commentId");
    await deleteTaskComment(commentId, caller);
    return new Response(null, { status: 204 });
  }, logger),
);
