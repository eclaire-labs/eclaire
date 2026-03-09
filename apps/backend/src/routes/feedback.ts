import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { createChildLogger } from "../lib/logger.js";
import { createFeedback } from "../lib/services/feedback.js";
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

// Route descriptions for OpenAPI
const postFeedbackRouteDescription = {
  summary: "Submit feedback",
  description: "Submit user feedback with optional sentiment",
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

    const feedback = await createFeedback(data, userId, { userId, actor: "user" });

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
