/**
 * Prompt Service
 *
 * Business logic for prompt processing, extracted from routes/prompt.ts
 * to follow the thin routes pattern used by notes, tasks, and documents.
 */

import { isValidConversationId } from "@eclaire/core";
import {
  processPromptRequest,
  processPromptRequestStream,
  ConversationNotFoundError,
  type PromptResponse,
  type StreamEvent,
} from "../agent/index.js";
import { recordHistory } from "./history.js";
import { createChildLogger } from "../logger.js";
import type { PromptRequest } from "../../schemas/prompt-params.js";
import type { StreamPromptRequest } from "../../schemas/prompt-stream-params.js";

const logger = createChildLogger("services:prompt");

// Re-export types for convenience
export { ConversationNotFoundError };
export type { PromptResponse, StreamEvent };

// ============================================================================
// Types
// ============================================================================

export type ValidationResult =
  | { valid: true }
  | { valid: false; error: string; message?: string; code: number };

export type UserResolutionResult =
  | { userId: string }
  | { error: string; code: 403 };

// Error types for structured error handling
export class PromptValidationError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly details?: string,
  ) {
    super(message);
    this.name = "PromptValidationError";
  }
}

export class PromptProcessingError extends Error {
  constructor(
    message: string,
    public readonly code: number,
    public readonly originalError?: Error,
  ) {
    super(message);
    this.name = "PromptProcessingError";
  }
}

// ============================================================================
// Validation
// ============================================================================

const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate prompt request body
 */
export function validatePromptRequest(
  body: PromptRequest | StreamPromptRequest,
): ValidationResult {
  // Check for empty prompt and content
  const hasPrompt = body.prompt && body.prompt.trim() !== "";
  const hasContent =
    body.content &&
    (Array.isArray(body.content) ? body.content.length > 0 : true);

  if (!hasPrompt && !hasContent) {
    return {
      valid: false,
      error: "Invalid request",
      message: "Request must include either 'prompt' or 'content' or both",
      code: 400,
    };
  }

  // Validate conversation ID format if provided
  if (body.conversationId && !isValidConversationId(body.conversationId)) {
    return {
      valid: false,
      error: "Invalid conversation ID",
      code: 400,
    };
  }

  // Validate content size
  if (body.content) {
    const contentArray = Array.isArray(body.content)
      ? body.content
      : [body.content];

    for (const item of contentArray) {
      if (item.data && item.data.length > MAX_CONTENT_SIZE) {
        return {
          valid: false,
          error: "Content too large",
          message: "The content data exceeds the maximum size limit of 10MB",
          code: 413,
        };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// User Resolution
// ============================================================================

const AI_ASSISTANT_USER_ID = "user-ai-assistant"; // TODO: Make this configurable

/**
 * Resolve the effective user ID for tool execution
 *
 * If targetUserId is provided, validates that the authenticated user
 * is the AI assistant (allowed to act on behalf of other users).
 */
export function resolveEffectiveUserId(
  authenticatedUserId: string,
  targetUserId?: string,
): UserResolutionResult {
  if (!targetUserId) {
    return { userId: authenticatedUserId };
  }

  const isAIAssistant = authenticatedUserId === AI_ASSISTANT_USER_ID;

  if (!isAIAssistant) {
    return {
      error: "Unauthorized: Only AI assistant can specify targetUserId",
      code: 403,
    };
  }

  return { userId: targetUserId };
}

// ============================================================================
// Processing with History
// ============================================================================

export interface ProcessWithHistoryParams {
  body: PromptRequest;
  effectiveUserId: string;
  requestId: string;
}

/**
 * Process a prompt request and record history
 *
 * Handles both success and error cases, recording appropriate history entries.
 */
export async function processPromptWithHistory({
  body,
  effectiveUserId,
  requestId,
}: ProcessWithHistoryParams): Promise<PromptResponse> {
  // Handle content-only requests (no prompt)
  if (!body.prompt || body.prompt.trim() === "") {
    const response = {
      type: "text_response" as const,
      requestId: `req_content_${Date.now()}`,
      response: "Content received and acknowledged.",
    };

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

    return response;
  }

  // Process with AI
  try {
    const result = await processPromptRequest(
      effectiveUserId,
      body.prompt,
      body.context,
      requestId,
      body.conversationId,
      body.enableThinking,
    );

    const responsePayload = {
      status: "OK",
      requestId: result.requestId,
      type: result.type,
      response: result.response,
      ...(result.conversationId && { conversationId: result.conversationId }),
      ...(result.thinkingContent && {
        thinkingContent: result.thinkingContent,
      }),
      ...(result.toolCalls && { toolCalls: result.toolCalls }),
    };

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

    return result;
  } catch (error) {
    // Handle conversation not found
    if (error instanceof ConversationNotFoundError) {
      throw error;
    }

    // Record error in history
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
        itemId: `err_ai_${Date.now()}`,
        itemName: "AI Prompt Processing Error",
        beforeData: { prompt: body.prompt, deviceInfo: body.deviceInfo },
        afterData: {
          error: error instanceof Error ? error.message : String(error),
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
        },
        "Failed to record AI error in history",
      );
    }

    throw new PromptProcessingError(
      "AI service error",
      502,
      error instanceof Error ? error : undefined,
    );
  }
}

// ============================================================================
// Streaming with History
// ============================================================================

export interface ProcessStreamWithHistoryParams {
  body: StreamPromptRequest;
  effectiveUserId: string;
  requestId: string;
}

/**
 * Process a streaming prompt request and record history
 *
 * Returns a ReadableStream that emits SSE-formatted data.
 * History is recorded non-blocking.
 */
export async function processPromptStreamWithHistory({
  body,
  effectiveUserId,
  requestId,
}: ProcessStreamWithHistoryParams): Promise<ReadableStream<Uint8Array>> {
  // Handle content-only requests (no prompt)
  if (!body.prompt || body.prompt.trim() === "") {
    const response = {
      status: "OK",
      requestId: `req_stream_content_${Date.now()}`,
      type: "text_response",
      response: "Content received and acknowledged via streaming endpoint.",
      processed: true,
    };

    await recordHistory({
      action: "api_streaming_content_upload",
      itemType: "content_submission",
      itemId: response.requestId,
      itemName: "Streaming Content Submission (No Prompt)",
      beforeData: {
        contentSummary: "Content provided without prompt to streaming endpoint",
        deviceInfo: body.deviceInfo,
      },
      afterData: response,
      actor: "user",
      userId: effectiveUserId,
    });

    // Return a simple stream with the response
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        const sseData = `data: ${JSON.stringify(response)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
        controller.close();
      },
    });
  }

  // Get the streaming result from the agent
  const streamingResult = await processPromptRequestStream(
    effectiveUserId,
    body.prompt,
    body.context,
    requestId,
    body.conversationId,
    body.enableThinking,
  );

  // Record history non-blocking
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

  // Create SSE-formatted stream
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const reader = streamingResult.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const eventData = JSON.stringify(value);
          const sseData = `data: ${eventData}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        }
      } catch (error) {
        logger.error(
          {
            requestId,
            userId: effectiveUserId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error in streaming response",
        );

        // Send error event
        const errorEvent = JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
        const sseError = `data: ${errorEvent}\n\n`;
        controller.enqueue(encoder.encode(sseError));

        // Record streaming error
        try {
          await recordHistory({
            action: "ai_prompt_streaming_error",
            itemType: "api_error",
            itemId: `err_ai_stream_${Date.now()}`,
            itemName: "AI Streaming Prompt Processing Error",
            beforeData: { prompt: body.prompt, deviceInfo: body.deviceInfo },
            afterData: {
              error: error instanceof Error ? error.message : String(error),
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
            },
            "Failed to record streaming error in history",
          );
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
