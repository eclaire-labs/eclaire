/**
 * Prompt Service
 *
 * Thin service layer that uses RuntimeAgent for AI interactions.
 */

import type { AIMessage, ToolCallSummaryOutput } from "@eclaire/ai";
import {
  convertFromLlm,
  createRuntimeContext,
  RuntimeAgent,
  type RuntimeStreamEvent,
  wrapLegacyTools,
} from "@eclaire/ai";
import type { Context } from "../../schemas/prompt-params.js";
import { createChildLogger } from "../logger.js";
import { getUserContextForPrompt } from "../user.js";
import { fetchAssetContents } from "./asset-fetcher.js";
import {
  ConversationNotFoundError,
  loadConversationMessages,
  saveConversationMessages,
} from "./conversation-adapter.js";
import { buildSystemPrompt } from "./system-prompt-builder.js";
import { backendTools } from "./tools/index.js";
import type { UserContext } from "./types.js";

const logger = createChildLogger("prompt-service");

// Re-export for backwards compatibility
export { ConversationNotFoundError };

export interface ProcessPromptOptions {
  userId: string;
  prompt: string;
  context?: Context;
  requestId?: string;
  conversationId?: string;
  enableThinking?: boolean;
}

export interface PromptResponse {
  type: "text_response";
  response: string;
  requestId: string;
  conversationId?: string;
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummaryOutput[];
}

/**
 * Create a configured RuntimeAgent for the backend.
 */
export function createBackendAgent(options: {
  includeTools: boolean;
  isBackgroundTask: boolean;
  assetContents?: Array<{ type: string; id: string; content: string }>;
  enableThinking?: boolean;
}) {
  const toolCallingMode = options.includeTools ? "native" : "off";

  return new RuntimeAgent({
    aiContext: "backend",
    toolCallingMode,

    instructions: (context) => {
      const userContext = context.extra?.userContext as
        | UserContext
        | undefined;
      return buildSystemPrompt({
        userContext,
        assetContents: options.assetContents,
        toolCallingMode,
        isBackgroundTaskExecution: options.isBackgroundTask,
      });
    },

    tools: options.includeTools ? wrapLegacyTools(backendTools) : {},

    maxSteps: 10,

    aiOptions: {
      temperature: 0.1,
      maxTokens: 2000,
      timeout: 180000,
      enableThinking: options.enableThinking,
    },
  });
}

/**
 * Process a prompt request (non-streaming)
 *
 * Supports both options object and positional arguments for backwards compatibility.
 */
export async function processPromptRequest(
  userIdOrOptions: string | ProcessPromptOptions,
  promptArg?: string,
  contextArg?: Context,
  requestIdArg?: string,
  conversationIdArg?: string,
  enableThinkingArg?: boolean,
): Promise<PromptResponse> {
  // Support both call styles
  let userId: string;
  let prompt: string;
  let context: Context | undefined;
  let requestId: string | undefined;
  let conversationId: string | undefined;
  let enableThinking: boolean | undefined;

  if (typeof userIdOrOptions === "string") {
    // Positional arguments (legacy)
    userId = userIdOrOptions;
    prompt = promptArg as string;
    context = contextArg;
    requestId = requestIdArg;
    conversationId = conversationIdArg;
    enableThinking = enableThinkingArg;
  } else {
    // Options object (new style)
    ({ userId, prompt, context, requestId, conversationId, enableThinking } =
      userIdOrOptions);
  }

  const startTime = Date.now();
  logger.info(
    { requestId, userId, hasConversationId: !!conversationId },
    "Processing prompt request",
  );

  try {
    // Get user context for personalization
    const userContext = (await getUserContextForPrompt(userId)) as UserContext;

    // Fetch asset contents if provided
    const assetContents = context?.assets
      ? await fetchAssetContents(context.assets, userId)
      : undefined;

    const hasAssets = assetContents && assetContents.length > 0;
    const isBackgroundTask = context?.backgroundTaskExecution === true;
    const includeTools = !hasAssets || isBackgroundTask;

    // Load conversation history if exists
    let previousMessages: AIMessage[] | undefined;
    if (conversationId) {
      try {
        previousMessages = await loadConversationMessages(
          conversationId,
          userId,
        );
      } catch (error) {
        if (error instanceof ConversationNotFoundError) {
          throw error;
        }
        logger.warn(
          { conversationId, error },
          "Failed to load conversation, starting fresh",
        );
      }
    }

    const agent = createBackendAgent({
      includeTools,
      isBackgroundTask,
      assetContents,
      enableThinking,
    });

    const runtimeContext = createRuntimeContext({
      userId,
      requestId,
      conversationId,
      extra: { userContext },
    });

    const previousRuntimeMessages = previousMessages
      ? convertFromLlm(previousMessages)
      : undefined;

    const result = await agent.generate({
      prompt,
      context: runtimeContext,
      messages: previousRuntimeMessages,
    });

    const finalConversationId = await saveConversationMessages({
      conversationId,
      userId,
      prompt,
      result,
      requestId,
    });

    const endTime = Date.now();
    logger.info(
      {
        requestId,
        userId,
        conversationId: finalConversationId,
        totalExecutionTimeMs: endTime - startTime,
        totalSteps: result.steps.length,
        totalToolCalls: result.toolCallSummaries.length,
      },
      "Prompt request completed",
    );

    return {
      type: "text_response",
      response: result.text,
      requestId: requestId || `req_text_${Date.now()}`,
      conversationId: finalConversationId,
      thinkingContent: result.thinking || null,
      toolCalls:
        result.toolCallSummaries.length > 0
          ? result.toolCallSummaries
          : undefined,
    };
  } catch (error) {
    const endTime = Date.now();
    logger.error(
      {
        requestId,
        userId,
        totalExecutionTimeMs: endTime - startTime,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error processing prompt request",
    );
    throw error;
  }
}

// Streaming event types for API compatibility
export interface StreamEvent {
  type: "thought" | "tool-call" | "text-chunk" | "error" | "done";
  timestamp?: string;
  content?: string;
  name?: string;
  status?: "starting" | "executing" | "completed" | "error";
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  requestId?: string;
  conversationId?: string;
  totalTokens?: number;
  executionTimeMs?: number;
  responseType?: string;
  thinkingContent?: string;
  toolCalls?: ToolCallSummaryOutput[];
}

/**
 * Transform RuntimeAgent stream events to API-compatible stream events.
 * Returns null for internal events that shouldn't be sent to the frontend.
 */
export function transformRuntimeEvent(
  event: RuntimeStreamEvent,
): StreamEvent | null {
  const timestamp = new Date().toISOString();

  switch (event.type) {
    case "text_delta":
      return { type: "text-chunk", content: event.text, timestamp };

    case "thinking_delta":
      return { type: "thought", content: event.text, timestamp };

    case "tool_call_start":
      return {
        type: "tool-call",
        name: event.name,
        status: "starting",
        timestamp,
      };

    case "tool_call_end":
      return {
        type: "tool-call",
        name: event.name,
        status: "starting",
        arguments: event.arguments,
        timestamp,
      };

    case "tool_progress":
      return {
        type: "tool-call",
        name: event.name,
        status: "executing",
        timestamp,
      };

    case "tool_result": {
      const isError = event.result.isError;
      const textContent = event.result.content
        .filter((c): c is { type: "text"; text: string } => c.type === "text")
        .map((c) => c.text)
        .join("\n");

      if (isError) {
        return {
          type: "tool-call",
          name: event.name,
          status: "error",
          error: textContent,
          timestamp,
        };
      }
      return {
        type: "tool-call",
        name: event.name,
        status: "completed",
        result: textContent,
        timestamp,
      };
    }

    case "error":
      return { type: "error", error: event.error, timestamp };

    // Internal events — not sent to frontend
    case "text_start":
    case "text_end":
    case "thinking_start":
    case "thinking_end":
    case "tool_call_start":
    case "tool_call_delta":
    case "message_complete":
    case "turn_complete":
      return null;

    default:
      return null;
  }
}

/**
 * Process a prompt request with streaming response
 *
 * Supports both options object and positional arguments for backwards compatibility.
 */
export async function processPromptRequestStream(
  userIdOrOptions: string | ProcessPromptOptions,
  promptArg?: string,
  contextArg?: Context,
  requestIdArg?: string,
  conversationIdArg?: string,
  enableThinkingArg?: boolean,
): Promise<ReadableStream<StreamEvent>> {
  // Support both call styles
  let userId: string;
  let prompt: string;
  let context: Context | undefined;
  let requestId: string | undefined;
  let conversationId: string | undefined;
  let enableThinking: boolean | undefined;

  if (typeof userIdOrOptions === "string") {
    // Positional arguments (legacy)
    userId = userIdOrOptions;
    prompt = promptArg as string;
    context = contextArg;
    requestId = requestIdArg;
    conversationId = conversationIdArg;
    enableThinking = enableThinkingArg;
  } else {
    // Options object (new style)
    ({ userId, prompt, context, requestId, conversationId, enableThinking } =
      userIdOrOptions);
  }

  const startTime = Date.now();
  logger.info(
    { requestId, userId, hasConversationId: !!conversationId },
    "Processing streaming prompt request",
  );

  // Get user context for personalization
  const userContext = (await getUserContextForPrompt(userId)) as UserContext;

  // Fetch asset contents if provided
  const assetContents = context?.assets
    ? await fetchAssetContents(context.assets, userId)
    : undefined;

  const hasAssets = assetContents && assetContents.length > 0;
  const isBackgroundTask = context?.backgroundTaskExecution === true;
  const includeTools = !hasAssets || isBackgroundTask;

  // Load conversation history if exists
  let previousMessages: AIMessage[] | undefined;
  if (conversationId) {
    try {
      previousMessages = await loadConversationMessages(conversationId, userId);
    } catch (error) {
      if (error instanceof ConversationNotFoundError) {
        // Return error stream
        return new ReadableStream<StreamEvent>({
          start(controller) {
            controller.enqueue({
              type: "error",
              error: "Conversation not found",
              timestamp: new Date().toISOString(),
            });
            controller.close();
          },
        });
      }
      logger.warn(
        { conversationId, error },
        "Failed to load conversation, starting fresh",
      );
    }
  }

  const agent = createBackendAgent({
    includeTools,
    isBackgroundTask,
    assetContents,
    enableThinking,
  });

  const runtimeContext = createRuntimeContext({
    userId,
    requestId,
    conversationId,
    extra: { userContext },
  });

  const previousRuntimeMessages = previousMessages
    ? convertFromLlm(previousMessages)
    : undefined;

  const streamResult = agent.stream({
    prompt,
    context: runtimeContext,
    messages: previousRuntimeMessages,
  });

  return new ReadableStream<StreamEvent>({
    async start(controller) {
      const reader = streamResult.eventStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value.type === "turn_complete") {
            const result = await streamResult.result;

            const finalConversationId = await saveConversationMessages({
              conversationId,
              userId,
              prompt,
              result,
              requestId,
            });

            const endTime = Date.now();

            controller.enqueue({
              type: "done",
              requestId: requestId || `req_stream_${Date.now()}`,
              conversationId: finalConversationId,
              totalTokens: result.usage.totalTokens,
              executionTimeMs: endTime - startTime,
              responseType: "text_response",
              thinkingContent: result.thinking,
              toolCalls:
                result.toolCallSummaries.length > 0
                  ? result.toolCallSummaries
                  : undefined,
              timestamp: new Date().toISOString(),
            });

            logger.info(
              {
                requestId,
                userId,
                conversationId: finalConversationId,
                totalExecutionTimeMs: endTime - startTime,
                totalSteps: result.steps.length,
                totalToolCalls: result.toolCallSummaries.length,
              },
              "Streaming prompt request completed",
            );
            continue;
          }

          const event = transformRuntimeEvent(value);
          if (event) controller.enqueue(event);
        }
      } catch (error) {
        logger.error(
          {
            requestId,
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Error in streaming prompt request",
        );

        controller.enqueue({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
