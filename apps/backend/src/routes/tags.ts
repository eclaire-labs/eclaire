import { Hono } from "hono";
import { createChildLogger } from "../lib/logger.js";
import {
  type EntityType,
  findPopularTags,
  findUserTags,
} from "../lib/services/tags.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("tags");

const VALID_TYPES = new Set<EntityType>([
  "bookmarks",
  "documents",
  "notes",
  "photos",
  "tasks",
]);

export const tagsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/tags - Get all tag names for the current user
// Optional query param: ?type=bookmarks (filter to tags used by entity type)
tagsRoutes.get(
  "/",
  withAuth(async (c, userId) => {
    const rawType = c.req.query("type");
    const type =
      rawType && VALID_TYPES.has(rawType as EntityType)
        ? (rawType as EntityType)
        : undefined;

    const tagNames = await findUserTags(userId, type);
    return c.json(tagNames);
  }, logger),
);

// GET /api/tags/popular - Get the most popular tags by usage count
// Optional query param: ?limit=10 (default 10, max 50)
tagsRoutes.get(
  "/popular",
  withAuth(async (c, userId) => {
    const rawLimit = c.req.query("limit");
    const limit = Math.max(1, Math.min(50, Number(rawLimit) || 10));

    const popularTags = await findPopularTags(userId, limit);
    return c.json(popularTags);
  }, logger),
);
