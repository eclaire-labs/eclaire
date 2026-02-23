/**
 * Prompt Service
 *
 * Thin service layer that uses ToolLoopAgent for AI interactions.
 * Replaces the monolithic prompt.ts with a clean, modular implementation.
 */

import type { AIMessage, ToolCallSummaryOutput } from "@eclaire/ai";
import {
  type AgentStreamEvent,
  anyOf,
  createAgentContext,
  noToolCalls,
  stepCountIs,
  ToolLoopAgent,
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
import type { BackendAgentContext, UserContext } from "./types.js";

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
 * Create a configured ToolLoopAgent for the backend
 */
function createBackendAgent(options: {
  includeTools: boolean;
  isBackgroundTask: boolean;
  assetContents?: Array<{ type: string; id: string; content: string }>;
  enableThinking?: boolean;
}) {
  // Explicitly set tool calling mode based on whether tools are enabled
  const toolCallingMode = options.includeTools ? "native" : "off";

  return new ToolLoopAgent<BackendAgentContext>({
    aiContext: "backend",
    toolCallingMode,

    instructions: (context) => {
      return buildSystemPrompt({
        userContext: context.userContext,
        assetContents: options.assetContents,
        toolCallingMode,
        isBackgroundTaskExecution: options.isBackgroundTask,
      });
    },

    tools: options.includeTools ? backendTools : {},

    stopWhen: anyOf(stepCountIs(10), noToolCalls()),

    aiOptions: {
      temperature: 0.1,
      maxTokens: 2000,
      timeout: 180000, // 3 minutes
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

    // Create agent
    const agent = createBackendAgent({
      includeTools: !hasAssets || isBackgroundTask,
      isBackgroundTask,
      assetContents,
      enableThinking,
    });

    // Create context
    const agentContext = createAgentContext<UserContext>({
      userId,
      requestId,
      conversationId,
      userContext,
    });

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

    // Execute agent
    const result = await agent.generate({
      prompt,
      context: agentContext,
      messages: previousMessages,
    });

    // Save to conversation
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
 * Transform agent stream events to API-compatible stream events.
 * Returns null for internal events that shouldn't be sent to the frontend.
 */
function transformAgentEvent(event: AgentStreamEvent): StreamEvent | null {
  switch (event.type) {
    case "thought":
      return {
        type: "thought",
        content: event.content,
        timestamp: event.timestamp,
      };

    case "text-chunk":
      return {
        type: "text-chunk",
        content: event.content,
        timestamp: event.timestamp,
      };

    case "tool-call-start":
      return {
        type: "tool-call",
        name: event.toolName,
        status: "starting",
        arguments: event.arguments,
        timestamp: event.timestamp,
      };

    case "tool-call-complete":
      return {
        type: "tool-call",
        name: event.toolName,
        status: "completed",
        result: event.result,
        timestamp: event.timestamp,
      };

    case "tool-call-error":
      return {
        type: "tool-call",
        name: event.toolName,
        status: "error",
        error: event.error,
        timestamp: event.timestamp,
      };

    case "done":
      return {
        type: "done",
        requestId: undefined, // Will be set by caller
        conversationId: undefined, // Will be set by caller
        totalTokens: event.result.usage.totalTokens,
        thinkingContent: event.result.thinking,
        toolCalls: event.result.toolCallSummaries,
        timestamp: event.timestamp,
      };

    case "error":
      return {
        type: "error",
        error: event.error,
        timestamp: event.timestamp,
      };

    case "step-complete":
      // Internal event, not needed by frontend
      return null;

    default:
      // Log warning for truly unknown events, don't send error to frontend
      logger.warn(
        { eventType: (event as { type: string }).type },
        "Unknown agent event type received",
      );
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

  // Create agent
  const agent = createBackendAgent({
    includeTools: !hasAssets || isBackgroundTask,
    isBackgroundTask,
    assetContents,
    enableThinking,
  });

  // Create context
  const agentContext = createAgentContext<UserContext>({
    userId,
    requestId,
    conversationId,
    userContext,
  });

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

  // Execute agent with streaming
  const streamResult = agent.stream({
    prompt,
    context: agentContext,
    messages: previousMessages,
  });

  // Transform stream and handle completion
  return new ReadableStream<StreamEvent>({
    async start(controller) {
      const reader = streamResult.eventStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const event = transformAgentEvent(value);

          // Skip internal events that don't need to be sent to frontend
          if (event === null) {
            continue;
          }

          // Handle done event specially to save conversation
          if (value.type === "done") {
            const result = value.result;

            // Save conversation
            const finalConversationId = await saveConversationMessages({
              conversationId,
              userId,
              prompt,
              result,
              requestId,
            });

            const endTime = Date.now();

            // Emit done event with full info
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
          } else {
            controller.enqueue(event);
          }
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
