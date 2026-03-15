/**
 * CLI Events → SSE Stream Encoder
 *
 * Converts an async iterable of CliEvents into an OpenAI-compatible SSE byte stream.
 * Shared between CliSubprocessRunner and CodexAppServerManager.
 */

import { createLazyLogger, getErrorMessage } from "../logger.js";
import type { AIResponse, AIStreamResponse, TokenUsage } from "../types.js";
import type { CliEvent } from "./types.js";

const getLogger = createLazyLogger("cli-sse");

// =============================================================================
// SSE STREAM ENCODER
// =============================================================================

/**
 * Convert an async iterable of CliEvents into an OpenAI-compatible SSE byte stream.
 */
export function cliEventsToSSEStream(
  events: AsyncIterable<CliEvent>,
): AIStreamResponse {
  const encoder = new TextEncoder();
  const logger = getLogger();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          switch (event.type) {
            case "started":
              break;

            case "content_delta": {
              const sseData = {
                choices: [
                  {
                    delta: { content: event.text },
                    index: 0,
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
              );
              break;
            }

            case "reasoning_delta": {
              const sseData = {
                choices: [
                  {
                    delta: { reasoning: event.text },
                    index: 0,
                    finish_reason: null,
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
              );
              break;
            }

            case "usage": {
              const sseData = {
                usage: {
                  prompt_tokens: event.inputTokens,
                  completion_tokens: event.outputTokens,
                  total_tokens:
                    event.inputTokens || event.outputTokens
                      ? (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
                      : undefined,
                },
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
              );
              break;
            }

            case "completed": {
              // If there's a final answer not already streamed, emit it
              if (event.answer) {
                const sseData = {
                  choices: [
                    {
                      delta: { content: event.answer },
                      index: 0,
                      finish_reason: null,
                    },
                  ],
                };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`),
                );
              }

              // Emit finish_reason
              const finishData = {
                choices: [
                  {
                    delta: {},
                    index: 0,
                    finish_reason: event.ok ? "stop" : "error",
                  },
                ],
              };
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(finishData)}\n\n`),
              );
              break;
            }

            case "error": {
              logger.warn({ error: event.message }, "CLI provider error event");
              break;
            }

            // action events are progress indicators, skip for SSE output
            case "action":
              break;
          }
        }
      } catch (error) {
        logger.error({ error: getErrorMessage(error) }, "Error in CLI stream");
        controller.error(error);
        return;
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return { stream };
}

// =============================================================================
// RESPONSE BUILDER
// =============================================================================

/**
 * Convert accumulated CliEvents into an AIResponse.
 * Shared between CliSubprocessRunner and CodexAppServerManager.
 */
export function buildAIResponse(
  events: CliEvent[],
  estimatedInputTokens?: number,
): AIResponse {
  const contentParts: string[] = [];
  const reasoningParts: string[] = [];
  let usage: TokenUsage | undefined;
  let sessionId: string | undefined;
  let ok = true;

  for (const event of events) {
    switch (event.type) {
      case "started":
        sessionId = event.sessionId ?? sessionId;
        break;
      case "content_delta":
        contentParts.push(event.text);
        break;
      case "reasoning_delta":
        reasoningParts.push(event.text);
        break;
      case "usage":
        usage = {
          prompt_tokens: event.inputTokens,
          completion_tokens: event.outputTokens,
          total_tokens:
            event.inputTokens || event.outputTokens
              ? (event.inputTokens ?? 0) + (event.outputTokens ?? 0)
              : undefined,
        };
        break;
      case "completed":
        sessionId = event.sessionId ?? sessionId;
        ok = event.ok;
        // Use the completed answer if we didn't accumulate content deltas
        if (contentParts.length === 0 && event.answer) {
          contentParts.push(event.answer);
        }
        break;
      case "error":
        ok = false;
        break;
    }
  }

  const reasoning = reasoningParts.join("");
  return {
    content: contentParts.join(""),
    reasoning: reasoning.trim() ? reasoning : undefined,
    usage,
    estimatedInputTokens,
    finishReason: ok ? "stop" : undefined,
    cliSessionId: sessionId,
  };
}
