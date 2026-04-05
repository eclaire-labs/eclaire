import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { createChildLogger } from "../lib/logger.js";
import { findPopularTags, findUserTags } from "../lib/services/tags.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("tags");

const TagsQuerySchema = z.object({
  type: z
    .enum(["bookmarks", "documents", "media", "notes", "photos", "tasks"])
    .optional(),
});

const PopularTagsQuerySchema = z.object({
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .pipe(z.number().min(1).max(50))
    .optional(),
});

export const tagsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/tags - Get all tag names for the current user
tagsRoutes.get(
  "/",
  zValidator("query", TagsQuerySchema),
  withAuth(async (c, userId) => {
    const { type } = c.req.valid("query");

    const tagNames = await findUserTags(userId, type);
    return c.json({ items: tagNames });
  }, logger),
);

// GET /api/tags/popular - Get the most popular tags by usage count
tagsRoutes.get(
  "/popular",
  zValidator("query", PopularTagsQuerySchema),
  withAuth(async (c, userId) => {
    const query = c.req.valid("query");
    const limit = query.limit ?? 10;

    const popularTags = await findPopularTags(userId, limit);
    return c.json({ items: popularTags });
  }, logger),
);
