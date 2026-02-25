import { getCurrentModelConfig } from "@eclaire/ai";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
import { withAuth } from "../middleware/with-auth.js";
import { getCurrentModelRouteDescription } from "../schemas/model-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("model");

export const modelRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/model/ - Get current active model configuration
modelRoutes.get(
  "/",
  describeRoute(getCurrentModelRouteDescription),
  withAuth(async (c, _userId) => {
    const requestId = c.get("requestId");
    logger.info({ requestId }, "Current model config request received");

    const modelConfig = getCurrentModelConfig("backend");

    if (!modelConfig) {
      logger.warn(
        { requestId },
        "Failed to retrieve current model configuration",
      );
      return c.json(
        {
          error: "Configuration error",
          message: "Unable to retrieve current model configuration",
        },
        500,
      );
    }

    logger.info(
      {
        requestId,
        provider: modelConfig.provider,
        providerModel: modelConfig.providerModel,
      },
      "Returning current model configuration",
    );

    return c.json(modelConfig);
  }, logger),
);
