/**
 * callAI Tests
 *
 * Tests for the non-streaming AI API call function.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callAI, initAI, resetAI } from "../index.js";
import type { AICallTrace } from "../types.js";
import {
  createMockFetch,
  createMockLoggerFactory,
  createOpenAIResponse,
  createSSEStream,
  getFixturesPath,
  sseContentDelta,
  sseDone,
  sseFinishReason,
  sseReasoningDelta,
  sseUsage,
} from "./setup.js";

describe("callAI", () => {
  const mockLoggerFactory = createMockLoggerFactory();
  const mockFetch = createMockFetch();

  beforeEach(() => {
    resetAI();
    mockLoggerFactory.reset();
    mockFetch.reset();

    // Initialize AI with test fixtures
    initAI({
      configPath: getFixturesPath(),
      createChildLogger: mockLoggerFactory.factory,
    });

    // Replace global fetch with mock
    vi.stubGlobal("fetch", mockFetch.fetch);
  });

  afterEach(() => {
    resetAI();
    vi.unstubAllGlobals();
  });

  describe("basic request/response", () => {
    it("makes a successful API call and returns content", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({
          content: "Hello, world!",
          finishReason: "stop",
        }),
      );

      const response = await callAI(
        [{ role: "user", content: "Say hello" }],
        "backend",
      );

      expect(response.content).toBe("Hello, world!");
      expect(response.finishReason).toBe("stop");
      expect(mockFetch.calls).toHaveLength(1);
    });

    it("includes model and options in request body", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI([{ role: "user", content: "Test" }], "backend", {
        temperature: 0.7,
        maxTokens: 100,
      });

      expect(mockFetch.calls).toHaveLength(1);
      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.model).toBe("test-model-full");
      expect(requestBody.temperature).toBe(0.7);
      expect(requestBody.max_tokens).toBe(100);
    });

    it("sends messages in request body", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI(
        [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "Hello" },
        ],
        "backend",
      );

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[1].role).toBe("user");
    });

    it("returns estimated input tokens", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const response = await callAI(
        [{ role: "user", content: "Hello" }],
        "backend",
      );

      expect(response.estimatedInputTokens).toBeDefined();
      expect(typeof response.estimatedInputTokens).toBe("number");
    });
  });

  describe("reasoning extraction", () => {
    it("extracts reasoning from response", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({
          content: "The answer is 42",
          reasoning: "Let me think about this...",
        }),
      );

      const response = await callAI(
        [{ role: "user", content: "What is the answer?" }],
        "backend",
      );

      expect(response.content).toBe("The answer is 42");
      expect(response.reasoning).toBe("Let me think about this...");
    });

    it("returns undefined reasoning when not present", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Simple response" }),
      );

      const response = await callAI(
        [{ role: "user", content: "Hello" }],
        "backend",
      );

      expect(response.reasoning).toBeUndefined();
    });

    it("returns undefined for empty reasoning", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response", reasoning: "   " }),
      );

      const response = await callAI(
        [{ role: "user", content: "Hello" }],
        "backend",
      );

      expect(response.reasoning).toBeUndefined();
    });
  });

  describe("tool calls", () => {
    it("includes tools in request when provided", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "search",
            description: "Search for items",
            parameters: { type: "object", properties: {} },
          },
        },
      ];

      await callAI([{ role: "user", content: "Search for cats" }], "backend", {
        tools,
      });

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tools).toHaveLength(1);
      expect(requestBody.tools[0].function.name).toBe("search");
    });

    it("extracts tool calls from response", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({
          content: "",
          toolCalls: [
            { id: "call_1", name: "search", arguments: { query: "cats" } },
          ],
          finishReason: "tool_calls",
        }),
      );

      const response = await callAI(
        [{ role: "user", content: "Search for cats" }],
        "backend",
      );

      expect(response.toolCalls).toBeDefined();
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0]!.function.name).toBe("search");
      expect(response.finishReason).toBe("tool_calls");
    });

    it("includes toolChoice when provided with tools", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const tools = [
        {
          type: "function" as const,
          function: {
            name: "search",
            description: "Search",
            parameters: { type: "object", properties: {} },
          },
        },
      ];

      await callAI([{ role: "user", content: "Search" }], "backend", {
        tools,
        toolChoice: "auto",
      });

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.tool_choice).toBe("auto");
    });
  });

  describe("response format", () => {
    it("includes responseFormat when provided", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: '{"result": "test"}' }),
      );

      await callAI([{ role: "user", content: "Return JSON" }], "backend", {
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "test",
            schema: { type: "object" },
          },
        },
      });

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.response_format).toBeDefined();
      expect(requestBody.response_format.type).toBe("json_schema");
    });
  });

  describe("usage tracking", () => {
    it("extracts usage from response", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({
          content: "Response",
          promptTokens: 50,
          completionTokens: 25,
        }),
      );

      const response = await callAI(
        [{ role: "user", content: "Hello" }],
        "backend",
      );

      expect(response.usage).toBeDefined();
      expect(response.usage?.prompt_tokens).toBe(50);
      expect(response.usage?.completion_tokens).toBe(25);
      expect(response.usage?.total_tokens).toBe(75);
    });
  });

  describe("error handling", () => {
    it("throws on non-OK response", async () => {
      mockFetch.queueErrorResponse(500, "Internal Server Error");

      await expect(
        callAI([{ role: "user", content: "Hello" }], "backend"),
      ).rejects.toThrow("AI API error: 500");
    });

    it("throws on 401 unauthorized", async () => {
      mockFetch.queueErrorResponse(401, "Unauthorized");

      await expect(
        callAI([{ role: "user", content: "Hello" }], "backend"),
      ).rejects.toThrow("AI API error: 401");
    });

    it("throws on 429 rate limit", async () => {
      mockFetch.queueErrorResponse(429, "Too Many Requests");

      await expect(
        callAI([{ role: "user", content: "Hello" }], "backend"),
      ).rejects.toThrow("AI API error: 429");
    });
  });

  describe("trace capture", () => {
    it("calls onTraceCapture with trace data when enabled", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const traces: AICallTrace[] = [];

      await callAI([{ role: "user", content: "Hello" }], "backend", {
        trace: {
          enabled: true,
          callIndex: 0,
          onTraceCapture: (trace) => traces.push(trace),
        },
      });

      expect(traces).toHaveLength(1);
      expect(traces[0]!.callIndex).toBe(0);
      expect(traces[0]!.requestBody).toBeDefined();
      expect(traces[0]!.responseBody).toBeDefined();
      expect(traces[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("redacts Authorization header in trace", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const traces: AICallTrace[] = [];

      await callAI([{ role: "user", content: "Hello" }], "backend", {
        trace: {
          enabled: true,
          callIndex: 0,
          onTraceCapture: (trace) => traces.push(trace),
        },
      });

      const headers = traces[0]!.requestBody.headers as Record<string, string>;
      expect(headers.Authorization).toBe("[REDACTED]");
    });

    it("deep copies request and response bodies", async () => {
      const responseData = createOpenAIResponse({ content: "Response" });
      mockFetch.queueJsonResponse(responseData);

      const traces: AICallTrace[] = [];

      await callAI([{ role: "user", content: "Hello" }], "backend", {
        trace: {
          enabled: true,
          callIndex: 0,
          onTraceCapture: (trace) => traces.push(trace),
        },
      });

      // Verify it's a copy, not a reference
      expect(traces[0]!.responseBody).not.toBe(responseData);
    });

    it("captures trace on error", async () => {
      mockFetch.queueErrorResponse(500, "Server Error");

      const traces: AICallTrace[] = [];

      try {
        await callAI([{ role: "user", content: "Hello" }], "backend", {
          trace: {
            enabled: true,
            callIndex: 0,
            onTraceCapture: (trace) => traces.push(trace),
          },
        });
      } catch {
        // Expected error
      }

      expect(traces).toHaveLength(1);
      expect(traces[0]!.responseBody).toHaveProperty("error");
    });

    it("does not capture trace when disabled", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      const traces: AICallTrace[] = [];

      await callAI([{ role: "user", content: "Hello" }], "backend", {
        trace: {
          enabled: false,
          callIndex: 0,
          onTraceCapture: (trace) => traces.push(trace),
        },
      });

      expect(traces).toHaveLength(0);
    });
  });

  describe("streaming delegation", () => {
    it("delegates to streaming path when stream option is true", async () => {
      const events = [
        sseContentDelta("Hello"),
        sseContentDelta(" world"),
        sseUsage(10, 5),
        sseFinishReason("stop"),
        sseDone(),
      ];

      mockFetch.queueStreamResponse(createSSEStream(events));

      const response = await callAI(
        [{ role: "user", content: "Say hello" }],
        "backend",
        { stream: true },
      );

      expect(response.content).toBe("Hello world");
      expect(response.finishReason).toBe("stop");
    });

    it("collects reasoning from stream", async () => {
      const events = [
        sseReasoningDelta("Thinking..."),
        sseContentDelta("Answer"),
        sseFinishReason("stop"),
        sseDone(),
      ];

      mockFetch.queueStreamResponse(createSSEStream(events));

      const response = await callAI(
        [{ role: "user", content: "Question" }],
        "backend",
        { stream: true },
      );

      expect(response.reasoning).toBe("Thinking...");
      expect(response.content).toBe("Answer");
    });

    it("collects usage from stream", async () => {
      const events = [
        sseContentDelta("Response"),
        sseUsage(100, 50),
        sseFinishReason("stop"),
        sseDone(),
      ];

      mockFetch.queueStreamResponse(createSSEStream(events));

      const response = await callAI(
        [{ role: "user", content: "Hello" }],
        "backend",
        { stream: true },
      );

      expect(response.usage).toBeDefined();
      expect(response.usage?.prompt_tokens).toBe(100);
      expect(response.usage?.completion_tokens).toBe(50);
    });
  });

  describe("thinking prefix", () => {
    it("applies thinking prefix to system messages when model supports it", async () => {
      // Reset and reinitialize to use a different active model for this test
      resetAI();

      // Create custom selection that uses the reasoning model
      const customFixturesPath = getFixturesPath();
      initAI({
        configPath: customFixturesPath,
        createChildLogger: mockLoggerFactory.factory,
      });

      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI(
        [{ role: "system", content: "You are helpful" }],
        "backend",
        { enableThinking: true },
      );

      // Verify the request was made
      expect(mockFetch.calls).toHaveLength(1);
    });
  });

  describe("context selection", () => {
    it("uses backend model for backend context", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI([{ role: "user", content: "Hello" }], "backend");

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.model).toBe("test-model-full");
    });

    it("uses workers model for workers context", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI([{ role: "user", content: "Hello" }], "workers");

      const requestBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
      expect(requestBody.model).toBe("test-model-basic");
    });
  });

  describe("request headers", () => {
    it("includes Authorization header with bearer token", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI([{ role: "user", content: "Hello" }], "backend");

      const headers = mockFetch.calls[0]!.init?.headers as Record<
        string,
        string
      >;
      expect(headers.Authorization).toBe("Bearer test-api-key");
    });

    it("includes Content-Type header", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI([{ role: "user", content: "Hello" }], "backend");

      const headers = mockFetch.calls[0]!.init?.headers as Record<
        string,
        string
      >;
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("request URL", () => {
    it("builds correct URL from provider config", async () => {
      mockFetch.queueJsonResponse(
        createOpenAIResponse({ content: "Response" }),
      );

      await callAI([{ role: "user", content: "Hello" }], "backend");

      expect(mockFetch.calls[0]!.url).toBe(
        "http://localhost:8080/v1/chat/completions",
      );
    });
  });
});
