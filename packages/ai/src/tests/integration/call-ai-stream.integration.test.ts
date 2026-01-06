/**
 * Integration Tests: callAIStream
 *
 * Tests the streaming callAIStream function against real LLM providers.
 *
 * Run with:
 *   AI_TEST_PROVIDER=local pnpm --filter @eclaire/ai test:integration:local
 *   OPENROUTER_API_KEY=xxx pnpm --filter @eclaire/ai test:integration:openrouter
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { callAIStream, LLMStreamParser } from "../../index.js";
import {
  createCalculatorTool,
  createMinimalPrompt,
  createToolTriggerPrompt,
  initIntegrationAI,
  resetIntegrationAI,
  skipIfNoIntegration,
} from "./setup.js";

/**
 * Parse SSE stream and extract results
 * Uses processSSEStream() to properly handle all event types including tool call deltas
 */
async function parseSSEStream(stream: ReadableStream<Uint8Array>): Promise<{
  content: string;
  reasoning: string;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
  finishReason: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
}> {
  const parser = new LLMStreamParser();
  const parsedStream = await parser.processSSEStream(stream);
  const reader = parsedStream.getReader();

  let content = "";
  let reasoning = "";
  let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
  let finishReason: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      switch (value.type) {
        case "content":
          if (value.content) content += value.content;
          break;
        case "reasoning":
          if (value.content) reasoning += value.content;
          break;
        case "usage":
          if (value.usage) {
            usage = {
              prompt_tokens: value.usage.prompt_tokens || 0,
              completion_tokens: value.usage.completion_tokens || 0,
            };
          }
          break;
        case "finish_reason":
          finishReason = value.finishReason || null;
          break;
        // tool_call_delta events are accumulated internally by the parser
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Get accumulated tool calls from parser state
  const accumulatedToolCalls = parser.getAccumulatedToolCalls();
  const toolCalls = accumulatedToolCalls.map((tc) => ({
    id: tc.id,
    name: tc.functionName,
    arguments: tc.arguments,
  }));

  return { content, reasoning, usage, finishReason, toolCalls };
}

describe("callAIStream integration", () => {
  beforeAll(() => {
    skipIfNoIntegration();
  });

  beforeEach(() => {
    initIntegrationAI();
  });

  afterEach(() => {
    resetIntegrationAI();
  });

  describe("basic streaming", () => {
    it("returns a stream that emits content chunks", async () => {
      const messages = createMinimalPrompt();

      const { stream, estimatedInputTokens } = await callAIStream(
        messages,
        "backend",
      );

      expect(stream).toBeInstanceOf(ReadableStream);
      expect(estimatedInputTokens).toBeGreaterThan(0);

      // Parse the stream
      const result = await parseSSEStream(stream);

      // Should have received content
      expect(result.content.length).toBeGreaterThan(0);
    });

    it("provides usage information at end of stream", async () => {
      const messages = createMinimalPrompt();

      const { stream } = await callAIStream(messages, "backend");

      const result = await parseSSEStream(stream);

      // Usage should be reported (if provider supports it)
      if (result.usage) {
        expect(result.usage.prompt_tokens).toBeGreaterThan(0);
        expect(result.usage.completion_tokens).toBeGreaterThan(0);
      }

      // Should have a finish reason
      expect(result.finishReason).toBe("stop");
    });

    it("streams content progressively", async () => {
      // Request a longer response to ensure multiple chunks
      const messages = [
        {
          role: "user" as const,
          content: "Count from 1 to 10, one number per line.",
        },
      ];

      const { stream } = await callAIStream(messages, "backend");

      // Count the number of read operations that return data
      const reader = stream.getReader();
      let chunkCount = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) chunkCount++;
        }
      } finally {
        reader.releaseLock();
      }

      // Should have multiple chunks for a longer response
      expect(chunkCount).toBeGreaterThan(1);
    });
  });

  describe("streaming with tools", () => {
    it("streams tool calls correctly", async () => {
      const messages = createToolTriggerPrompt();
      const tools = [createCalculatorTool()];

      const { stream } = await callAIStream(messages, "backend", {
        tools,
        toolChoice: "required",
      });

      const result = await parseSSEStream(stream);

      // With toolChoice: "required", model MUST use tools
      expect(result.finishReason).toBe("tool_calls");
      expect(result.toolCalls.length).toBeGreaterThan(0);

      const toolCall = result.toolCalls[0]!;
      expect(toolCall.name).toBe("calculator");
      expect(toolCall.id).toBeDefined();

      // Verify arguments are valid JSON with expected properties
      const args = JSON.parse(toolCall.arguments);
      expect(args).toHaveProperty("operation");
      expect(args).toHaveProperty("a");
      expect(args).toHaveProperty("b");
    });
  });

  describe("stream options", () => {
    it("respects maxTokens in streaming mode", async () => {
      const messages = [
        {
          role: "user" as const,
          content: "Write a very long story about adventures.",
        },
      ];

      const { stream } = await callAIStream(messages, "backend", {
        maxTokens: 50,
      });

      const result = await parseSSEStream(stream);

      // If usage is reported, completion tokens should be limited
      if (result.usage) {
        expect(result.usage.completion_tokens).toBeLessThanOrEqual(60); // Allow slight overage
      }
    });
  });
});
