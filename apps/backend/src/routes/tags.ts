import { Hono } from "hono";
import { createChildLogger } from "../lib/logger.js";
import { type EntityType, findUserTags } from "../lib/services/tags.js";
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
