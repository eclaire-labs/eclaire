import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { getCurrentModelConfig } from "@/lib/ai-client";
import { createChildLogger } from "@/lib/logger";
import { getCurrentModelRouteDescription } from "@/schemas/model-routes";
import type { RouteVariables } from "@/types/route-variables";

const logger = createChildLogger("model");

export const modelRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/model/ - Get current active model configuration
modelRoutes.get(
  "/",
  describeRoute(getCurrentModelRouteDescription),
  async (c) => {
    const requestId = c.get("requestId");
    logger.info({ requestId }, "Current model config request received");

    try {
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
          modelShortName: modelConfig.modelShortName,
        },
        "Returning current model configuration",
      );

      return c.json(modelConfig);
    } catch (error) {
      logger.error(
        {
          requestId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error retrieving current model configuration",
      );

      return c.json(
        {
          error: "Internal server error",
          message: "An error occurred while retrieving the model configuration",
        },
        500,
      );
    }
  },
);
