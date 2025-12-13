import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import {
  countUserFeedback,
  createFeedback,
  getUserFeedback,
} from "../lib/services/feedback.js";
import type { RouteVariables } from "../types/route-variables.js";
import { createChildLogger } from "../lib/logger.js";

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
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

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
    } catch (error) {
      logger.error({ err: error }, "Failed to create feedback");
      return c.json({ error: "Failed to create feedback" }, 500);
    }
  },
);

// GET /api/feedback - Get user feedback
feedbackRoutes.get(
  "/",
  describeRoute(getFeedbackRouteDescription),
  zValidator("query", FeedbackQuerySchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

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
    } catch (error) {
      logger.error({ err: error }, "Failed to get feedback");
      return c.json({ error: "Failed to get feedback" }, 500);
    }
  },
);
