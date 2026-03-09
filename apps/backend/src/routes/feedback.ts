import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import {
  countUserFeedback,
  createFeedback,
  getFeedbackById,
  getUserFeedback,
} from "../lib/services/feedback.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("feedback");

// Schemas
const CreateFeedbackSchema = z.object({
  description: z
    .string()
    .min(1, "Description is required")
    .max(2000, "Description too long"),
  sentiment: z.enum(["positive", "negative"]).nullable().optional(),
});

const ListFeedbackQuerySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// Route descriptions for OpenAPI
const postFeedbackRouteDescription = {
  summary: "Submit feedback",
  description: "Submit user feedback with optional sentiment",
  tags: ["feedback"],
};

export const feedbackRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/feedback - List user's feedback
feedbackRoutes.get(
  "/",
  zValidator("query", ListFeedbackQuerySchema),
  withAuth(async (c, userId) => {
    const query = c.req.valid("query");
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [items, totalCount] = await Promise.all([
      getUserFeedback(userId, limit, offset),
      countUserFeedback(userId),
    ]);

    return c.json({ items, totalCount, limit, offset });
  }, logger),
);

// POST /api/feedback - Submit feedback
feedbackRoutes.post(
  "/",
  describeRoute(postFeedbackRouteDescription),
  zValidator("json", CreateFeedbackSchema),
  withAuth(async (c, userId) => {
    const data = c.req.valid("json");

    logger.info({ userId, data }, "Creating feedback");

    const feedback = await createFeedback(data, userId, {
      userId,
      actor: "user",
    });

    return c.json(feedback, 201);
  }, logger),
);

// GET /api/feedback/:id - Get a single feedback entry
feedbackRoutes.get(
  "/:id",
  withAuth(async (c, _userId) => {
    const id = c.req.param("id");
    const feedback = await getFeedbackById(id);

    if (!feedback) {
      throw new NotFoundError("Feedback");
    }

    return c.json(feedback);
  }, logger),
);
