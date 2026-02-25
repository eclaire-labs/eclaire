import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { createChildLogger } from "../lib/logger.js";
import {
  countUserFeedback,
  createFeedback,
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

const FeedbackQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// Route descriptions for OpenAPI
const postFeedbackRouteDescription = {
  summary: "Submit feedback",
  description: "Submit user feedback with optional sentiment",
  tags: ["feedback"],
};

const getFeedbackRouteDescription = {
  summary: "Get user feedback",
  description: "Get feedback entries for the authenticated user",
  tags: ["feedback"],
};

export const feedbackRoutes = new Hono<{ Variables: RouteVariables }>();

// POST /api/feedback - Submit feedback
feedbackRoutes.post(
  "/",
  describeRoute(postFeedbackRouteDescription),
  zValidator("json", CreateFeedbackSchema),
  withAuth(async (c, userId) => {
    const data = c.req.valid("json");

    logger.info({ userId, data }, "Creating feedback");

    const feedback = await createFeedback(data, userId);

    return c.json(
      {
        id: feedback.id,
        description: feedback.description,
        sentiment: feedback.sentiment,
        createdAt: feedback.createdAt.toISOString(),
      },
      201,
    );
  }, logger),
);

// GET /api/feedback - Get user feedback
feedbackRoutes.get(
  "/",
  describeRoute(getFeedbackRouteDescription),
  zValidator("query", FeedbackQuerySchema),
  withAuth(async (c, userId) => {
    const { limit, offset } = c.req.valid("query");

    logger.info({ userId, limit, offset }, "Getting user feedback");

    const [feedback, total] = await Promise.all([
      getUserFeedback(userId, limit, offset),
      countUserFeedback(userId),
    ]);

    return c.json({
      feedback: feedback.map((f) => ({
        id: f.id,
        description: f.description,
        sentiment: f.sentiment,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      total,
      limit,
      offset,
    });
  }, logger),
);
