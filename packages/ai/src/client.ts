/**
 * AI Client
 *
 * Main entry point for making AI API calls.
 * Provides callAI and callAIStream functions that handle:
 * - Configuration resolution
 * - Capability validation
 * - Request building via dialect adapters
 * - Response parsing
 * - Tracing and logging
 */

import { getAdapter } from "./adapters/index.js";
import {
  getDialectEndpoint,
  getThinkingPromptPrefix,
  validateAIConfig,
  validateAIConfigForModelId,
} from "./config.js";
import { isDebugLoggingEnabled, logDebugEntry } from "./debug-logger.js";
import { createLazyLogger, getErrorMessage } from "./logger.js";
import { LLMStreamParser } from "./stream-parser.js";
import { estimateTokenCount } from "./token-estimation.js";
import type {
  AICallOptions,
  AICallTrace,
  AIContext,
  AIMessage,
  AIResponse,
  AIStreamResponse,
  Dialect,
  TokenUsage,
} from "./types.js";
import {
  deriveRequestRequirements,
  validateRequestAgainstCapabilities,
} from "./validation.js";

const getLogger = createLazyLogger("ai-client");

// =============================================================================
// THINKING TAG CLEANUP
// =============================================================================

/**
 * Strip `<think>...</think>` blocks that some models emit in their content.
 * Applied as defense-in-depth so callers always receive clean content.
 */
function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// =============================================================================
// DEFAULTS
// =============================================================================

/** Default temperature when not specified by the caller */
const DEFAULT_TEMPERATURE = 0.5;

/** Default max output tokens when not specified by the caller */
const DEFAULT_MAX_TOKENS = 2000;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Creates a deep copy of an object, safe for tracing
 */
function deepCopyForTrace(obj: unknown): Record<string, unknown> {
  const logger = getLogger();
  try {
    return JSON.parse(JSON.stringify(obj)) as Record<string, unknown>;
  } catch (error) {
    logger.warn(
      { error: getErrorMessage(error) },
      "Failed to deep copy object for trace, using shallow copy",
    );
    return { ...(obj as Record<string, unknown>) };
  }
}

/**
 * Apply thinking prefix to system messages if needed
 */
function applyThinkingPrefix(
  messages: AIMessage[],
  modelId: string,
  enableThinking?: boolean,
): AIMessage[] {
  const logger = getLogger();
  return messages.map((message) => {
    if (message.role === "system") {
      const thinkingPrefix = getThinkingPromptPrefix(modelId, enableThinking);
      if (thinkingPrefix && typeof message.content === "string") {
        logger.debug(
          { modelId, thinkingPrefix, enableThinking },
          "Applying thinking prefix to system message",
        );
        return {
          ...message,
          content: `${thinkingPrefix} ${message.content}`.trim(),
        };
      }
    }
    return message;
  });
}

/**
 * Get the dialect for a provider config
 */
function getDialect(providerConfig: { dialect: Dialect }): Dialect {
  return providerConfig.dialect;
}

// =============================================================================
// CALL AI (NON-STREAMING)
// =============================================================================

/**
 * Makes a unified AI API call (non-streaming)
 *
 * @param messages - Array of messages to send
 * @param context - Context for model selection ("backend" or "workers")
 * @param options - Call options
 * @returns AI response with content, reasoning, tool calls, etc.
 */
export async function callAI(
  messages: AIMessage[],
  context: AIContext,
  options: AICallOptions = {},
): Promise<AIResponse> {
  const logger = getLogger();

  // Workers never need thinking — disable it to preserve token budget
  const resolvedEnableThinking =
    options.enableThinking ?? (context === "workers" ? false : undefined);

  // If streaming is requested, delegate to callAIStream and collect results
  if (options.stream) {
    const streamResponse = await callAIStream(messages, context, options);

    const streamParser = new LLMStreamParser();
    const parsedStream = await streamParser.processSSEStream(
      streamResponse.stream,
    );
    const reader = parsedStream.getReader();

    const contentChunks: string[] = [];
    const reasoningChunks: string[] = [];
    let finalUsage: TokenUsage | undefined;
    let finalFinishReason: AIResponse["finishReason"];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value.type === "content" && value.content) {
          contentChunks.push(value.content);
        }
        if (value.type === "reasoning" && value.content) {
          reasoningChunks.push(value.content);
        }
        if (value.type === "usage" && value.usage) {
          finalUsage = value.usage as TokenUsage;
        }
        if (value.type === "finish_reason" && value.finishReason) {
          finalFinishReason = value.finishReason as AIResponse["finishReason"];
        }
      }
    } finally {
      reader.releaseLock();
    }

    const joinedReasoning = reasoningChunks.join("");
    const rawContent = contentChunks.join("");
    return {
      content:
        resolvedEnableThinking === false
          ? stripThinkingTags(rawContent)
          : rawContent,
      reasoning: joinedReasoning?.trim() ? joinedReasoning : undefined,
      usage: finalUsage,
      estimatedInputTokens: streamResponse.estimatedInputTokens,
      finishReason: finalFinishReason,
    };
  }

  // Non-streaming path
  const startTime = Date.now();
  const { provider, providerConfig, modelId, modelConfig } =
    options.modelOverride
      ? validateAIConfigForModelId(options.modelOverride)
      : validateAIConfig(context);

  // Apply thinking prefix to system messages
  const processedMessages = applyThinkingPrefix(
    messages,
    modelId,
    resolvedEnableThinking,
  );

  // Estimate token count
  const estimatedInputTokens = estimateTokenCount(
    processedMessages,
    provider.model,
  );

  // Validate request against model capabilities
  const requirements = deriveRequestRequirements(
    messages,
    options,
    estimatedInputTokens,
  );
  validateRequestAgainstCapabilities(
    modelId,
    requirements,
    modelConfig.capabilities,
  );

  // Get adapter for this dialect
  const dialect = getDialect(providerConfig);
  const adapter = getAdapter(dialect);
  const endpoint = getDialectEndpoint(dialect);

  // Apply defaults before passing to adapter
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Build request using adapter
  const request = adapter.buildRequest(
    provider.baseURL,
    endpoint,
    {
      messages: processedMessages,
      model: provider.model,
      options: {
        temperature,
        maxTokens,
        top_p: options.top_p,
        stream: false,
        tools: options.tools,
        toolChoice: options.toolChoice,
        responseFormat: options.responseFormat,
        enableThinking: resolvedEnableThinking,
      },
      providerOverrides: providerConfig.overrides,
    },
    providerConfig.auth,
    providerConfig.headers,
  );

  logger.debug(
    {
      context,
      modelId,
      provider: provider.name,
      url: request.url,
      messagesCount: messages.length,
      estimatedInputTokens,
      dialect,
      hasTools: !!options.tools,
      hasResponseFormat: !!options.responseFormat,
      traceEnabled: options.trace?.enabled || false,
    },
    "Making AI API call",
  );

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal:
        options.timeout && options.timeout > 0
          ? AbortSignal.timeout(options.timeout)
          : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          context,
          provider: provider.name,
          status: response.status,
          statusText: response.statusText,
          errorText,
        },
        "AI API error response",
      );
      throw new Error(
        `AI API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const data = await response.json();

    // Parse response using adapter
    const parsed = adapter.parseResponse(data);

    const endTime = Date.now();
    const durationMs = endTime - startTime;

    logger.info(
      {
        context,
        modelId,
        provider: provider.name,
        responseLength: parsed.content.length,
        estimatedInputTokens,
        actualUsage: parsed.usage,
        hasToolCalls: !!parsed.toolCalls,
        durationMs,
      },
      "AI API call successful",
    );

    // Capture trace if enabled
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url: request.url,
          method: "POST",
          headers: {
            ...request.headers,
            Authorization: request.headers.Authorization
              ? "[REDACTED]"
              : undefined,
          },
          body: deepCopyForTrace(request.body),
        },
        responseBody: deepCopyForTrace(data),
        durationMs,
        usage: parsed.usage
          ? (deepCopyForTrace(parsed.usage) as TokenUsage)
          : undefined,
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    // Debug file logging
    if (isDebugLoggingEnabled()) {
      logDebugEntry({
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: context,
        modelId,
        provider: provider.name,
        durationMs,
        estimatedInputTokens,
        appContext: options.debugContext,
        request: {
          messages: processedMessages,
          options: {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            tools: options.tools
              ? `[${options.tools.length} tools]`
              : undefined,
            responseFormat: options.responseFormat ? "json_schema" : undefined,
          },
        },
        response: {
          content: parsed.content,
          reasoning: parsed.reasoning,
          toolCalls: parsed.toolCalls,
          usage: parsed.usage,
          finishReason: parsed.finishReason,
        },
      });
    }

    return {
      content:
        resolvedEnableThinking === false
          ? stripThinkingTags(parsed.content)
          : parsed.content,
      reasoning: parsed.reasoning?.trim() ? parsed.reasoning : undefined,
      toolCalls: parsed.toolCalls,
      usage: parsed.usage,
      estimatedInputTokens,
      finishReason: parsed.finishReason,
    };
  } catch (error) {
    const endTime = Date.now();
    const durationMs = endTime - startTime;

    logger.error(
      {
        context,
        provider: provider.name,
        durationMs,
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "AI API call failed",
    );

    // Capture error trace if enabled
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url: request.url,
          method: "POST",
          headers: {
            ...request.headers,
            Authorization: request.headers.Authorization
              ? "[REDACTED]"
              : undefined,
          },
          body: deepCopyForTrace(request.body),
        },
        responseBody: {
          error: getErrorMessage(error),
        },
        durationMs,
        usage: undefined,
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    // Debug file logging for errors
    if (isDebugLoggingEnabled()) {
      logDebugEntry({
        timestamp: new Date().toISOString(),
        type: "error",
        aiContext: context,
        modelId,
        provider: provider.name,
        durationMs,
        estimatedInputTokens,
        appContext: options.debugContext,
        request: {
          messages: processedMessages,
          options: {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          },
        },
        error: getErrorMessage(error),
      });
    }

    throw error;
  }
}

// =============================================================================
// CALL AI STREAM
// =============================================================================

/**
 * Makes a streaming AI API call
 *
 * @param messages - Array of messages to send
 * @param context - Context for model selection ("backend" or "workers")
 * @param options - Call options (stream is forced to true)
 * @returns Stream response with ReadableStream
 */
export async function callAIStream(
  messages: AIMessage[],
  context: AIContext,
  options: AICallOptions = {},
): Promise<AIStreamResponse> {
  const logger = getLogger();
  const startTime = Date.now();
  const { provider, providerConfig, modelId, modelConfig } =
    options.modelOverride
      ? validateAIConfigForModelId(options.modelOverride)
      : validateAIConfig(context);

  // Workers never need thinking — disable it to preserve token budget
  const resolvedEnableThinking =
    options.enableThinking ?? (context === "workers" ? false : undefined);

  // Apply thinking prefix to system messages
  const processedMessages = applyThinkingPrefix(
    messages,
    modelId,
    resolvedEnableThinking,
  );

  // Estimate token count
  const estimatedInputTokens = estimateTokenCount(
    processedMessages,
    provider.model,
  );

  // Force streaming option
  const streamOptions = { ...options, stream: true };

  // Validate request against model capabilities
  const requirements = deriveRequestRequirements(
    messages,
    streamOptions,
    estimatedInputTokens,
  );
  validateRequestAgainstCapabilities(
    modelId,
    requirements,
    modelConfig.capabilities,
  );

  // Get adapter for this dialect
  const dialect = getDialect(providerConfig);
  const adapter = getAdapter(dialect);
  const endpoint = getDialectEndpoint(dialect);

  // Apply defaults before passing to adapter
  const temperature = options.temperature ?? DEFAULT_TEMPERATURE;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;

  // Build request using adapter
  const request = adapter.buildRequest(
    provider.baseURL,
    endpoint,
    {
      messages: processedMessages,
      model: provider.model,
      options: {
        temperature,
        maxTokens,
        top_p: options.top_p,
        stream: true,
        tools: options.tools,
        toolChoice: options.toolChoice,
        responseFormat: options.responseFormat,
        enableThinking: resolvedEnableThinking,
      },
      providerOverrides: providerConfig.overrides,
    },
    providerConfig.auth,
    providerConfig.headers,
  );

  logger.debug(
    {
      context,
      modelId,
      provider: provider.name,
      url: request.url,
      messagesCount: messages.length,
      estimatedInputTokens,
      dialect,
      traceEnabled: options.trace?.enabled || false,
    },
    "Making streaming AI API call",
  );

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal:
        options.timeout && options.timeout > 0
          ? AbortSignal.timeout(options.timeout)
          : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          context,
          provider: provider.name,
          status: response.status,
          statusText: response.statusText,
          errorText,
        },
        "Streaming AI API error response",
      );
      throw new Error(
        `AI API error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    if (!response.body) {
      throw new Error("No response body available for streaming");
    }

    // Transform stream using adapter (handles MLX/Anthropic → OpenAI format conversion)
    let stream: ReadableStream<Uint8Array> = response.body;
    if (dialect === "mlx_native" || dialect === "anthropic_messages") {
      logger.debug(
        { provider: provider.name, dialect },
        "Transforming stream to OpenAI format",
      );
      stream = adapter.transformStream(stream) as ReadableStream<Uint8Array>;
    }

    // Capture trace for streaming request
    if (options.trace?.enabled && options.trace.onTraceCapture) {
      const traceData: AICallTrace = {
        callIndex: options.trace.callIndex,
        timestamp: new Date(startTime).toISOString(),
        requestBody: {
          url: request.url,
          method: "POST",
          headers: {
            ...request.headers,
            Authorization: request.headers.Authorization
              ? "[REDACTED]"
              : undefined,
          },
          body: deepCopyForTrace(request.body),
        },
        responseBody: { streaming: true },
        durationMs: Date.now() - startTime,
        usage: undefined,
        estimatedInputTokens,
      };
      options.trace.onTraceCapture(traceData);
    }

    logger.debug(
      { context, modelId, provider: provider.name },
      "Streaming response started",
    );

    // Debug file logging for streaming request
    if (isDebugLoggingEnabled()) {
      logDebugEntry({
        timestamp: new Date().toISOString(),
        type: "request",
        aiContext: context,
        modelId,
        provider: provider.name,
        durationMs: Date.now() - startTime,
        estimatedInputTokens,
        streaming: true,
        appContext: options.debugContext,
        request: {
          messages: processedMessages,
          options: {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            tools: options.tools
              ? `[${options.tools.length} tools]`
              : undefined,
            responseFormat: options.responseFormat ? "json_schema" : undefined,
          },
        },
      });
    }

    return {
      stream,
      estimatedInputTokens,
    };
  } catch (error) {
    logger.error(
      {
        context,
        provider: provider.name,
        error: getErrorMessage(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Streaming AI API call failed",
    );

    // Debug file logging for streaming errors
    if (isDebugLoggingEnabled()) {
      logDebugEntry({
        timestamp: new Date().toISOString(),
        type: "error",
        aiContext: context,
        modelId,
        provider: provider.name,
        estimatedInputTokens,
        streaming: true,
        appContext: options.debugContext,
        request: {
          messages: processedMessages,
          options: {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
          },
        },
        error: getErrorMessage(error),
      });
    }

    throw error;
  }
}

// =============================================================================
// RE-EXPORTS FOR CONVENIENCE
// =============================================================================

export { checkContextFit, estimateTokenCount } from "./token-estimation.js";
