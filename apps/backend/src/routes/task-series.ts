/**
 * Task Series API Routes
 */

import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { createChildLogger } from "../lib/logger.js";
import { NotFoundError } from "../lib/errors.js";
import {
  cancelTaskSeries,
  getTaskSeries,
  listTaskSeries,
  pauseTaskSeries,
  resumeTaskSeries,
} from "../lib/services/task-series.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("task-series-routes");

export const taskSeriesRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/task-series - List task series
taskSeriesRoutes.get(
  "/",
  zValidator(
    "query",
    z.object({
      status: z.enum(["active", "paused", "completed", "cancelled"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional().default(50),
      offset: z.coerce.number().int().min(0).optional().default(0),
    }),
  ),
  withAuth(async (c, userId) => {
    const params = c.req.valid("query");
    const results = await listTaskSeries(userId, {
      status: params.status,
      limit: params.limit,
      offset: params.offset,
    });
    return c.json({ data: results });
  }, logger),
);

// GET /api/task-series/:id - Get a task series
taskSeriesRoutes.get(
  "/:id",
  withAuth(async (c, userId) => {
    const series = await getTaskSeries(c.req.param("id"), userId);
    if (!series) throw new NotFoundError("Task series");
    return c.json(series);
  }, logger),
);

// POST /api/task-series/:id/pause - Pause a task series
taskSeriesRoutes.post(
  "/:id/pause",
  withAuth(async (c, userId) => {
    await pauseTaskSeries(c.req.param("id"), userId);
    return c.json({ message: "Task series paused" });
  }, logger),
);

// POST /api/task-series/:id/resume - Resume a task series
taskSeriesRoutes.post(
  "/:id/resume",
  withAuth(async (c, userId) => {
    await resumeTaskSeries(c.req.param("id"), userId);
    return c.json({ message: "Task series resumed" });
  }, logger),
);

// DELETE /api/task-series/:id - Cancel and delete a task series
taskSeriesRoutes.delete(
  "/:id",
  withAuth(async (c, userId) => {
    await cancelTaskSeries(c.req.param("id"), userId);
    return new Response(null, { status: 204 });
  }, logger),
);
