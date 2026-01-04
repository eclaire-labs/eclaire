/**
 * MLX Native Adapter
 *
 * Handles the MLX-VLM /responses API format.
 * Used by: MLX vision language models running locally on Apple Silicon.
 */

import { createAILogger } from "../logger.js";
import type {
  AdapterRequest,
  AdapterRequestParams,
  AdapterResponse,
  ProviderAuth,
} from "../types.js";
import type { DialectAdapter } from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("mlx-native-adapter");
  }
  return _logger;
}

// =============================================================================
// MLX NATIVE ADAPTER
// =============================================================================

export class MLXNativeAdapter implements DialectAdapter {
  readonly dialect = "mlx_native" as const;

  /**
   * Build the HTTP request for MLX /responses API
   */
  buildRequest(
    baseUrl: string,
    endpoint: string,
    params: AdapterRequestParams,
    auth: ProviderAuth,
    customHeaders?: Record<string, string>
  ): AdapterRequest {
    const logger = getLogger();
    const url = `${baseUrl}${endpoint || "/responses"}`;

    // Build headers: start with defaults, merge custom headers, then add auth
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...customHeaders,
    };

    // Add authentication using new format (rarely needed for local MLX)
    if (auth.type !== "none" && auth.header && auth.value) {
      headers[auth.header] = auth.value;
    }

    // Convert messages to MLX format
    const inputMessages = params.messages.map((message) => ({
      role: message.role,
      content: message.content,
    }));

    // Build request body in MLX format
    const body: Record<string, unknown> = {
      model: params.model,
      input: inputMessages,
      stream: params.options.stream ?? false,
      max_output_tokens: params.options.maxTokens ?? 2000,
      temperature: params.options.temperature ?? 0.5,
    };

    // Add top_p if specified
    if (params.options.top_p !== undefined) {
      body.top_p = params.options.top_p;
    }

    logger.debug(
      {
        url,
        model: params.model,
        stream: params.options.stream,
        messagesCount: inputMessages.length,
      },
      "Building MLX native request"
    );

    return {
      url,
      method: "POST",
      headers,
      body,
    };
  }

  /**
   * Parse a non-streaming response from MLX API
   */
  parseResponse(response: unknown): AdapterResponse {
    const logger = getLogger();
    const data = response as MLXResponse;

    // MLX has various response formats, try to extract content
    const content =
      data.response?.output_text ||
      data.response?.text ||
      data.output_text ||
      data.text ||
      data.response ||
      data.content ||
      "";

    if (!content || typeof content !== "string") {
      throw new Error("No content in MLX response");
    }

    logger.debug(
      { contentLength: content.length },
      "Parsed MLX response"
    );

    // MLX doesn't support reasoning, tools, or structured usage
    return {
      content,
      reasoning: undefined,
      toolCalls: undefined,
      usage: undefined,
      finishReason: "stop",
    };
  }

  /**
   * Transform MLX streaming response to OpenAI-compatible SSE format
   */
  transformStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const logger = getLogger();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = stream.getReader();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Emit final [DONE] marker
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              // Pass through empty lines and comments
              if (line.trim() === "" || line.startsWith(":")) {
                controller.enqueue(encoder.encode(line + "\n"));
                continue;
              }

              // Process data lines
              if (line.startsWith("data: ")) {
                const data = line.substring(6);

                // Pass through [DONE] marker
                if (data.trim() === "[DONE]") {
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  continue;
                }

                try {
                  const parsed = JSON.parse(data);
                  const eventType = parsed.type;

                  if (eventType === "response.output_text.delta") {
                    // Convert MLX delta to OpenAI format
                    const deltaContent = parsed.delta;

                    if (deltaContent && deltaContent !== "") {
                      const openaiFormat = {
                        choices: [
                          {
                            delta: { content: deltaContent },
                            index: 0,
                            finish_reason: null,
                          },
                        ],
                      };

                      controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(openaiFormat)}\n\n`)
                      );
                    }
                  } else if (eventType === "response.completed") {
                    // Convert MLX completion to OpenAI format
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
                      encoder.encode(`data: ${JSON.stringify(openaiFormat)}\n\n`)
                    );
                  } else {
                    // Unknown event type, log and skip
                    logger.debug({ eventType }, "Unknown MLX event type");
                  }
                } catch (e) {
                  logger.warn(
                    { line, error: e instanceof Error ? e.message : "Unknown error" },
                    "Failed to parse MLX SSE line"
                  );
                  // Pass through unparseable lines
                  controller.enqueue(encoder.encode(line + "\n"));
                }
              } else {
                // Pass through non-data lines
                controller.enqueue(encoder.encode(line + "\n"));
              }
            }
          }
        } catch (error) {
          logger.error(
            { error: error instanceof Error ? error.message : "Unknown error" },
            "Error transforming MLX stream"
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
// MLX RESPONSE TYPES
// =============================================================================

interface MLXResponse {
  response?: {
    output_text?: string;
    text?: string;
  };
  output_text?: string;
  text?: string;
  content?: string;
}

// =============================================================================
// EXPORT SINGLETON
// =============================================================================

export const mlxNativeAdapter = new MLXNativeAdapter();
