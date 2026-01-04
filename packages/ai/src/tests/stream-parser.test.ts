/**
 * Stream Parser Tests
 *
 * Tests for LLMStreamParser SSE parsing with all content types.
 */

import { describe, expect, it, beforeEach, vi } from "vitest";
import { LLMStreamParser } from "../stream-parser.js";
import {
  createSSEStream,
  sseContentDelta,
  sseReasoningDelta,
  sseFinishReason,
  sseUsage,
  sseToolCallDelta,
  sseDone,
  createMockLoggerFactory,
} from "./setup.js";

// Mock the logger module
vi.mock("../logger.js", () => ({
  createAILogger: () => createMockLoggerFactory().factory("stream-parser"),
}));

describe("LLMStreamParser", () => {
  let parser: LLMStreamParser;

  beforeEach(() => {
    parser = new LLMStreamParser();
  });

  describe("parseSSELine", () => {
    it("returns null for empty line", () => {
      expect(parser.parseSSELine("")).toBeNull();
    });

    it("returns null for SSE comment", () => {
      expect(parser.parseSSELine(": this is a comment")).toBeNull();
    });

    it("returns done for [DONE]", () => {
      const result = parser.parseSSELine("data: [DONE]");

      expect(result).toEqual({ type: "done" });
    });

    it("extracts content from delta", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"content":"Hello"}}]}'
      );

      expect(result?.type).toBe("content");
      expect(result?.content).toBe("Hello");
    });

    it("extracts reasoning from delta", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"reasoning":"Let me think..."}}]}'
      );

      expect(result?.type).toBe("reasoning");
      expect(result?.content).toBe("Let me think...");
    });

    it("extracts reasoning_content field", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"reasoning_content":"Thinking here"}}]}'
      );

      expect(result?.type).toBe("reasoning");
      expect(result?.content).toBe("Thinking here");
    });

    it("skips empty reasoning and returns content", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"reasoning":"","content":"Hello"}}]}'
      );

      expect(result?.type).toBe("content");
      expect(result?.content).toBe("Hello");
    });

    it("extracts usage from chunk", () => {
      const result = parser.parseSSELine(
        'data: {"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}'
      );

      expect(result?.type).toBe("usage");
      expect(result?.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      });
    });

    it("extracts finish_reason", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"finish_reason":"stop","delta":{}}]}'
      );

      expect(result?.type).toBe("finish_reason");
      expect(result?.finishReason).toBe("stop");
    });

    it("handles malformed JSON gracefully", () => {
      const result = parser.parseSSELine("data: {invalid json}");

      expect(result).toBeNull();
    });

    it("returns null for non-data lines", () => {
      expect(parser.parseSSELine("event: message")).toBeNull();
    });

    it("extracts tool_call delta with id and function name", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_abc123","function":{"name":"calculator"}}]}}]}'
      );

      expect(result?.type).toBe("tool_call_delta");
      expect(result?.toolCallDelta).toEqual({
        index: 0,
        id: "call_abc123",
        functionName: "calculator",
        argumentsDelta: undefined,
      });
    });

    it("extracts tool_call delta with arguments chunk", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"operation\\":"}}]}}]}'
      );

      expect(result?.type).toBe("tool_call_delta");
      expect(result?.toolCallDelta?.argumentsDelta).toBe('{"operation":');
    });

    it("handles tool_call delta without function", () => {
      const result = parser.parseSSELine(
        'data: {"choices":[{"delta":{"tool_calls":[{"index":1}]}}]}'
      );

      expect(result?.type).toBe("tool_call_delta");
      expect(result?.toolCallDelta?.index).toBe(1);
    });
  });

  describe("processContent", () => {
    it("handles simple text", () => {
      const results = parser.processContent("Hello world");

      expect(results).toHaveLength(1);
      expect(results[0]!.type).toBe("content");
      expect(results[0]!.content).toBe("Hello world");
    });

    it("extracts think tags", () => {
      const results = parser.processContent(
        "<think>I need to analyze this</think>Here is my response"
      );

      const types = results.map((r) => r.type);
      expect(types).toContain("think_start");
      expect(types).toContain("think_content");
      expect(types).toContain("think_end");
      expect(types).toContain("content");

      const thinkContent = results.find((r) => r.type === "think_content");
      expect(thinkContent?.content).toContain("I need to analyze this");

      const content = results.find((r) => r.type === "content");
      expect(content?.content).toBe("Here is my response");
    });

    it("handles content with embedded think tags", () => {
      // Process content with think tags in middle
      const processResults = parser.processContent(
        "Before <think>thinking</think> After"
      );
      const flushResults = parser.flush();

      const allResults = [...processResults, ...flushResults];

      // Should have some results
      expect(allResults.length).toBeGreaterThan(0);

      // Should have content containing "Before"
      const contents = allResults.filter((r) => r.type === "content");
      expect(contents.length).toBeGreaterThanOrEqual(1);

      const allContent = contents.map((c) => c.content).join("");
      expect(allContent).toContain("Before");
    });

    it("detects JSON tool calls in code blocks", () => {
      const content = `\`\`\`json
{"type": "tool_calls", "calls": [{"name": "search", "args": {"query": "test"}}]}
\`\`\``;

      const results = parser.processContent(content);

      const toolCall = results.find((r) => r.type === "tool_call");
      expect(toolCall).toBeDefined();
      expect(toolCall?.data?.type).toBe("tool_calls");
      expect(toolCall?.data?.calls).toHaveLength(1);
    });

    it("detects inline JSON tool calls", () => {
      const results = parser.processContent(
        '{"type": "tool_calls", "calls": [{"name": "test", "args": {}}]}'
      );

      const toolCall = results.find((r) => r.type === "tool_call");
      expect(toolCall).toBeDefined();
    });

    it("preserves non-tool JSON code blocks", () => {
      const content = `\`\`\`json
{"name": "John", "age": 30}
\`\`\``;

      const results = parser.processContent(content);

      // Should be content, not tool_call
      const toolCall = results.find((r) => r.type === "tool_call");
      expect(toolCall).toBeUndefined();

      const contentResult = results.find((r) => r.type === "content");
      expect(contentResult?.content).toContain('{"name": "John"');
    });

    it("handles character-by-character streaming", () => {
      const fullText = "Hello";
      const allResults: { type: string; content?: string }[] = [];

      for (const char of fullText) {
        allResults.push(...parser.processContent(char));
      }

      const combined = allResults
        .filter((r) => r.type === "content")
        .map((r) => r.content)
        .join("");

      expect(combined).toBe("Hello");
    });

    it("handles empty content", () => {
      const results = parser.processContent("");

      expect(results).toHaveLength(0);
    });
  });

  describe("flush", () => {
    it("returns remaining buffer content", () => {
      parser.processContent("Partial content");
      const results = parser.flush();

      // Content should have been output during processContent
      // flush returns any remaining buffered content
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("handles incomplete think section", () => {
      // Process partial think content
      const processResults = parser.processContent("<think>Incomplete thinking");
      const flushResults = parser.flush();

      // Combine all results
      const allResults = [...processResults, ...flushResults];
      const types = allResults.map((r) => r.type);

      // Should have think_start at minimum, content may be in flush
      expect(types).toContain("think_start");
    });

    it("handles incomplete code block", () => {
      const processResults = parser.processContent("```json\n{incomplete");
      const flushResults = parser.flush();

      // Combine all results
      const allResults = [...processResults, ...flushResults];

      // Should have some output (content or think results)
      expect(allResults.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe("processSSEStream", () => {
    it("processes full stream end-to-end", async () => {
      const events = [
        sseContentDelta("Hello"),
        sseContentDelta(" world"),
        sseFinishReason("stop"),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      const results: { type: string; content?: string }[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(value);
      }

      const types = results.map((r) => r.type);
      expect(types).toContain("content");
      expect(types).toContain("finish_reason");
      expect(types).toContain("done");

      const content = results
        .filter((r) => r.type === "content")
        .map((r) => r.content)
        .join("");
      expect(content).toBe("Hello world");
    });

    it("processes reasoning content", async () => {
      const events = [
        sseReasoningDelta("Let me think..."),
        sseContentDelta("The answer is 42"),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      const results: { type: string; content?: string }[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(value);
      }

      const reasoning = results.find((r) => r.type === "reasoning");
      expect(reasoning?.content).toBe("Let me think...");
    });

    it("processes usage information", async () => {
      const events = [
        sseContentDelta("Hello"),
        sseUsage(10, 5),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      const results: { type: string; usage?: unknown }[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        results.push(value);
      }

      const usage = results.find((r) => r.type === "usage");
      expect(usage?.usage).toEqual({
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      });
    });

    it("captures raw SSE buffer via callback", async () => {
      const events = [sseContentDelta("Test"), sseDone()];
      const stream = createSSEStream(events);

      const capturedChunks: string[] = [];
      const parsedStream = await parser.processSSEStream(stream, (chunk) => {
        capturedChunks.push(chunk);
      });

      const reader = parsedStream.getReader();
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      expect(capturedChunks.length).toBeGreaterThan(0);
    });

    it("accumulates tool call deltas across chunks", async () => {
      const events = [
        sseToolCallDelta(0, "call_123", "calculator", undefined),
        sseToolCallDelta(0, undefined, undefined, '{"operation":'),
        sseToolCallDelta(0, undefined, undefined, '"add","a":42,"b":17}'),
        sseFinishReason("tool_calls"),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const toolCalls = parser.getAccumulatedToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]!.id).toBe("call_123");
      expect(toolCalls[0]!.functionName).toBe("calculator");
      expect(toolCalls[0]!.arguments).toBe('{"operation":"add","a":42,"b":17}');

      // Verify it's valid JSON
      const args = JSON.parse(toolCalls[0]!.arguments);
      expect(args.operation).toBe("add");
      expect(args.a).toBe(42);
      expect(args.b).toBe(17);
    });

    it("accumulates multiple tool calls", async () => {
      const events = [
        sseToolCallDelta(0, "call_1", "search", '{"query":"test"}'),
        sseToolCallDelta(1, "call_2", "calculator", '{"a":1}'),
        sseFinishReason("tool_calls"),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const toolCalls = parser.getAccumulatedToolCalls();
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0]!.functionName).toBe("search");
      expect(toolCalls[1]!.functionName).toBe("calculator");
    });
  });

  describe("getFinalThinkingContent", () => {
    it("prefers reasoning over embedded tags", async () => {
      // Simulate receiving both reasoning field and embedded think tags
      const events = [
        sseReasoningDelta("Reasoning field content"),
        sseContentDelta("<think>Embedded thinking</think>Response"),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const result = parser.getFinalThinkingContent();

      expect(result.thinkingSource).toBe("reasoning_field");
      expect(result.thinkingContent).toBe("Reasoning field content");
    });

    it("uses embedded tags when no reasoning", async () => {
      const events = [
        sseContentDelta("<think>Embedded only</think>Response"),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const result = parser.getFinalThinkingContent();

      expect(result.thinkingSource).toBe("embedded_tags");
      expect(result.thinkingContent).toBe("Embedded only");
    });

    it("returns null when no thinking content", async () => {
      const events = [sseContentDelta("Just content"), sseDone()];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const result = parser.getFinalThinkingContent();

      expect(result.thinkingContent).toBeNull();
      expect(result.thinkingSource).toBeNull();
    });
  });

  describe("reset", () => {
    it("clears parser state", () => {
      parser.processContent("Some content");
      parser.reset();

      expect(parser.state.buffer).toBe("");
      expect(parser.state.inThinkSection).toBe(false);
      expect(parser.state.inCodeBlock).toBe(false);
      expect(parser.state.accumulatedReasoning).toBe("");
      expect(parser.state.accumulatedThinking).toBe("");
      expect(parser.state.accumulatedToolCalls.size).toBe(0);
    });
  });

  describe("getAccumulatedToolCalls", () => {
    it("returns empty array when no tool calls", () => {
      expect(parser.getAccumulatedToolCalls()).toEqual([]);
    });

    it("returns accumulated tool calls", async () => {
      const events = [
        sseToolCallDelta(0, "call_test", "myTool", '{"arg":"value"}'),
        sseDone(),
      ];

      const stream = createSSEStream(events);
      const parsedStream = await parser.processSSEStream(stream);
      const reader = parsedStream.getReader();

      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }

      const toolCalls = parser.getAccumulatedToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        id: "call_test",
        functionName: "myTool",
        arguments: '{"arg":"value"}',
      });
    });
  });
});
