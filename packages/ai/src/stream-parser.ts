/**
 * TypeScript streaming LLM response parser library
 * Handles real-time parsing of AI responses with support for:
 * - Server-Sent Events (SSE) format parsing
 * - Think sections (<think>...</think>)
 * - Code blocks with tool calls
 * - Inline JSON tool calls
 * - Proper state management for partial content
 */

import { createAILogger } from "./logger.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("stream-parser");
  }
  return _logger;
}

// Type definitions
export interface StreamParseResult {
  type:
    | "content"
    | "think_start"
    | "think_content"
    | "think_end"
    | "tool_call"
    | "done"
    | "reasoning"
    | "usage"
    | "finish_reason";
  content?: string;
  data?: ToolCallData;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  finishReason?: "stop" | "tool_calls" | "length" | "content_filter";
}

export interface ToolCallData {
  type: "tool_calls";
  calls: any[];
}

export interface SSEParseResult {
  type:
    | "content"
    | "reasoning"
    | "done"
    | "usage"
    | "finish_reason"
    | "tool_call_delta";
  content?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  finishReason?: "stop" | "tool_calls" | "length" | "content_filter";
  toolCallDelta?: {
    index: number;
    id?: string;
    functionName?: string;
    argumentsDelta?: string;
  };
}

export type RawSSEBufferCallback = (chunk: string) => void;

interface ParserState {
  buffer: string;
  inThinkSection: boolean;
  contentBuffer: string;
  inCodeBlock: boolean;
  codeBlockType: string;
  codeBlockContent: string;
  codeBlockStartLine: string;
  accumulatedReasoning: string;
  accumulatedThinking: string;
  accumulatedToolCalls: Map<
    number,
    { id: string; functionName: string; arguments: string }
  >;
}

/**
 * LLM Stream Parser class for processing streaming responses with support for:
 * - Server-Sent Events (SSE) format parsing
 * - Think sections (<think>...</think>)
 * - Code blocks with tool calls
 * - Inline JSON tool calls
 */
export class LLMStreamParser {
  public state: ParserState;

  constructor() {
    this.state = {
      buffer: "",
      inThinkSection: false,
      contentBuffer: "",
      inCodeBlock: false,
      codeBlockType: "",
      codeBlockContent: "",
      codeBlockStartLine: "",
      accumulatedReasoning: "",
      accumulatedThinking: "",
      accumulatedToolCalls: new Map(),
    };
  }

  /**
   * Parse a single Server-Sent Events (SSE) line
   * @param line - Raw SSE line from the stream
   * @returns Parsed SSE data or null if not processable
   */
  parseSSELine(line: string): SSEParseResult | null {
    const logger = getLogger();

    // Input validation
    if (typeof line !== "string") {
      logger.warn(
        { line, lineType: typeof line },
        "Invalid line type passed to parseSSELine",
      );
      return null;
    }

    // Strip SSE comments
    if (line.startsWith(":")) return null;

    // Extract data from SSE format
    if (line.startsWith("data: ")) {
      const data = line.substring(6);

      // Handle [DONE] signal
      if (data.trim() === "[DONE]") {
        return { type: "done" };
      }

      try {
        const parsed = JSON.parse(data);

        // Handle usage from final chunk (OpenAI includes this with stream_options.include_usage)
        if (parsed.usage) {
          logger.debug(
            { usage: parsed.usage },
            "Extracted usage from SSE chunk",
          );
          return { type: "usage", usage: parsed.usage };
        }

        if (parsed.choices && parsed.choices[0]) {
          const choice = parsed.choices[0];

          // Handle finish_reason from final chunk
          if (choice.finish_reason && choice.finish_reason !== null) {
            logger.debug(
              { finishReason: choice.finish_reason },
              "Extracted finish_reason from SSE chunk",
            );
            return {
              type: "finish_reason",
              finishReason: choice.finish_reason,
            };
          }

          if (choice.delta) {
            const delta = choice.delta;

            // Handle reasoning field (from providers like OpenRouter)
            // Support both 'reasoning' and 'reasoning_content' field names (different providers use different names)
            const reasoningValue = delta.reasoning ?? delta.reasoning_content;
            // Only process reasoning if it has actual content (not empty string)
            if (
              reasoningValue !== null &&
              reasoningValue !== undefined &&
              reasoningValue.trim() !== ""
            ) {
              logger.debug(
                { reasoningContent: reasoningValue },
                "Returning reasoning content",
              );
              return { type: "reasoning", content: reasoningValue };
            } else if (
              reasoningValue !== null &&
              reasoningValue !== undefined
            ) {
              logger.debug(
                {
                  reasoningValue: reasoningValue,
                  reasoningLength: reasoningValue.length,
                },
                "Skipping empty reasoning content, will check for regular content",
              );
            }

            // Handle regular content
            if (delta.content !== null && delta.content !== undefined) {
              logger.debug(
                {
                  deltaContent: delta.content,
                  contentLength: delta.content.length,
                  firstChar:
                    delta.content.length > 0 ? delta.content[0] : "EMPTY",
                  preview: delta.content.substring(0, 20),
                },
                "Extracted content from SSE delta",
              );
              return { type: "content", content: delta.content };
            }

            // Handle tool call deltas
            if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                logger.debug(
                  { toolCallDelta: tc },
                  "Extracted tool_call delta from SSE chunk",
                );
                return {
                  type: "tool_call_delta",
                  toolCallDelta: {
                    index: tc.index ?? 0,
                    id: tc.id,
                    functionName: tc.function?.name,
                    argumentsDelta: tc.function?.arguments,
                  },
                };
              }
            }
          }
        }
      } catch (e) {
        logger.warn(
          { line, error: e instanceof Error ? e.message : "Unknown error" },
          "Failed to parse SSE line as JSON",
        );
      }
    }

    return null;
  }

  /**
   * Process content and extract structured elements (thinking, tool calls, regular content)
   * @param content - Raw content string to process
   * @returns Array of parsed results
   */
  processContent(content: string): StreamParseResult[] {
    const logger = getLogger();

    // Input validation to prevent character loss
    if (typeof content !== "string") {
      logger.warn(
        { content, contentType: typeof content },
        "Invalid content type passed to processContent",
      );
      return [];
    }

    this.state.buffer += content;

    const results: StreamParseResult[] = [];

    while (this.state.buffer.length > 0) {
      // Handle <think> tag start
      const thinkStart = this.state.buffer.indexOf("<think>");
      if (!this.state.inThinkSection && thinkStart !== -1) {
        // Flush any content before <think>
        if (thinkStart > 0) {
          const beforeThink = this.state.buffer.substring(0, thinkStart);
          results.push(...this.processRegularContent(beforeThink));
        }

        this.state.inThinkSection = true;
        this.state.buffer = this.state.buffer.substring(thinkStart + 7);
        results.push({ type: "think_start" });
        continue;
      }

      // Handle </think> tag end
      const thinkEnd = this.state.buffer.indexOf("</think>");
      if (this.state.inThinkSection && thinkEnd !== -1) {
        // Output content before </think>
        if (thinkEnd > 0) {
          const thinkContent = this.state.buffer.substring(0, thinkEnd);
          if (thinkContent.trim()) {
            results.push({ type: "think_content", content: thinkContent });
          }
        }

        this.state.inThinkSection = false;
        this.state.buffer = this.state.buffer.substring(thinkEnd + 8);
        results.push({ type: "think_end" });
        continue;
      }

      // If we're in a think section, stream everything until we find </think>
      if (this.state.inThinkSection) {
        if (thinkEnd === -1) {
          // No end tag yet, stream all available content
          if (this.state.buffer.length > 0) {
            results.push({ type: "think_content", content: this.state.buffer });
            this.state.buffer = "";
          }
        }
        break;
      }

      // Process regular content
      const processed = this.processRegularContent(this.state.buffer);
      results.push(...processed);
      break;
    }

    return results;
  }

  /**
   * Process regular content (non-thinking) looking for code blocks and tool calls
   * @param content - Content to process
   * @returns Array of parsed results
   */
  private processRegularContent(content: string): StreamParseResult[] {
    const logger = getLogger();
    const results: StreamParseResult[] = [];
    let remaining = content;
    let processed = "";

    while (remaining.length > 0) {
      // Check for code block start
      if (!this.state.inCodeBlock && remaining.startsWith("```")) {
        // Flush any accumulated content
        if (processed) {
          results.push({ type: "content", content: processed });
          processed = "";
        }

        const endOfLine = remaining.indexOf("\n");
        if (endOfLine !== -1) {
          this.state.codeBlockStartLine = remaining.substring(0, endOfLine + 1);
          this.state.codeBlockType = remaining
            .substring(3, endOfLine)
            .trim()
            .toLowerCase();
          this.state.inCodeBlock = true;
          this.state.codeBlockContent = "";
          remaining = remaining.substring(endOfLine + 1);
          continue;
        } else {
          // Incomplete code block start, wait for more data
          this.state.buffer = remaining;
          break;
        }
      }

      // Check for code block end
      if (this.state.inCodeBlock) {
        // Look for closing ``` in the accumulated content plus current remaining content
        const combinedContent = this.state.codeBlockContent + remaining;
        const codeEnd = combinedContent.indexOf(
          "```",
          this.state.codeBlockContent.length > 0
            ? Math.max(0, this.state.codeBlockContent.length - 2)
            : 0,
        );

        if (codeEnd !== -1) {
          // We found the end marker - extract content before it
          const actualCodeContent = combinedContent.substring(0, codeEnd);
          const afterCodeBlock = combinedContent.substring(codeEnd + 3);

          // Check if this is a tool call
          if (this.state.codeBlockType === "json") {
            try {
              const trimmedContent = actualCodeContent.trim();
              const parsed = JSON.parse(trimmedContent);
              if (parsed.type === "tool_calls" && parsed.calls) {
                logger.debug(
                  { toolCallData: parsed },
                  "Detected tool call in JSON code block",
                );
                results.push({ type: "tool_call", data: parsed });
                remaining = afterCodeBlock;
                this.state.inCodeBlock = false;
                this.state.codeBlockContent = "";
                this.state.codeBlockType = "";
                this.state.codeBlockStartLine = "";
                continue;
              }
            } catch (e) {
              logger.debug(
                {
                  codeContent: actualCodeContent,
                  error: e instanceof Error ? e.message : "Unknown error",
                },
                "JSON code block is not a tool call",
              );
            }
          }

          // Regular code block
          processed += `${this.state.codeBlockStartLine + actualCodeContent}\`\`\``;
          remaining = afterCodeBlock;
          this.state.inCodeBlock = false;
          this.state.codeBlockContent = "";
          this.state.codeBlockType = "";
          this.state.codeBlockStartLine = "";
        } else {
          // Still in code block, accumulate all remaining content for now
          this.state.codeBlockContent += remaining;
          remaining = "";
        }
      } else {
        // Check for inline tool calls (not in code blocks)
        if (remaining.startsWith('{"type": "tool_calls"')) {
          // Flush any accumulated content
          if (processed) {
            results.push({ type: "content", content: processed });
            processed = "";
          }

          const endIndex = this.findJsonEnd(remaining);
          if (endIndex !== -1) {
            const jsonStr = remaining.substring(0, endIndex + 1);
            try {
              const toolCall = JSON.parse(jsonStr);
              if (toolCall.type === "tool_calls" && toolCall.calls) {
                logger.debug(
                  { toolCallData: toolCall },
                  "Detected inline tool call",
                );
                results.push({ type: "tool_call", data: toolCall });
                remaining = remaining.substring(endIndex + 1);
                continue;
              }
            } catch (e) {
              logger.debug(
                {
                  jsonStr,
                  error: e instanceof Error ? e.message : "Unknown error",
                },
                "Inline JSON is not a valid tool call",
              );
            }
          }
        }

        // Regular content - take one character at a time
        processed += remaining[0];
        remaining = remaining.substring(1);
      }
    }

    // Update buffer with any unprocessed content
    this.state.buffer = remaining;

    // Flush processed content
    if (processed) {
      results.push({ type: "content", content: processed });
    }

    return results;
  }

  /**
   * Find the end of a JSON object in a string
   * @param str - String to search in
   * @returns Index of the closing brace or -1 if not found
   */
  private findJsonEnd(str: string): number {
    let depth = 0;
    let inString = false;
    let isEscaped = false;

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (isEscaped) {
        isEscaped = false;
        continue;
      }

      if (char === "\\") {
        isEscaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{" || char === "[") depth++;
        else if (char === "}" || char === "]") {
          depth--;
          if (depth === 0) return i;
        }
      }
    }

    return -1;
  }

  /**
   * Flush any remaining content in the parser's buffer
   * @returns Array of remaining parsed results
   */
  flush(): StreamParseResult[] {
    const results: StreamParseResult[] = [];

    if (this.state.buffer) {
      if (this.state.inThinkSection) {
        if (this.state.buffer.trim()) {
          results.push({ type: "think_content", content: this.state.buffer });
        }
        results.push({ type: "think_end" });
      } else if (this.state.inCodeBlock) {
        // Incomplete code block
        const content =
          this.state.codeBlockStartLine +
          this.state.codeBlockContent +
          this.state.buffer;
        if (content.trim()) {
          results.push({ type: "content", content });
        }
      } else {
        if (this.state.buffer.trim()) {
          results.push({ type: "content", content: this.state.buffer });
        }
      }
    }

    return results;
  }

  /**
   * Process a raw SSE stream from an AI provider
   * @param stream - Raw ReadableStream from the AI provider (containing SSE data)
   * @param onRawSSEBuffer - Optional callback to capture full raw SSE buffer for logging/replay
   * @returns ReadableStream of parsed results including content, thinking, and tool calls
   */
  async processSSEStream(
    stream: ReadableStream<Uint8Array>,
    onRawSSEBuffer?: RawSSEBufferCallback,
  ): Promise<ReadableStream<StreamParseResult>> {
    const parser = this;
    const logger = getLogger();

    return new ReadableStream<StreamParseResult>({
      async start(controller) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Process any remaining content in the parser buffer
              const finalResults = parser.flush();
              for (const result of finalResults) {
                controller.enqueue(result);
              }

              // Send final done signal
              controller.enqueue({ type: "done" });
              controller.close();
              break;
            }

            // Decode the raw bytes and add to SSE buffer
            const decodedChunk = decoder.decode(value, { stream: true });
            sseBuffer += decodedChunk;

            // Capture raw buffer chunk if callback is provided
            if (onRawSSEBuffer) {
              onRawSSEBuffer(decodedChunk);
            }

            const lines = sseBuffer.split("\n");
            sseBuffer = lines.pop() || ""; // Keep incomplete line in buffer

            // Process each complete SSE line
            for (const line of lines) {
              if (line.trim() === "") continue;

              // Parse the SSE line to extract content/reasoning
              const sseResult = parser.parseSSELine(line);
              if (!sseResult) continue;

              if (sseResult.type === "done") {
                // Process any remaining content in the parser buffer
                const finalResults = parser.flush();
                for (const result of finalResults) {
                  controller.enqueue(result);
                }
                controller.enqueue({ type: "done" });
                controller.close();
                return;
              }

              if (sseResult.type === "usage" && sseResult.usage) {
                // Pass through usage information
                controller.enqueue({
                  type: "usage",
                  usage: sseResult.usage,
                });
              } else if (
                sseResult.type === "finish_reason" &&
                sseResult.finishReason
              ) {
                // Pass through finish reason
                controller.enqueue({
                  type: "finish_reason",
                  finishReason: sseResult.finishReason,
                });
              } else if (sseResult.type === "reasoning" && sseResult.content) {
                // Accumulate reasoning content from AI provider for final consolidation
                parser.state.accumulatedReasoning += sseResult.content;
                // Also emit for real-time display
                controller.enqueue({
                  type: "reasoning",
                  content: sseResult.content,
                });
              } else if (
                sseResult.type === "tool_call_delta" &&
                sseResult.toolCallDelta
              ) {
                // Accumulate tool call deltas
                const delta = sseResult.toolCallDelta;
                const existing = parser.state.accumulatedToolCalls.get(
                  delta.index,
                );

                if (existing) {
                  // Accumulate arguments delta
                  if (delta.argumentsDelta) {
                    existing.arguments += delta.argumentsDelta;
                  }
                  // Update function name if provided (first chunk usually has it)
                  if (delta.functionName) {
                    existing.functionName = delta.functionName;
                  }
                } else {
                  // First chunk for this tool call
                  parser.state.accumulatedToolCalls.set(delta.index, {
                    id: delta.id || `tool_${delta.index}`,
                    functionName: delta.functionName || "",
                    arguments: delta.argumentsDelta || "",
                  });
                }
              } else if (sseResult.content) {
                // Process regular content for thinking tags, tool calls, etc.
                const contentResults = parser.processContent(sseResult.content);
                for (const result of contentResults) {
                  // Accumulate thinking content for final consolidation
                  if (result.type === "think_content" && result.content) {
                    parser.state.accumulatedThinking += result.content;
                  }
                  controller.enqueue(result);
                }
              }
            }
          }
        } catch (error) {
          logger.error(
            { error: error instanceof Error ? error.message : "Unknown error" },
            "Error processing SSE stream",
          );
          controller.error(error);
        } finally {
          reader.releaseLock();
        }
      },
    });
  }

  /**
   * Get final consolidated thinking content with proper precedence
   * Reasoning field from AI provider takes precedence over embedded <think> tags
   * @returns Object with thinking content and source information
   */
  getFinalThinkingContent(): {
    thinkingContent: string | null;
    thinkingSource: "reasoning_field" | "embedded_tags" | null;
  } {
    if (
      this.state.accumulatedReasoning &&
      this.state.accumulatedReasoning.trim()
    ) {
      return {
        thinkingContent: this.state.accumulatedReasoning.trim(),
        thinkingSource: "reasoning_field",
      };
    } else if (
      this.state.accumulatedThinking &&
      this.state.accumulatedThinking.trim()
    ) {
      return {
        thinkingContent: this.state.accumulatedThinking.trim(),
        thinkingSource: "embedded_tags",
      };
    } else {
      return {
        thinkingContent: null,
        thinkingSource: null,
      };
    }
  }

  /**
   * Get final accumulated tool calls after stream processing
   * @returns Array of complete tool calls or empty array if none
   */
  getAccumulatedToolCalls(): Array<{
    id: string;
    functionName: string;
    arguments: string;
  }> {
    return Array.from(this.state.accumulatedToolCalls.values());
  }

  /**
   * Reset the parser state for processing a new stream
   */
  reset(): void {
    this.state = {
      buffer: "",
      inThinkSection: false,
      contentBuffer: "",
      inCodeBlock: false,
      codeBlockType: "",
      codeBlockContent: "",
      codeBlockStartLine: "",
      accumulatedReasoning: "",
      accumulatedThinking: "",
      accumulatedToolCalls: new Map(),
    };
  }
}
