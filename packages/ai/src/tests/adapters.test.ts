/**
 * Adapters Tests
 *
 * Tests for adapter selection and request/response transformation.
 */

import { describe, expect, it, vi } from "vitest";
import {
  getAdapter,
  isDialectSupported,
  mlxNativeAdapter,
  openaiCompatibleAdapter,
} from "../adapters/index.js";
import { createMockLoggerFactory } from "./setup.js";

// Mock the logger module
vi.mock("../logger.js", () => ({
  createAILogger: () => createMockLoggerFactory().factory("ai-adapters"),
}));

describe("Adapters", () => {
  describe("getAdapter", () => {
    it("returns openai_compatible adapter", () => {
      const adapter = getAdapter("openai_compatible");

      expect(adapter).toBeDefined();
      expect(adapter).toBe(openaiCompatibleAdapter);
    });

    it("returns mlx_native adapter", () => {
      const adapter = getAdapter("mlx_native");

      expect(adapter).toBeDefined();
      expect(adapter).toBe(mlxNativeAdapter);
    });

    it("throws for unknown dialect", () => {
      expect(() => getAdapter("unknown-dialect" as any)).toThrow();
    });
  });

  describe("isDialectSupported", () => {
    it("returns true for known dialects", () => {
      expect(isDialectSupported("openai_compatible")).toBe(true);
      expect(isDialectSupported("mlx_native")).toBe(true);
      expect(isDialectSupported("anthropic_messages")).toBe(true);
    });

    it("returns false for unknown dialects", () => {
      expect(isDialectSupported("unknown" as any)).toBe(false);
    });
  });

  describe("OpenAI Compatible Adapter", () => {
    describe("buildRequest", () => {
      it("formats request correctly", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {
              temperature: 0.7,
              maxTokens: 100,
            },
          },
          { type: "none" },
        );

        expect(request.url).toBe("http://localhost:8080/v1/chat/completions");
        expect(request.method).toBe("POST");
        const body = request.body as Record<string, unknown>;
        expect(body.model).toBe("test-model");
        expect(body.messages).toHaveLength(1);
        expect(body.temperature).toBe(0.7);
        expect(body.max_tokens).toBe(100);
      });

      it("handles bearer auth with new format", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          {
            type: "bearer",
            header: "Authorization",
            value: "Bearer test-api-key",
          },
        );

        expect(request.headers.Authorization).toBe("Bearer test-api-key");
      });

      it("handles header auth", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "header", header: "X-API-Key", value: "test-key" },
        );

        expect(request.headers["X-API-Key"]).toBe("test-key");
      });

      it("handles no auth", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "none" },
        );

        expect(request.headers.Authorization).toBeUndefined();
      });

      it("includes tools in body", () => {
        const tools = [
          {
            type: "function" as const,
            function: {
              name: "search",
              description: "Search for items",
              parameters: { type: "object" },
            },
          },
        ];

        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: { tools },
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.tools).toEqual(tools);
      });

      it("includes responseFormat", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {
              responseFormat: {
                type: "json_schema",
                json_schema: { name: "test", schema: {} },
              },
            },
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.response_format).toBeDefined();
        expect((body.response_format as Record<string, unknown>).type).toBe(
          "json_schema",
        );
      });

      it("includes custom headers", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "none" },
          { "X-Custom-Header": "custom-value" },
        );

        expect(request.headers["X-Custom-Header"]).toBe("custom-value");
      });

      it("includes stream option", () => {
        const request = openaiCompatibleAdapter.buildRequest(
          "http://localhost:8080/v1",
          "/chat/completions",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: { stream: true },
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.stream).toBe(true);
      });
    });

    describe("parseResponse", () => {
      it("extracts content from OpenAI response", () => {
        const response = {
          id: "test-id",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Hello there!",
              },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        };

        const parsed = openaiCompatibleAdapter.parseResponse(response);

        expect(parsed.content).toBe("Hello there!");
        expect(parsed.finishReason).toBe("stop");
        expect(parsed.usage?.prompt_tokens).toBe(10);
      });

      it("extracts tool_calls from response", () => {
        const response = {
          id: "test-id",
          choices: [
            {
              message: {
                role: "assistant",
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "search",
                      arguments: '{"query": "test"}',
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        };

        const parsed = openaiCompatibleAdapter.parseResponse(response);

        expect(parsed.toolCalls).toHaveLength(1);
        expect(parsed.toolCalls![0]!.function.name).toBe("search");
        expect(parsed.finishReason).toBe("tool_calls");
      });

      it("extracts usage", () => {
        const response = {
          id: "test-id",
          choices: [
            {
              message: { role: "assistant", content: "Response" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        };

        const parsed = openaiCompatibleAdapter.parseResponse(response);

        expect(parsed.usage).toEqual({
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        });
      });

      it("extracts reasoning field", () => {
        const response = {
          id: "test-id",
          choices: [
            {
              message: {
                role: "assistant",
                content: "Response",
                reasoning: "Let me think about this...",
              },
              finish_reason: "stop",
            },
          ],
        };

        const parsed = openaiCompatibleAdapter.parseResponse(response);

        expect(parsed.reasoning).toBe("Let me think about this...");
      });
    });
  });

  describe("MLX Native Adapter", () => {
    describe("buildRequest", () => {
      it("formats request correctly", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {
              temperature: 0.7,
              maxTokens: 100,
            },
          },
          { type: "none" },
        );

        expect(request.url).toBe("http://localhost:8081/responses");
        expect(request.method).toBe("POST");
        const body = request.body as Record<string, unknown>;
        expect(body.model).toBe("test-model");
      });
    });

    describe("transformStream", () => {
      it("transforms stream (returns a stream)", async () => {
        // Create a simple input stream
        const encoder = new TextEncoder();
        const inputStream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('{"content":"test"}'));
            controller.close();
          },
        });

        const transformedStream = mlxNativeAdapter.transformStream(inputStream);

        expect(transformedStream).toBeInstanceOf(ReadableStream);
      });
    });
  });
});
