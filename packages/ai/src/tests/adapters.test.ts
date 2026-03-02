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
  createLazyLogger: () => () => createMockLoggerFactory().factory("ai-adapters"),
  getErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error ?? "Unknown error"),
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

      it("uses 'input' field instead of 'messages'", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [
              { role: "system", content: "Be helpful" },
              { role: "user", content: "Hello" },
            ],
            model: "test-model",
            options: {},
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.input).toBeDefined();
        expect(body.messages).toBeUndefined();
        expect(body.input).toHaveLength(2);
      });

      it("uses max_output_tokens instead of max_tokens", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: { maxTokens: 500 },
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.max_output_tokens).toBe(500);
        expect(body.max_tokens).toBeUndefined();
      });

      it("passes temperature through", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: { temperature: 0.3 },
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.temperature).toBe(0.3);
      });

      it("defaults stream to false", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.stream).toBe(false);
      });

      it("sets stream to true when requested", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
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

      it("includes top_p when specified", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: { top_p: 0.9 },
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.top_p).toBe(0.9);
      });

      it("omits top_p when not specified", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "none" },
        );

        const body = request.body as Record<string, unknown>;
        expect(body.top_p).toBeUndefined();
      });

      it("uses default /responses endpoint when empty", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "none" },
        );

        expect(request.url).toBe("http://localhost:8081/responses");
      });

      it("includes custom headers", () => {
        const request = mlxNativeAdapter.buildRequest(
          "http://localhost:8081",
          "/responses",
          {
            messages: [{ role: "user", content: "Hello" }],
            model: "test-model",
            options: {},
          },
          { type: "none" },
          { "X-Custom": "value" },
        );

        expect(request.headers["X-Custom"]).toBe("value");
        expect(request.headers["Content-Type"]).toBe("application/json");
      });
    });

    describe("parseResponse", () => {
      it("extracts content from response.output_text", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          response: { output_text: "Hello from MLX" },
        });

        expect(parsed.content).toBe("Hello from MLX");
        expect(parsed.finishReason).toBe("stop");
      });

      it("extracts content from response.text", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          response: { text: "Hello from MLX" },
        });

        expect(parsed.content).toBe("Hello from MLX");
      });

      it("extracts content from top-level output_text", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          output_text: "Hello from MLX",
        });

        expect(parsed.content).toBe("Hello from MLX");
      });

      it("extracts content from top-level text", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          text: "Hello from MLX",
        });

        expect(parsed.content).toBe("Hello from MLX");
      });

      it("extracts content from top-level content field", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          content: "Hello from MLX",
        });

        expect(parsed.content).toBe("Hello from MLX");
      });

      it("prefers response.output_text over other fields", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          response: { output_text: "preferred" },
          output_text: "fallback",
          text: "other",
        });

        expect(parsed.content).toBe("preferred");
      });

      it("throws on empty response", () => {
        expect(() => mlxNativeAdapter.parseResponse({})).toThrow(
          "No content in MLX response",
        );
      });

      it("returns no toolCalls, usage, or reasoning", () => {
        const parsed = mlxNativeAdapter.parseResponse({
          response: { output_text: "Hello" },
        });

        expect(parsed.toolCalls).toBeUndefined();
        expect(parsed.usage).toBeUndefined();
        expect(parsed.reasoning).toBeUndefined();
      });
    });

    describe("transformStream", () => {
      /**
       * Helper to create an MLX-style SSE input stream
       */
      function createMLXStream(lines: string[]): ReadableStream<Uint8Array> {
        const encoder = new TextEncoder();
        return new ReadableStream({
          start(controller) {
            for (const line of lines) {
              controller.enqueue(encoder.encode(`${line}\n`));
            }
            controller.close();
          },
        });
      }

      /**
       * Helper to consume a stream and return all decoded chunks
       */
      async function consumeStream(
        stream: ReadableStream<Uint8Array>,
      ): Promise<string[]> {
        const decoder = new TextDecoder();
        const reader = stream.getReader();
        const chunks: string[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(decoder.decode(value));
        }
        return chunks;
      }

      it("transforms stream (returns a stream)", async () => {
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

      it("converts output_text delta events to OpenAI content deltas", async () => {
        const input = createMLXStream([
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: " world" })}`,
        ]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        // Should contain OpenAI-format content deltas
        expect(joined).toContain('"content":"Hello"');
        expect(joined).toContain('"content":" world"');
        expect(joined).toContain('"finish_reason":null');
      });

      it("converts response.completed to OpenAI finish_reason stop", async () => {
        const input = createMLXStream([
          `data: ${JSON.stringify({ type: "response.completed" })}`,
        ]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        expect(joined).toContain('"finish_reason":"stop"');
      });

      it("skips empty delta content", async () => {
        const input = createMLXStream([
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "" })}`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "actual" })}`,
        ]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        // Should only contain the non-empty delta
        expect(joined).toContain('"content":"actual"');
        // The empty delta should not produce a content event
        const contentMatches = joined.match(/"content"/g);
        expect(contentMatches).toHaveLength(1);
      });

      it("passes through [DONE] marker", async () => {
        const input = createMLXStream(["data: [DONE]"]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        expect(joined).toContain("data: [DONE]");
      });

      it("emits [DONE] at end of stream", async () => {
        const input = createMLXStream([
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hi" })}`,
        ]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        // Stream close should emit [DONE]
        expect(joined).toContain("data: [DONE]");
      });

      it("passes through comments and empty lines", async () => {
        const input = createMLXStream([": this is a comment", ""]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        expect(joined).toContain(": this is a comment");
      });

      it("handles malformed JSON data lines gracefully", async () => {
        const input = createMLXStream([
          "data: {not valid json",
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "ok" })}`,
        ]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        // Should still process valid events after malformed one
        expect(joined).toContain('"content":"ok"');
      });

      it("silently skips unknown event types", async () => {
        const input = createMLXStream([
          `data: ${JSON.stringify({ type: "response.unknown_event", data: "foo" })}`,
          `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "real" })}`,
        ]);

        const output = await consumeStream(
          mlxNativeAdapter.transformStream(input),
        );
        const joined = output.join("");

        // Unknown event should not produce output, but known one should
        expect(joined).toContain('"content":"real"');
        expect(joined).not.toContain("unknown_event");
      });
    });
  });
});
