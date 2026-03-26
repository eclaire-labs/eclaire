/**
 * Scheduled Actions API Routes
 */

import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
import {
  cancelScheduledAction,
  createScheduledAction,
  deleteScheduledAction,
  getScheduledAction,
  listExecutions,
  listScheduledActions,
} from "../lib/services/scheduled-actions.js";
import { withAuth } from "../middleware/with-auth.js";
import {
  ScheduledActionSchema,
  ScheduledActionSearchParamsSchema,
} from "../schemas/scheduled-action-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("scheduled-actions-routes");

export const scheduledActionsRoutes = new Hono<{
  Variables: RouteVariables;
}>();

// GET /api/scheduled-actions - List scheduled actions
scheduledActionsRoutes.get(
  "/",
  zValidator("query", ScheduledActionSearchParamsSchema),
  withAuth(async (c, userId) => {
    const params = c.req.valid("query");
    const results = await listScheduledActions(userId, {
      status: params.status,
      kind: params.kind,
      limit: params.limit,
      offset: params.offset,
    });
    return c.json({ data: results });
  }, logger),
);

// POST /api/scheduled-actions - Create a scheduled action
scheduledActionsRoutes.post(
  "/",
  zValidator("json", ScheduledActionSchema),
  withAuth(async (c, userId) => {
    const body = c.req.valid("json");
    try {
      const result = await createScheduledAction({
        userId,
        ...body,
      });
      return c.json(result, 201);
    } catch (error) {
      if (error instanceof Error && error.message.includes("required")) {
        return c.json({ error: error.message }, 400);
      }
      throw error;
    }
  }, logger),
);

// GET /api/scheduled-actions/:id - Get a scheduled action
scheduledActionsRoutes.get(
  "/:id",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const action = await getScheduledAction(id, userId);
    if (!action) {
      return c.json({ error: "Scheduled action not found" }, 404);
    }
    return c.json(action);
  }, logger),
);

// DELETE /api/scheduled-actions/:id - Cancel and delete a scheduled action
scheduledActionsRoutes.delete(
  "/:id",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    try {
      await deleteScheduledAction(id, userId);
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Scheduled action not found" }, 404);
      }
      throw error;
    }
  }, logger),
);

// POST /api/scheduled-actions/:id/cancel - Cancel a scheduled action
scheduledActionsRoutes.post(
  "/:id/cancel",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    try {
      await cancelScheduledAction(id, userId);
      return c.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message.includes("not found")) {
        return c.json({ error: "Scheduled action not found" }, 404);
      }
      throw error;
    }
  }, logger),
);

// GET /api/scheduled-actions/:id/executions - Get execution history
scheduledActionsRoutes.get(
  "/:id/executions",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const executions = await listExecutions(id, userId);
    return c.json({ data: executions });
  }, logger),
);
