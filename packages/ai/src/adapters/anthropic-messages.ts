/**
 * Anthropic Messages Adapter
 *
 * Handles the Anthropic Messages API format (/v1/messages).
 * Used by: Anthropic Claude API directly.
 *
 * Key differences from OpenAI format:
 * - System prompt is a separate field, not a message
 * - Content is always an array of blocks (text, image, tool_use, tool_result)
 * - Tool calls use a different format
 * - Streaming uses a different SSE event format
 */

import { createAILogger } from "../logger.js";
import type {
  AdapterRequest,
  AdapterRequestParams,
  AdapterResponse,
  AIMessage,
  FinishReason,
  MessageContent,
  ProviderAuth,
  TokenUsage,
  ToolCallResult,
} from "../types.js";
import type { DialectAdapter } from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("anthropic-messages-adapter");
  }
  return _logger;
}

// =============================================================================
// ANTHROPIC MESSAGES ADAPTER
// =============================================================================

export class AnthropicMessagesAdapter implements DialectAdapter {
  readonly dialect = "anthropic_messages" as const;

  /**
   * Build the HTTP request for Anthropic Messages API
   */
  buildRequest(
    baseUrl: string,
    endpoint: string,
    params: AdapterRequestParams,
    auth: ProviderAuth,
    customHeaders?: Record<string, string>,
  ): AdapterRequest {
    const logger = getLogger();
    const url = `${baseUrl}${endpoint || "/v1/messages"}`;

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    // Add authentication using new format
    if (auth.type !== "none" && auth.header && auth.value) {
      headers[auth.header] = auth.value;
    }

    // Extract system message and convert other messages
    const { systemPrompt, messages } = this.convertMessages(params.messages);

    // Build request body in Anthropic format
    const body: Record<string, unknown> = {
      model: params.model,
      messages,
      max_tokens: params.options.maxTokens ?? 2000,
    };

    // Add system prompt if present
    if (systemPrompt) {
      body.system = systemPrompt;
    }

    // Add temperature if specified (Anthropic default is 1.0)
    if (params.options.temperature !== undefined) {
      body.temperature = params.options.temperature;
    }

    // Add top_p if specified
    if (params.options.top_p !== undefined) {
      body.top_p = params.options.top_p;
    }

    // Add streaming
    if (params.options.stream) {
      body.stream = true;
    }

    // Add tools if specified
    if (params.options.tools && params.options.tools.length > 0) {
      body.tools = params.options.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));

      // Add tool choice
      if (params.options.toolChoice) {
        if (params.options.toolChoice === "auto") {
          body.tool_choice = { type: "auto" };
        } else if (params.options.toolChoice === "required") {
          body.tool_choice = { type: "any" };
        } else if (params.options.toolChoice === "none") {
          // Anthropic doesn't have "none" - just don't send tools
          delete body.tools;
        } else if (typeof params.options.toolChoice === "object") {
          body.tool_choice = {
            type: "tool",
            name: params.options.toolChoice.function.name,
          };
        }
      }
    }

    logger.debug(
      {
        url,
        model: params.model,
        hasSystem: !!systemPrompt,
        messagesCount: messages.length,
        hasTools: !!params.options.tools,
        stream: params.options.stream,
      },
      "Building Anthropic messages request",
    );

    return {
      url,
      method: "POST",
      headers,
      body,
    };
  }

  /**
   * Convert OpenAI-style messages to Anthropic format
   */
  private convertMessages(messages: AIMessage[]): {
    systemPrompt: string | undefined;
    messages: AnthropicMessage[];
  } {
    let systemPrompt: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        // Extract system prompt
        systemPrompt = this.contentToString(msg.content);
        continue;
      }

      if (msg.role === "user") {
        anthropicMessages.push({
          role: "user",
          content: this.convertContent(msg.content),
        });
      } else if (msg.role === "assistant") {
        const content: AnthropicContentBlock[] = [];

        // Add text content
        const textContent = this.contentToString(msg.content);
        if (textContent) {
          content.push({ type: "text", text: textContent });
        }

        // Add tool use blocks
        if (msg.tool_calls) {
          for (const tc of msg.tool_calls) {
            content.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
        }

        if (content.length > 0) {
          anthropicMessages.push({ role: "assistant", content });
        }
      } else if (msg.role === "tool") {
        // Tool results in Anthropic are user messages with tool_result blocks
        anthropicMessages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: msg.tool_call_id!,
              content: this.contentToString(msg.content),
            },
          ],
        });
      }
    }

    return { systemPrompt, messages: anthropicMessages };
  }

  /**
   * Convert message content to Anthropic content blocks
   */
  private convertContent(content: MessageContent): AnthropicContentBlock[] {
    if (typeof content === "string") {
      return [{ type: "text", text: content }];
    }

    return content.map((part) => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      } else if (part.type === "image_url") {
        // Convert image URL to Anthropic format
        const url = part.image_url.url;
        if (url.startsWith("data:")) {
          // Parse data URL
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              type: "image",
              source: {
                type: "base64",
                media_type: match[1],
                data: match[2],
              },
            };
          }
        }
        // URL-based images
        return {
          type: "image",
          source: {
            type: "url",
            url,
          },
        };
      }
      // Fallback
      return { type: "text", text: JSON.stringify(part) };
    }) as AnthropicContentBlock[];
  }

  /**
   * Convert content to plain string
   */
  private contentToString(content: MessageContent): string {
    if (typeof content === "string") {
      return content;
    }
    return content
      .filter((part) => part.type === "text")
      .map((part) => (part as { text: string }).text)
      .join("");
  }

  /**
   * Parse a non-streaming response from Anthropic Messages API
   */
  parseResponse(response: unknown): AdapterResponse {
    const logger = getLogger();
    const data = response as AnthropicResponse;

    // Extract text content
    let content = "";
    const toolCalls: ToolCallResult[] = [];

    for (const block of data.content || []) {
      if (block.type === "text") {
        content += block.text;
      } else if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          type: "function",
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input),
          },
        });
      }
    }

    // Extract usage
    const usage: TokenUsage | undefined = data.usage
      ? {
          prompt_tokens: data.usage.input_tokens,
          completion_tokens: data.usage.output_tokens,
          total_tokens:
            (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
        }
      : undefined;

    // Map stop reason
    const finishReason = this.mapStopReason(data.stop_reason);

    logger.debug(
      {
        hasContent: !!content,
        toolCallsCount: toolCalls.length,
        finishReason,
      },
      "Parsed Anthropic response",
    );

    return {
      content,
      reasoning: undefined, // Anthropic doesn't have a separate reasoning field
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      finishReason,
    };
  }

  /**
   * Map Anthropic stop_reason to our FinishReason
   */
  private mapStopReason(reason: string | undefined): FinishReason | undefined {
    if (!reason) return undefined;

    switch (reason) {
      case "end_turn":
        return "stop";
      case "stop_sequence":
        return "stop";
      case "tool_use":
        return "tool_calls";
      case "max_tokens":
        return "length";
      default:
        return "stop";
    }
  }

  /**
   * Transform Anthropic streaming response to OpenAI-compatible SSE format
   *
   * Anthropic uses a different SSE event format with event types like:
   * - message_start
   * - content_block_start
   * - content_block_delta
   * - content_block_stop
   * - message_delta
   * - message_stop
   */
  transformStream(
    stream: ReadableStream<Uint8Array>,
  ): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const logger = getLogger();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = stream.getReader();
        let buffer = "";
        let currentToolUse: {
          id: string;
          name: string;
          inputJson: string;
        } | null = null;

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            let eventType = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) {
                eventType = line.substring(7).trim();
                continue;
              }

              if (line.startsWith("data: ")) {
                const data = line.substring(6);

                try {
                  const parsed = JSON.parse(data);

                  if (eventType === "content_block_delta") {
                    if (parsed.delta?.type === "text_delta") {
                      // Text content delta
                      const openaiFormat = {
                        choices: [
                          {
                            delta: { content: parsed.delta.text },
                            index: 0,
                            finish_reason: null,
                          },
                        ],
                      };
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify(openaiFormat)}\n\n`,
                        ),
                      );
                    } else if (parsed.delta?.type === "input_json_delta") {
                      // Tool input delta - accumulate JSON
                      if (currentToolUse) {
                        currentToolUse.inputJson +=
                          parsed.delta.partial_json || "";
                      }
                    }
                  } else if (eventType === "content_block_start") {
                    if (parsed.content_block?.type === "tool_use") {
                      // Start of tool use block
                      currentToolUse = {
                        id: parsed.content_block.id,
                        name: parsed.content_block.name,
                        inputJson: "",
                      };
                    }
                  } else if (eventType === "content_block_stop") {
                    // End of content block
                    if (currentToolUse) {
                      // Emit complete tool call
                      const openaiFormat = {
                        choices: [
                          {
                            delta: {
                              tool_calls: [
                                {
                                  index: 0,
                                  id: currentToolUse.id,
                                  type: "function",
                                  function: {
                                    name: currentToolUse.name,
                                    arguments: currentToolUse.inputJson,
                                  },
                                },
                              ],
                            },
                            index: 0,
                            finish_reason: null,
                          },
                        ],
                      };
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify(openaiFormat)}\n\n`,
                        ),
                      );
                      currentToolUse = null;
                    }
                  } else if (eventType === "message_stop") {
                    // End of message
                    const openaiFormat = {
                      choices: [
                        {
                          delta: {},
                          index: 0,
                          finish_reason: "stop",
                        },
                      ],
                    };
                    controller.enqueue(
                      encoder.encode(
                        `data: ${JSON.stringify(openaiFormat)}\n\n`,
                      ),
                    );
                  } else if (eventType === "message_delta") {
                    // Message-level updates (stop reason, usage)
                    if (parsed.delta?.stop_reason === "tool_use") {
                      const openaiFormat = {
                        choices: [
                          {
                            delta: {},
                            index: 0,
                            finish_reason: "tool_calls",
                          },
                        ],
                      };
                      controller.enqueue(
                        encoder.encode(
                          `data: ${JSON.stringify(openaiFormat)}\n\n`,
                        ),
                      );
                    }
                  }
                } catch (e) {
                  logger.warn(
                    {
                      line,
                      error: e instanceof Error ? e.message : "Unknown error",
                    },
                    "Failed to parse Anthropic SSE line",
                  );
                }
              }
            }
          }
        } catch (error) {
          logger.error(
            { error: error instanceof Error ? error.message : "Unknown error" },
            "Error transforming Anthropic stream",
          );
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }
}

// =============================================================================
// ANTHROPIC TYPES
// =============================================================================

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicContentBlock[];
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source:
        | { type: "base64"; media_type: string; data: string }
        | { type: "url"; url: string };
    }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicResponse {
  id?: string;
  type?: string;
  role?: string;
  content?: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  stop_reason?: string;
  stop_sequence?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const anthropicMessagesAdapter = new AnthropicMessagesAdapter();
