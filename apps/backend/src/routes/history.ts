import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
import { parseSearchFields } from "../lib/search-params.js";
import {
  countHistory,
  findHistory,
  type HistoryAction,
  type HistoryActor,
  type HistoryItemType,
} from "../lib/services/history.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import { HistorySearchParamsSchema } from "../schemas/history-params.js";
// Import route descriptions
import { getHistoryRouteDescription } from "../schemas/history-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("history");

export const historyRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/history - Get history records for the authenticated user
historyRoutes.get(
  "/",
  describeRoute(getHistoryRouteDescription),
  withAuth(async (c, userId) => {
    const params = HistorySearchParamsSchema.parse(c.req.query());
    const { startDate, endDate } = parseSearchFields(params);

    const historyRecords = await findHistory({
      userId,
      action: params.action as HistoryAction,
      itemType: params.itemType as HistoryItemType,
      actor: params.actor as HistoryActor,
      startDate,
      endDate,
      limit: params.limit,
      offset: params.offset,
    });

    const totalCount = await countHistory({
      userId,
      action: params.action as HistoryAction,
      itemType: params.itemType as HistoryItemType,
      actor: params.actor as HistoryActor,
      startDate,
      endDate,
    });

    return c.json({
      items: historyRecords,
      totalCount,
      limit: params.limit,
      offset: params.offset,
    });
  }, logger),
);
