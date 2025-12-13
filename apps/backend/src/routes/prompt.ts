import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
import { isValidConversationId } from "@eclaire/core";
import { recordHistory } from "../lib/services/history.js";
import {
  ConversationNotFoundError,
  processPromptRequest,
  processPromptRequestStream,
  type StreamEvent,
} from "../lib/services/prompt.js";

// Import schemas
import { PromptRequestSchema } from "../schemas/prompt-params.js";
import { postPromptRouteDescription } from "../schemas/prompt-routes.js";
import { StreamPromptRequestSchema } from "../schemas/prompt-stream-params.js";
import { postPromptStreamRouteDescription } from "../schemas/prompt-stream-routes.js";
import type { RouteVariables } from "../types/route-variables.js";
import { createChildLogger } from "../lib/logger.js";

const logger = createChildLogger("prompt");

export const promptRoutes = new Hono<{ Variables: RouteVariables }>();

// POST /api/prompt - Process AI prompt requests
promptRoutes.post("/", describeRoute(postPromptRouteDescription), async (c) => {
  const requestId = c.get("requestId");
  logger.info({ requestId }, "Request received");

  const authenticatedUserId = await getAuthenticatedUserId(c);
  if (!authenticatedUserId) {
    logger.warn({ requestId }, "Unauthorized access attempt");
    return c.json({ error: "Unauthorized" }, 401);
  }

  logger.info(
    { requestId, userId: authenticatedUserId },
    "Authenticated user request",
  );

  // Determine the effective user ID for tool execution (declare at function scope)
  let effectiveUserId = authenticatedUserId;

  try {
    const bodyData = await c.req.json();
    logger.debug(
      { requestId, userId: authenticatedUserId },
      "Request body parsed",
    );

    // Validate request body
    const body = PromptRequestSchema.parse(bodyData);

    // Update the effective user ID if targetUserId is provided
    effectiveUserId = authenticatedUserId;

    // If targetUserId is provided, validate that the authenticated user is the AI assistant
    if (body.targetUserId) {
      // Check if the authenticated user is the AI assistant
      const isAIAssistant = authenticatedUserId === "user-ai-assistant"; // TODO: Make this configurable

      if (!isAIAssistant) {
        logger.warn(
          {
            requestId,
            authenticatedUserId,
            targetUserId: body.targetUserId,
          },
          "Non-AI assistant user attempted to specify targetUserId",
        );
        return c.json(
          { error: "Unauthorized: Only AI assistant can specify targetUserId" },
          403,
        );
      }

      // Use the target user ID for tool execution
      effectiveUserId = body.targetUserId;
      logger.info(
        {
          requestId,
          authenticatedUserId,
          effectiveUserId: body.targetUserId,
        },
        "AI assistant request on behalf of user",
      );
    }

    // Log context information
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

    if (body.trace) {
      logger.info(
        {
          requestId,
          userId: effectiveUserId,
          traceEnabled: body.trace,
        },
        "Request includes trace parameter",
      );
    }

    if (
      (!body.prompt || body.prompt.trim() === "") &&
      (!body.content ||
        (Array.isArray(body.content) && body.content.length === 0))
    ) {
      logger.warn(
        { requestId, userId: effectiveUserId },
        "Invalid request: Missing 'prompt' or 'content'",
      );
      return c.json(
        {
          error: "Invalid request",
          message: "Request must include either 'prompt' or 'content' or both",
        },
        400,
      );
    }

    // Validate conversation ID format if provided
    if (body.conversationId && !isValidConversationId(body.conversationId)) {
      logger.warn(
        {
          requestId,
          userId: effectiveUserId,
          conversationId: body.conversationId,
        },
        "Invalid conversation ID format",
      );
      return c.json({ error: "Invalid conversation ID" }, 400);
    }

    if (body.content) {
      const contentArray = Array.isArray(body.content)
        ? body.content
        : [body.content];
      for (const item of contentArray) {
        if (item.data && item.data.length > 10 * 1024 * 1024) {
          logger.warn(
            {
              requestId,
              userId: effectiveUserId,
              contentSize: item.data.length,
            },
            "Content too large",
          );
          return c.json(
            {
              error: "Content too large",
              message:
                "The content data exceeds the maximum size limit of 10MB",
            },
            413,
          );
        }
      }
    }

    if (body.prompt) {
      logger.info(
        { requestId, userId: effectiveUserId },
        "Processing prompt with AI",
      );

      try {
        const result = await processPromptRequest(
          effectiveUserId,
          body.prompt,
          body.context,
          requestId,
          body.trace,
          body.conversationId,
          body.enableThinking,
        );

        // Capture request body in trace if enabled
        if (result.trace) {
          result.trace.requestBody = bodyData;
        }

        const responsePayload = {
          status: "OK",
          requestId: result.requestId,
          type: result.type,
          response: result.response,
          ...(result.conversationId && {
            conversationId: result.conversationId,
          }),
          ...(result.thinkingContent && {
            thinkingContent: result.thinkingContent,
          }),
          ...(result.toolCalls && { toolCalls: result.toolCalls }),
          ...(body.trace && result.trace && { trace: result.trace }),
        };

        logger.info(
          { requestId, userId: effectiveUserId },
          "Recording history for text response",
        );
        await recordHistory({
          action: "ai_prompt_text_response",
          itemType: "prompt",
          itemId: responsePayload.requestId,
          itemName: "AI Text Response",
          beforeData: { prompt: body.prompt, deviceInfo: body.deviceInfo },
          afterData: responsePayload,
          actor: "assistant",
          userId: effectiveUserId,
        });

        logger.info(
          { requestId, userId: effectiveUserId },
          "Returning text JSON response",
        );
        return c.json(responsePayload);
      } catch (aiError) {
        // Handle conversation not found errors specifically
        if (aiError instanceof ConversationNotFoundError) {
          logger.warn(
            {
              requestId,
              userId: effectiveUserId,
              conversationId: body.conversationId,
            },
            "Conversation not found or access denied",
          );
          return c.json({ error: "Conversation not found" }, 404);
        }

        logger.error(
          {
            requestId,
            userId: effectiveUserId,
            error: aiError instanceof Error ? aiError.message : "Unknown error",
            stack: aiError instanceof Error ? aiError.stack : undefined,
          },
          "Error processing prompt request",
        );

        const errorResponse = {
          type: "text_response",
          error: "AI service error",
          response:
            "An error occurred while processing your prompt with the AI service. Please try again later.",
        };
        try {
          await recordHistory({
            action: "ai_prompt_error",
            itemType: "api_error",
            itemId: `err_ai_outer_${Date.now()}`,
            itemName: "AI Prompt Processing Error",
            beforeData: { prompt: body.prompt, deviceInfo: body.deviceInfo },
            afterData: {
              error:
                aiError instanceof Error ? aiError.message : String(aiError),
              response: errorResponse,
            },
            actor: "system",
            userId: effectiveUserId,
          });
        } catch (historyError) {
          logger.error(
            {
              requestId,
              userId: effectiveUserId,
              error:
                historyError instanceof Error
                  ? historyError.message
                  : "Unknown error",
              stack:
                historyError instanceof Error ? historyError.stack : undefined,
            },
            "Failed to record AI error in history",
          );
        }
        return c.json(errorResponse, 502);
      }
    }

    logger.info(
      { requestId, userId: effectiveUserId },
      "No prompt provided, acknowledging content receipt",
    );
    const response = {
      status: "OK",
      requestId: `req_content_${Date.now()}`,
      type: "text_response",
      response: "Content received and acknowledged.",
      processed: true,
    };

    logger.info(
      { requestId, userId: effectiveUserId },
      "Recording history for content-only request",
    );
    await recordHistory({
      action: "api_content_upload",
      itemType: "content_submission",
      itemId: response.requestId,
      itemName: "Content Submission (No Prompt)",
      beforeData: {
        contentSummary: "Content provided without prompt",
        deviceInfo: body.deviceInfo,
      },
      afterData: response,
      actor: "user",
      userId: effectiveUserId,
    });

    logger.info(
      { requestId, userId: effectiveUserId },
      "Returning response for content-only request",
    );
    return c.json(response);
  } catch (error) {
    logger.error(
      {
        requestId,
        userId: effectiveUserId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Top-level error processing request",
    );

    if (error instanceof z.ZodError) {
      return c.json(
        {
          error: "Invalid request format",
          message: "Request body validation failed",
          details: error.issues,
        },
        400,
      );
    }

    const errorResponse = {
      type: "text_response",
      error: "Internal server error",
      response:
        "An unexpected error occurred while processing your request. Please try again later.",
    };
    try {
      await recordHistory({
        action: "api_error_general",
        itemType: "api_error",
        itemId: `err_gen_top_${Date.now()}`,
        itemName: "General Prompt API Top-Level Error",
        beforeData: {
          errorInfo:
            "Request body might be unparsable or other top-level issue",
        },
        afterData: {
          error: error instanceof Error ? error.message : String(error),
          response: errorResponse,
        },
        actor: "system",
        userId: effectiveUserId || "unknown",
      });
    } catch (historyError) {
      logger.error(
        {
          requestId,
          userId: effectiveUserId,
          error:
            historyError instanceof Error
              ? historyError.message
              : "Unknown error",
          stack: historyError instanceof Error ? historyError.stack : undefined,
        },
        "Failed to record general top-level error in history",
      );
    }
    return c.json(errorResponse, 500);
  }
});

// POST /api/prompt/stream - Process AI prompt requests with streaming
promptRoutes.post(
  "/stream",
  describeRoute(postPromptStreamRouteDescription),
  async (c) => {
    const requestId = c.get("requestId");
    logger.info({ requestId }, "Streaming request received");

    const authenticatedUserId = await getAuthenticatedUserId(c);
    if (!authenticatedUserId) {
      logger.warn({ requestId }, "Unauthorized streaming access attempt");
      return c.json({ error: "Unauthorized" }, 401);
    }

    logger.info(
      { requestId, userId: authenticatedUserId },
      "Authenticated user streaming request",
    );

    // Determine the effective user ID for tool execution
    let effectiveUserId = authenticatedUserId;

    try {
      const bodyData = await c.req.json();
      logger.debug(
        { requestId, userId: authenticatedUserId },
        "Streaming request body parsed",
      );

      // Validate request body for streaming
      const body = StreamPromptRequestSchema.parse(bodyData);

      // Update the effective user ID if targetUserId is provided
      effectiveUserId = authenticatedUserId;

      // If targetUserId is provided, validate that the authenticated user is the AI assistant
      if (body.targetUserId) {
        // Check if the authenticated user is the AI assistant
        const isAIAssistant = authenticatedUserId === "user-ai-assistant"; // TODO: Make this configurable

        if (!isAIAssistant) {
          logger.warn(
            {
              requestId,
              authenticatedUserId,
              targetUserId: body.targetUserId,
            },
            "Non-AI assistant user attempted to specify targetUserId in streaming",
          );
          return c.json(
            {
              error: "Unauthorized: Only AI assistant can specify targetUserId",
            },
            403,
          );
        }

        // Use the target user ID for tool execution
        effectiveUserId = body.targetUserId;
        logger.info(
          {
            requestId,
            authenticatedUserId,
            effectiveUserId: body.targetUserId,
          },
          "AI assistant streaming request on behalf of user",
        );
      }

      // Log context information
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

      if (body.trace) {
        logger.info(
          {
            requestId,
            userId: effectiveUserId,
            traceEnabled: body.trace,
          },
          "Streaming request includes trace parameter",
        );
      }

      if (
        (!body.prompt || body.prompt.trim() === "") &&
        (!body.content ||
          (Array.isArray(body.content) && body.content.length === 0))
      ) {
        logger.warn(
          { requestId, userId: effectiveUserId },
          "Invalid streaming request: Missing 'prompt' or 'content'",
        );
        return c.json(
          {
            error: "Invalid request",
            message:
              "Request must include either 'prompt' or 'content' or both",
          },
          400,
        );
      }

      // Validate conversation ID format if provided
      if (body.conversationId && !isValidConversationId(body.conversationId)) {
        logger.warn(
          {
            requestId,
            userId: effectiveUserId,
            conversationId: body.conversationId,
          },
          "Invalid conversation ID format in streaming request",
        );
        return c.json({ error: "Invalid conversation ID" }, 400);
      }

      if (body.content) {
        const contentArray = Array.isArray(body.content)
          ? body.content
          : [body.content];
        for (const item of contentArray) {
          if (item.data && item.data.length > 10 * 1024 * 1024) {
            logger.warn(
              {
                requestId,
                userId: effectiveUserId,
                contentSize: item.data.length,
              },
              "Content too large in streaming request",
            );
            return c.json(
              {
                error: "Content too large",
                message:
                  "The content data exceeds the maximum size limit of 10MB",
              },
              413,
            );
          }
        }
      }

      if (body.prompt) {
        logger.info(
          { requestId, userId: effectiveUserId },
          "Processing streaming prompt with AI",
        );

        try {
          // Set up Server-Sent Events headers
          c.header("Content-Type", "text/event-stream");
          c.header("Cache-Control", "no-cache");
          c.header("Connection", "keep-alive");
          c.header("Access-Control-Allow-Origin", "*");
          c.header("Access-Control-Allow-Headers", "*");

          // Create the streaming response
          const streamingResult = await processPromptRequestStream(
            effectiveUserId,
            body.prompt,
            body.context,
            requestId,
            body.trace,
            body.conversationId,
            body.enableThinking,
          );

          // Create a ReadableStream that formats events as SSE
          const sseStream = new ReadableStream({
            async start(controller) {
              const reader = streamingResult.getReader();
              const encoder = new TextEncoder();

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  // Format as Server-Sent Event
                  const eventData = JSON.stringify(value);
                  const sseData = `data: ${eventData}\n\n`;
                  controller.enqueue(encoder.encode(sseData));
                }
              } catch (error) {
                logger.error(
                  {
                    requestId,
                    userId: effectiveUserId,
                    error:
                      error instanceof Error ? error.message : "Unknown error",
                  },
                  "Error in streaming response",
                );

                // Send error event
                const errorEvent = JSON.stringify({
                  type: "error",
                  error:
                    error instanceof Error ? error.message : "Unknown error",
                  timestamp: new Date().toISOString(),
                });
                const sseError = `data: ${errorEvent}\n\n`;
                controller.enqueue(encoder.encode(sseError));
              } finally {
                reader.releaseLock();
                controller.close();
              }
            },
          });

          logger.info(
            { requestId, userId: effectiveUserId },
            "Recording history for streaming response",
          );

          // Record history for streaming request (non-blocking)
          recordHistory({
            action: "ai_prompt_streaming_response",
            itemType: "prompt",
            itemId: requestId,
            itemName: "AI Streaming Response",
            beforeData: { prompt: body.prompt, deviceInfo: body.deviceInfo },
            afterData: { streaming: true, requestId },
            actor: "assistant",
            userId: effectiveUserId,
          }).catch((historyError) => {
            logger.error(
              {
                requestId,
                userId: effectiveUserId,
                error:
                  historyError instanceof Error
                    ? historyError.message
                    : "Unknown error",
              },
              "Failed to record streaming history (non-blocking)",
            );
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
        } catch (aiError) {
          // Handle conversation not found errors specifically
          if (aiError instanceof ConversationNotFoundError) {
            logger.warn(
              {
                requestId,
                userId: effectiveUserId,
                conversationId: body.conversationId,
              },
              "Conversation not found for streaming or access denied",
            );
            return c.json({ error: "Conversation not found" }, 404);
          }

          logger.error(
            {
              requestId,
              userId: effectiveUserId,
              error:
                aiError instanceof Error ? aiError.message : "Unknown error",
              stack: aiError instanceof Error ? aiError.stack : undefined,
            },
            "Error processing streaming prompt request",
          );

          const errorResponse = {
            type: "text_response",
            error: "AI service error",
            response:
              "An error occurred while processing your streaming prompt with the AI service. Please try again later.",
          };

          try {
            await recordHistory({
              action: "ai_prompt_streaming_error",
              itemType: "api_error",
              itemId: `err_ai_stream_${Date.now()}`,
              itemName: "AI Streaming Prompt Processing Error",
              beforeData: { prompt: body.prompt, deviceInfo: body.deviceInfo },
              afterData: {
                error:
                  aiError instanceof Error ? aiError.message : String(aiError),
                response: errorResponse,
              },
              actor: "system",
              userId: effectiveUserId,
            });
          } catch (historyError) {
            logger.error(
              {
                requestId,
                userId: effectiveUserId,
                error:
                  historyError instanceof Error
                    ? historyError.message
                    : "Unknown error",
                stack:
                  historyError instanceof Error
                    ? historyError.stack
                    : undefined,
              },
              "Failed to record streaming AI error in history",
            );
          }
          return c.json(errorResponse, 502);
        }
      }

      logger.info(
        { requestId, userId: effectiveUserId },
        "No prompt provided in streaming request, acknowledging content receipt",
      );
      const response = {
        status: "OK",
        requestId: `req_stream_content_${Date.now()}`,
        type: "text_response",
        response: "Content received and acknowledged via streaming endpoint.",
        processed: true,
      };

      logger.info(
        { requestId, userId: effectiveUserId },
        "Recording history for streaming content-only request",
      );
      await recordHistory({
        action: "api_streaming_content_upload",
        itemType: "content_submission",
        itemId: response.requestId,
        itemName: "Streaming Content Submission (No Prompt)",
        beforeData: {
          contentSummary:
            "Content provided without prompt to streaming endpoint",
          deviceInfo: body.deviceInfo,
        },
        afterData: response,
        actor: "user",
        userId: effectiveUserId,
      });

      logger.info(
        { requestId, userId: effectiveUserId },
        "Returning response for streaming content-only request",
      );
      return c.json(response);
    } catch (error) {
      logger.error(
        {
          requestId,
          userId: effectiveUserId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Top-level error processing streaming request",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          {
            error: "Invalid request format",
            message: "Streaming request body validation failed",
            details: error.issues,
          },
          400,
        );
      }

      const errorResponse = {
        type: "text_response",
        error: "Internal server error",
        response:
          "An unexpected error occurred while processing your streaming request. Please try again later.",
      };
      try {
        await recordHistory({
          action: "api_error_streaming_general",
          itemType: "api_error",
          itemId: `err_gen_stream_top_${Date.now()}`,
          itemName: "General Streaming Prompt API Top-Level Error",
          beforeData: {
            errorInfo:
              "Streaming request body might be unparsable or other top-level issue",
          },
          afterData: {
            error: error instanceof Error ? error.message : String(error),
            response: errorResponse,
          },
          actor: "system",
          userId: effectiveUserId || "unknown",
        });
      } catch (historyError) {
        logger.error(
          {
            requestId,
            userId: effectiveUserId,
            error:
              historyError instanceof Error
                ? historyError.message
                : "Unknown error",
            stack:
              historyError instanceof Error ? historyError.stack : undefined,
          },
          "Failed to record general streaming top-level error in history",
        );
      }
      return c.json(errorResponse, 500);
    }
  },
);
