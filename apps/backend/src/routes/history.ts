import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "@/lib/auth-utils";
import {
  countHistory,
  findHistory,
  getHistory,
  type HistoryAction,
  type HistoryActor,
  type HistoryItemType,
} from "@/lib/services/history";

// Import schemas
import { HistorySearchParamsSchema } from "@/schemas/history-params";

// Import route descriptions
import { getHistoryRouteDescription } from "@/schemas/history-routes";
import type { RouteVariables } from "@/types/route-variables";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("history");

export const historyRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/history - Get history records for the authenticated user
historyRoutes.get("/", describeRoute(getHistoryRouteDescription), async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const queryParams = c.req.query();

    // If no query parameters, return basic history
    if (Object.keys(queryParams).length === 0) {
      const historyRecords = await getHistory(userId);
      return c.json({
        records: historyRecords,
        totalCount: historyRecords.length,
        limit: historyRecords.length,
        offset: 0,
        hasMore: false,
      });
    }

    // Parse and validate query parameters for filtering
    try {
      const params = HistorySearchParamsSchema.parse({
        action: queryParams.action || undefined,
        itemType: queryParams.itemType || undefined,
        actor: queryParams.actor || undefined,
        startDate: queryParams.startDate || undefined,
        endDate: queryParams.endDate || undefined,
        limit: queryParams.limit || 50,
        offset: queryParams.offset || 0,
      });

      // Parse dates if provided
      const startDate = params.startDate
        ? new Date(params.startDate)
        : undefined;
      const endDate = params.endDate ? new Date(params.endDate) : undefined;

      // Search history with filters
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

      // Get total count for pagination
      const totalCount = await countHistory({
        userId,
        action: params.action as HistoryAction,
        itemType: params.itemType as HistoryItemType,
        actor: params.actor as HistoryActor,
        startDate,
        endDate,
      });

      const limit = params.limit || 50;
      const offset = params.offset || 0;

      return c.json({
        records: historyRecords,
        totalCount,
        limit,
        offset,
        hasMore: offset + limit < totalCount,
      });
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid filter parameters", details: error.issues },
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
      "Error getting history records:",
    );
    return c.json({ error: "Failed to fetch history records" }, 500);
  }
});
