/**
 * OpenAI-Compatible Adapter
 *
 * Handles the OpenAI-compatible /chat/completions API format.
 * Used by: OpenAI, OpenRouter, llama.cpp, LM Studio, Ollama, and other compatible providers.
 */

import { createAILogger } from "../logger.js";
import type {
  AdapterRequest,
  AdapterRequestParams,
  AdapterResponse,
  FinishReason,
  ProviderAuth,
  TokenUsage,
  ToolCallResult,
} from "../types.js";
import type { DialectAdapter } from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("openai-compatible-adapter");
  }
  return _logger;
}

// =============================================================================
// OPENAI-COMPATIBLE ADAPTER
// =============================================================================

export class OpenAICompatibleAdapter implements DialectAdapter {
  readonly dialect = "openai_compatible" as const;

  /**
   * Build the HTTP request for OpenAI-compatible Chat Completions API
   */
  buildRequest(
    baseUrl: string,
    endpoint: string,
    params: AdapterRequestParams,
    auth: ProviderAuth,
    customHeaders?: Record<string, string>,
  ): AdapterRequest {
    const logger = getLogger();
    const url = `${baseUrl}${endpoint || "/chat/completions"}`;

    // Build headers: start with defaults, merge custom headers, then add auth
    // Auth headers are added last so they can't be overridden by custom headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    // Add authentication using new format (after custom headers so auth can't be overridden)
    if (auth.type !== "none" && auth.header && auth.value) {
      headers[auth.header] = auth.value;
    }

    // Build request body
    const body: Record<string, unknown> = {
      messages: params.messages.map((msg) => {
        const m: Record<string, unknown> = {
          role: msg.role,
          content: msg.content,
        };
        if (msg.name) m.name = msg.name;
        if (msg.tool_call_id) m.tool_call_id = msg.tool_call_id;
        if (msg.tool_calls) m.tool_calls = msg.tool_calls;
        return m;
      }),
      temperature: params.options.temperature ?? 0.5,
      max_tokens: params.options.maxTokens ?? 2000,
      stream: params.options.stream ?? false,
    };

    // Add model
    body.model = params.model;

    // Add top_p if specified
    if (params.options.top_p !== undefined) {
      body.top_p = params.options.top_p;
    }

    // Add tools if specified
    if (params.options.tools && params.options.tools.length > 0) {
      body.tools = params.options.tools;

      // Add tool choice
      if (params.options.toolChoice) {
        if (typeof params.options.toolChoice === "string") {
          body.tool_choice = params.options.toolChoice;
        } else {
          body.tool_choice = params.options.toolChoice;
        }
      }
    }

    // Add response format if specified
    if (params.options.responseFormat) {
      if (params.options.responseFormat.type === "json_object") {
        body.response_format = { type: "json_object" };
      } else if (params.options.responseFormat.type === "json_schema") {
        body.response_format = {
          type: "json_schema",
          json_schema: params.options.responseFormat.json_schema,
        };
      }
    }

    logger.debug(
      {
        url,
        model: params.model,
        hasTools: !!params.options.tools,
        hasResponseFormat: !!params.options.responseFormat,
        stream: params.options.stream,
      },
      "Building OpenAI-compatible request",
    );

    return {
      url,
      method: "POST",
      headers,
      body,
    };
  }

  /**
   * Parse a non-streaming response from OpenAI-compatible API
   */
  parseResponse(response: unknown): AdapterResponse {
    const logger = getLogger();
    const data = response as OpenAIChatResponse;

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error("No choices in OpenAI response");
    }

    const message = choice.message;
    if (!message) {
      throw new Error("No message in OpenAI response choice");
    }

    // Extract content
    const content = message.content ?? "";

    // Extract reasoning (various provider formats)
    const reasoning =
      message.reasoning ||
      message.reasoning_content ||
      (message as Record<string, unknown>).thinking;

    // Extract tool calls
    let toolCalls: ToolCallResult[] | undefined;
    if (message.tool_calls && message.tool_calls.length > 0) {
      toolCalls = message.tool_calls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    // Extract usage
    const usage: TokenUsage | undefined = data.usage
      ? {
          prompt_tokens: data.usage.prompt_tokens,
          completion_tokens: data.usage.completion_tokens,
          total_tokens: data.usage.total_tokens,
        }
      : undefined;

    // Map finish reason
    const finishReason = mapFinishReason(choice.finish_reason);

    logger.debug(
      {
        hasContent: !!content,
        hasReasoning: !!reasoning,
        hasToolCalls: !!toolCalls,
        finishReason,
      },
      "Parsed OpenAI-compatible response",
    );

    return {
      content,
      reasoning:
        reasoning && typeof reasoning === "string" ? reasoning : undefined,
      toolCalls,
      usage,
      finishReason,
    };
  }

  /**
   * Transform streaming response (passthrough for OpenAI format)
   *
   * OpenAI-compatible streams are already in the correct format,
   * so we just pass them through. The LLMStreamParser handles the actual parsing.
   */
  transformStream(
    stream: ReadableStream<Uint8Array>,
  ): ReadableStream<Uint8Array> {
    // OpenAI streams are already in the correct SSE format
    return stream;
  }
}

// =============================================================================
// OPENAI RESPONSE TYPES
// =============================================================================

interface OpenAIChatResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: OpenAIChatChoice[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAIChatChoice {
  index?: number;
  message?: OpenAIChatMessage;
  finish_reason?: string;
}

interface OpenAIChatMessage {
  role?: string;
  content?: string | null;
  reasoning?: string;
  reasoning_content?: string;
  tool_calls?: OpenAIToolCall[];
}

interface OpenAIToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function mapFinishReason(reason: string | undefined): FinishReason | undefined {
  if (!reason) return undefined;

  const logger = getLogger();
  switch (reason) {
    case "stop":
      return "stop";
    case "tool_calls":
    case "function_call":
      return "tool_calls";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    default:
      logger.debug({ reason }, "Unknown finish reason, defaulting to stop");
      return "stop";
  }
}

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const openaiCompatibleAdapter = new OpenAICompatibleAdapter();
