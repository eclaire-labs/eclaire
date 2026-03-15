import { getModels } from "@eclaire/ai";
import { Hono } from "hono";
import { createChildLogger } from "../lib/logger.js";
import { withAuth } from "../middleware/with-auth.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("models");

export const modelsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/models — List all configured models
modelsRoutes.get(
  "/",
  withAuth(async (c, _userId) => {
    const models = getModels();

    const items = models.map(({ id, model }) => ({
      id,
      name: model.name,
      provider: model.provider,
      capabilities: {
        tools: model.capabilities.tools,
        streaming: model.capabilities.streaming,
        contextWindow: model.capabilities.contextWindow,
        reasoning: model.capabilities.reasoning?.supported ?? false,
        inputModalities: model.capabilities.modalities?.input ?? ["text"],
      },
    }));

    return c.json({ items });
  }, logger),
);
