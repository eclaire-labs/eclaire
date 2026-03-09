/**
 * RuntimeAgent Tests
 *
 * Tests for the new RuntimeAgent using mock AI responses.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";

import { RuntimeAgent } from "../runtime/agent/runtime-agent.js";
import { createRuntimeContext } from "../runtime/agent/types.js";
import type { RuntimeToolDefinition } from "../runtime/tools/types.js";
import { textResult } from "../runtime/tools/types.js";
import type { RuntimeMessage, RuntimeStreamEvent } from "../runtime/messages.js";

import { initAI, resetAI } from "../index.js";
import {
  createMockFetch,
  createMockLoggerFactory,
  createOpenAIResponse,
  getFixturesPath,
  createSSEStream,
  sseContentDelta,
  sseFinishReason,
  sseUsage,
  sseDone,
  sseToolCallDelta,
} from "./setup.js";

// =============================================================================
// SETUP
// =============================================================================

let mockFetch: ReturnType<typeof createMockFetch>;
let loggerFactory: ReturnType<typeof createMockLoggerFactory>;

beforeEach(() => {
  mockFetch = createMockFetch();
  loggerFactory = createMockLoggerFactory();

  vi.stubGlobal("fetch", mockFetch.fetch);
  initAI({
    configPath: getFixturesPath(),
    createChildLogger: loggerFactory.factory,
  });
});

afterEach(() => {
  resetAI();
  vi.unstubAllGlobals();
  mockFetch.reset();
  loggerFactory.reset();
});

// =============================================================================
// TEST TOOLS
// =============================================================================

const searchTool: RuntimeToolDefinition = {
  name: "search",
  label: "Search",
  description: "Search for items",
  inputSchema: z.object({ query: z.string() }),
  promptSnippet: "Use search to find items in the knowledge base.",
  execute: async (_callId, input) => {
    return textResult(`Found results for: ${input.query}`, { count: 3 });
  },
};


// =============================================================================
// TESTS
// =============================================================================

describe("RuntimeAgent", () => {
  describe("generate (non-streaming)", () => {
    it("completes a simple prompt without tools", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Hello! How can I help?" }),
      );

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: {},
      });

      const context = createRuntimeContext({ userId: "user_1" });
      const result = await agent.generate({ prompt: "Hi there", context });

      expect(result.text).toBe("Hello! How can I help?");
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]!.isTerminal).toBe(true);
      expect(result.steps[0]!.stopReason).toBe("no_tool_calls");
      expect(result.messages).toHaveLength(2); // user + assistant
    });

    it("preserves system prompt in LLM call", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are a pirate.",
        tools: {},
      });

      const context = createRuntimeContext({ userId: "user_1" });
      await agent.generate({ prompt: "Hello", context });

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[0].content).toBe("You are a pirate.");
      expect(requestBody.messages[1].role).toBe("user");
      expect(requestBody.messages[1].content).toBe("Hello");
    });

    it("handles tool calling loop", async () => {
      // Step 1: AI calls search tool
      mockFetch.queueJsonResponse(
        createOpenAIResponse({
          content: "I'll search for that.",
          toolCalls: [
            { id: "call_1", name: "search", arguments: { query: "cats" } },
          ],
          finishReason: "tool_calls",
        }),
      );

      // Step 2: AI responds with final answer
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "I found 3 results about cats." }),
      );

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: { search: searchTool },
      });

      const context = createRuntimeContext({ userId: "user_1" });
      const result = await agent.generate({ prompt: "Find cats", context });

      expect(result.text).toBe("I found 3 results about cats.");
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0]!.toolExecutions).toHaveLength(1);
      expect(result.steps[0]!.toolExecutions![0]!.toolName).toBe("search");
      expect(result.steps[0]!.toolExecutions![0]!.result.isError).toBeUndefined();
      expect(result.toolCallSummaries).toHaveLength(1);
    });

    it("handles unknown tool gracefully", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({
          content: "",
          toolCalls: [
            { id: "call_1", name: "unknownTool", arguments: {} },
          ],
          finishReason: "tool_calls",
        }),
      );

      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Sorry, I had an issue." }),
      );

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: { search: searchTool },
      });

      const context = createRuntimeContext({ userId: "user_1" });
      const result = await agent.generate({ prompt: "Do something", context });

      // Should have error in tool result
      expect(result.steps[0]!.toolExecutions).toHaveLength(1);
      expect(result.steps[0]!.toolExecutions![0]!.result.isError).toBe(true);
    });

    it("respects maxSteps", async () => {
      // Queue many tool calls but agent should stop at maxSteps
      for (let i = 0; i < 4; i++) {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: `Step ${i}`,
            toolCalls: [
              { id: `call_${i}`, name: "search", arguments: { query: `q${i}` } },
            ],
            finishReason: "tool_calls",
          }),
        );
      }

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: { search: searchTool },
        maxSteps: 3,
      });

      const context = createRuntimeContext({ userId: "user_1" });
      const result = await agent.generate({ prompt: "Loop", context });

      // Should stop at step 4 (maxSteps + 1 terminal step)
      expect(result.steps.length).toBeLessThanOrEqual(4);
      const lastStep = result.steps[result.steps.length - 1]!;
      expect(lastStep.isTerminal).toBe(true);
    });

    it("preserves previous messages for conversation continuity", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Your name is Alice!" }),
      );

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: {},
      });

      const previousMessages: RuntimeMessage[] = [
        { role: "user", content: "My name is Alice", timestamp: Date.now() },
        { role: "assistant", content: [{ type: "text", text: "Nice to meet you Alice!" }] },
      ];

      const context = createRuntimeContext({ userId: "user_1" });
      await agent.generate({
        prompt: "What's my name?",
        context,
        messages: previousMessages,
      });

      // LLM should receive: system + prev_user + prev_assistant + new_user
      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.messages).toHaveLength(4);
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[1].content).toBe("My name is Alice");
      expect(requestBody.messages[2].content).toBe("Nice to meet you Alice!");
      expect(requestBody.messages[3].content).toBe("What's my name?");
    });

    it("uses dynamic instructions function", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: (ctx) => `You are helping user ${ctx.userId}`,
        tools: {},
      });

      const context = createRuntimeContext({ userId: "alice" });
      await agent.generate({ prompt: "Hello", context });

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.messages[0].content).toBe("You are helping user alice");
    });
  });

  describe("stream", () => {
    it("streams text content", async () => {
      const sseStream = createSSEStream([
        sseContentDelta("Hello "),
        sseContentDelta("World!"),
        sseUsage(10, 5),
        sseFinishReason("stop"),
        sseDone(),
      ]);

      mockFetch.queueStreamResponse(sseStream);

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: {},
      });

      const context = createRuntimeContext({ userId: "user_1" });
      const { eventStream, result: resultPromise } = agent.stream({
        prompt: "Hi",
        context,
      });

      // Collect events
      const events: RuntimeStreamEvent[] = [];
      const reader = eventStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        events.push(value);
      }

      const result = await resultPromise;
      expect(result.text).toBe("Hello World!");

      // Should have text_delta events
      const textDeltas = events.filter((e) => e.type === "text_delta");
      expect(textDeltas.length).toBeGreaterThan(0);

      // Should have message_complete event
      const messageComplete = events.find((e) => e.type === "message_complete");
      expect(messageComplete).toBeDefined();

      // Should have turn_complete event
      const turnComplete = events.find((e) => e.type === "turn_complete");
      expect(turnComplete).toBeDefined();
    });

    it("streams tool execution with results", async () => {
      // Step 1: AI calls search
      const step1Stream = createSSEStream([
        sseToolCallDelta(0, "call_1", "search"),
        sseToolCallDelta(0, undefined, undefined, '{"query":"cats"}'),
        sseFinishReason("tool_calls"),
        sseDone(),
      ]);
      mockFetch.queueStreamResponse(step1Stream);

      // Step 2: Final response
      const step2Stream = createSSEStream([
        sseContentDelta("Found cats!"),
        sseFinishReason("stop"),
        sseDone(),
      ]);
      mockFetch.queueStreamResponse(step2Stream);

      const agent = new RuntimeAgent({
        aiContext: "backend",
        instructions: "You are helpful.",
        tools: { search: searchTool },
      });

      const context = createRuntimeContext({ userId: "user_1" });
      const { eventStream, result: resultPromise } = agent.stream({
        prompt: "Find cats",
        context,
      });

      const events: RuntimeStreamEvent[] = [];
      const reader = eventStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        events.push(value);
      }

      const result = await resultPromise;
      expect(result.text).toBe("Found cats!");

      // Should have tool_result event
      const toolResults = events.filter((e) => e.type === "tool_result");
      expect(toolResults.length).toBeGreaterThan(0);
    });
  });

  describe("createRuntimeContext", () => {
    it("creates context with defaults", () => {
      const ctx = createRuntimeContext({ userId: "alice" });
      expect(ctx.userId).toBe("alice");
      expect(ctx.requestId).toBeDefined();
      expect(ctx.startTime).toBeGreaterThan(0);
    });

    it("creates context with all options", () => {
      const controller = new AbortController();
      const ctx = createRuntimeContext({
        userId: "alice",
        requestId: "req_123",
        sessionId: "session_1",
        conversationId: "conv_1",
        abortSignal: controller.signal,
        extra: { role: "admin" },
      });
      expect(ctx.userId).toBe("alice");
      expect(ctx.requestId).toBe("req_123");
      expect(ctx.sessionId).toBe("session_1");
      expect(ctx.conversationId).toBe("conv_1");
      expect(ctx.abortSignal).toBe(controller.signal);
      expect(ctx.extra).toEqual({ role: "admin" });
    });
  });
});
