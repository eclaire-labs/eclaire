import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describeRoute } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
import {
  PromptProcessingError,
  processPromptStreamWithHistory,
  processPromptWithHistory,
  resolveEffectiveUserId,
  validatePromptRequest,
} from "../lib/services/prompt.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import { PromptRequestSchema } from "../schemas/prompt-params.js";
import { postPromptRouteDescription } from "../schemas/prompt-routes.js";
import { StreamPromptRequestSchema } from "../schemas/prompt-stream-params.js";
import { postPromptStreamRouteDescription } from "../schemas/prompt-stream-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("prompt");

export const promptRoutes = new Hono<{ Variables: RouteVariables }>();

// POST /api/prompt - Process AI prompt requests
promptRoutes.post(
  "/",
  describeRoute(postPromptRouteDescription),
  withAuth(async (c, authenticatedUserId) => {
    const requestId = c.get("requestId");
    logger.info({ requestId }, "Request received");

    const bodyData = await c.req.json();
    const body = PromptRequestSchema.parse(bodyData);

    // Resolve effective user ID (handles targetUserId for AI assistant)
    const userResult = resolveEffectiveUserId(
      authenticatedUserId,
      body.targetUserId,
    );
    if ("error" in userResult) {
      logger.warn(
        { requestId, authenticatedUserId, targetUserId: body.targetUserId },
        "Non-AI assistant attempted to specify targetUserId",
      );
      return c.json({ error: userResult.error }, userResult.code);
    }
    const effectiveUserId = userResult.userId;

    // Validate request
    const validation = validatePromptRequest(body);
    if (!validation.valid) {
      logger.warn({ requestId, userId: effectiveUserId }, validation.error);
      return c.json(
        { error: validation.error, message: validation.message },
        validation.code as ContentfulStatusCode,
      );
    }

    // Log context if present
    if (body.context) {
      logger.info(
        {
          requestId,
          userId: effectiveUserId,
          agent: body.context.agent,
          assetCount: body.context.assets?.length || 0,
        },
        "Request includes context",
      );
    }

    // Process prompt - PromptProcessingError needs custom response shape
    try {
      const result = await processPromptWithHistory({
        body,
        effectiveUserId,
        requestId,
      });

      logger.info({ requestId, userId: effectiveUserId }, "Returning response");
      return c.json({ status: "OK", ...result });
    } catch (error) {
      if (error instanceof PromptProcessingError) {
        logger.error(
          { requestId, error: error.message },
          "Prompt processing error",
        );
        return c.json(
          {
            type: "text_response",
            error: error.message,
            response:
              "An error occurred while processing your prompt with the AI service. Please try again later.",
          },
          error.code as ContentfulStatusCode,
        );
      }
      throw error;
    }
  }, logger),
);

// POST /api/prompt/stream - Process AI prompt requests with streaming
promptRoutes.post(
  "/stream",
  describeRoute(postPromptStreamRouteDescription),
  withAuth(async (c, authenticatedUserId) => {
    const requestId = c.get("requestId");
    logger.info({ requestId }, "Streaming request received");

    const bodyData = await c.req.json();
    const body = StreamPromptRequestSchema.parse(bodyData);

    // Resolve effective user ID
    const userResult = resolveEffectiveUserId(
      authenticatedUserId,
      body.targetUserId,
    );
    if ("error" in userResult) {
      logger.warn(
        { requestId, authenticatedUserId, targetUserId: body.targetUserId },
        "Non-AI assistant attempted to specify targetUserId in streaming",
      );
      return c.json({ error: userResult.error }, userResult.code);
    }
    const effectiveUserId = userResult.userId;

    // Validate request
    const validation = validatePromptRequest(body);
    if (!validation.valid) {
      logger.warn(
        { requestId, userId: effectiveUserId },
        `Streaming validation failed: ${validation.error}`,
      );
      return c.json(
        { error: validation.error, message: validation.message },
        validation.code as ContentfulStatusCode,
      );
    }

    // Log context if present
    if (body.context) {
      logger.info(
        {
          requestId,
          userId: effectiveUserId,
          agent: body.context.agent,
          assetCount: body.context.assets?.length || 0,
        },
        "Streaming request includes context",
      );
    }

    // Process streaming prompt
    const sseStream = await processPromptStreamWithHistory({
      body,
      effectiveUserId,
      requestId,
    });

    logger.info(
      { requestId, userId: effectiveUserId },
      "Returning streaming response",
    );

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }, logger),
);
