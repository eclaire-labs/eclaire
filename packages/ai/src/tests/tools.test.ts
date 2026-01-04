/**
 * Tools Tests
 *
 * Tests for tool call parsing, execution, and message building.
 */

import { describe, expect, it, vi } from "vitest";
import {
  parseToolCallArguments,
  hasToolCalls,
  getToolNames,
  executeToolCall,
  executeAllToolCalls,
  buildAssistantToolCallMessage,
  buildToolResultMessage,
  buildToolResultMessages,
  createToolDefinition,
  createObjectSchema,
  shouldContinueToolLoop,
  createToolCallSummary,
} from "../tools/native.js";
import type { ToolCallResult } from "../types.js";
import type { ToolRegistry, ToolExecutionResult } from "../tools/types.js";
import { createMockLoggerFactory } from "./setup.js";

// Mock the logger module
vi.mock("../logger.js", () => ({
  createAILogger: () => createMockLoggerFactory().factory("ai-tools"),
}));

describe("Tool Utilities", () => {
  describe("parseToolCallArguments", () => {
    it("parses valid JSON", () => {
      const result = parseToolCallArguments('{"query": "test", "limit": 10}');

      expect(result).toEqual({ query: "test", limit: 10 });
    });

    it("returns null for invalid JSON", () => {
      const result = parseToolCallArguments("not valid json");

      expect(result).toBeNull();
    });

    it("returns null for malformed JSON", () => {
      const result = parseToolCallArguments('{"query": "test"');

      expect(result).toBeNull();
    });

    it("parses empty object", () => {
      const result = parseToolCallArguments("{}");

      expect(result).toEqual({});
    });

    it("parses complex nested objects", () => {
      const result = parseToolCallArguments(
        '{"filters": {"status": ["active", "pending"]}, "options": {"sort": "asc"}}'
      );

      expect(result).toEqual({
        filters: { status: ["active", "pending"] },
        options: { sort: "asc" },
      });
    });
  });

  describe("hasToolCalls", () => {
    it("returns true when toolCalls array is present and non-empty", () => {
      const response = {
        toolCalls: [
          {
            id: "call_1",
            type: "function" as const,
            function: { name: "search", arguments: "{}" },
          },
        ],
      };

      expect(hasToolCalls(response)).toBe(true);
    });

    it("returns false when toolCalls is empty", () => {
      const response = { toolCalls: [] };

      expect(hasToolCalls(response)).toBe(false);
    });

    it("returns false when toolCalls is undefined", () => {
      const response = {};

      expect(hasToolCalls(response)).toBe(false);
    });
  });

  describe("getToolNames", () => {
    it("extracts function names from tool calls", () => {
      const toolCalls: ToolCallResult[] = [
        { id: "1", type: "function", function: { name: "search", arguments: "{}" } },
        { id: "2", type: "function", function: { name: "createNote", arguments: "{}" } },
        { id: "3", type: "function", function: { name: "search", arguments: "{}" } },
      ];

      expect(getToolNames(toolCalls)).toEqual(["search", "createNote", "search"]);
    });

    it("returns empty array for empty input", () => {
      expect(getToolNames([])).toEqual([]);
    });
  });

  describe("executeToolCall", () => {
    it("executes registered tool and returns result", async () => {
      const executor = vi.fn().mockResolvedValue({
        success: true,
        content: "Search results: 3 items found",
      });

      const registry: ToolRegistry = {
        getExecutor: (name: string) => (name === "search" ? executor : undefined),
        getDefinitions: () => [],
        hasTool: (name: string) => name === "search",
      };

      const toolCall: ToolCallResult = {
        id: "call_1",
        type: "function",
        function: { name: "search", arguments: '{"query": "test"}' },
      };

      const result = await executeToolCall(toolCall, registry);

      expect(result.success).toBe(true);
      expect(result.content).toBe("Search results: 3 items found");
      expect(executor).toHaveBeenCalledWith({ query: "test" });
    });

    it("returns error for missing tool", async () => {
      const registry: ToolRegistry = {
        getExecutor: () => undefined,
        getDefinitions: () => [],
        hasTool: () => false,
      };

      const toolCall: ToolCallResult = {
        id: "call_1",
        type: "function",
        function: { name: "unknownTool", arguments: "{}" },
      };

      const result = await executeToolCall(toolCall, registry);

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("returns error for invalid arguments", async () => {
      const executor = vi.fn();
      const registry: ToolRegistry = {
        getExecutor: () => executor,
        getDefinitions: () => [],
        hasTool: () => true,
      };

      const toolCall: ToolCallResult = {
        id: "call_1",
        type: "function",
        function: { name: "search", arguments: "invalid json" },
      };

      const result = await executeToolCall(toolCall, registry);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid arguments");
      expect(executor).not.toHaveBeenCalled();
    });

    it("catches executor errors", async () => {
      const executor = vi.fn().mockRejectedValue(new Error("Database connection failed"));
      const registry: ToolRegistry = {
        getExecutor: () => executor,
        getDefinitions: () => [],
        hasTool: () => true,
      };

      const toolCall: ToolCallResult = {
        id: "call_1",
        type: "function",
        function: { name: "search", arguments: "{}" },
      };

      const result = await executeToolCall(toolCall, registry);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Database connection failed");
    });
  });

  describe("executeAllToolCalls", () => {
    it("runs tools in parallel and returns results keyed by id", async () => {
      const executionOrder: string[] = [];

      const registry: ToolRegistry = {
        getExecutor: (name: string) => async (args: Record<string, unknown>) => {
          executionOrder.push(name);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { success: true, content: `Result for ${name}` };
        },
        getDefinitions: () => [],
        hasTool: () => true,
      };

      const toolCalls: ToolCallResult[] = [
        { id: "call_1", type: "function", function: { name: "tool1", arguments: "{}" } },
        { id: "call_2", type: "function", function: { name: "tool2", arguments: "{}" } },
        { id: "call_3", type: "function", function: { name: "tool3", arguments: "{}" } },
      ];

      const results = await executeAllToolCalls(toolCalls, registry);

      expect(results.size).toBe(3);
      expect(results.get("call_1")?.content).toBe("Result for tool1");
      expect(results.get("call_2")?.content).toBe("Result for tool2");
      expect(results.get("call_3")?.content).toBe("Result for tool3");
    });
  });

  describe("buildAssistantToolCallMessage", () => {
    it("formats assistant message with tool_calls", () => {
      const toolCalls: ToolCallResult[] = [
        { id: "call_1", type: "function", function: { name: "search", arguments: '{"q":"test"}' } },
      ];

      const message = buildAssistantToolCallMessage(toolCalls);

      expect(message.role).toBe("assistant");
      expect(message.content).toBe("");
      expect(message.tool_calls).toEqual(toolCalls);
    });
  });

  describe("buildToolResultMessage", () => {
    it("formats success result", () => {
      const result: ToolExecutionResult = {
        success: true,
        content: "Found 3 items",
      };

      const message = buildToolResultMessage("call_1", "search", result);

      expect(message.role).toBe("tool");
      expect(message.content).toBe("Found 3 items");
      expect(message.tool_call_id).toBe("call_1");
      expect(message.name).toBe("search");
    });

    it("formats error result with Error prefix", () => {
      const result: ToolExecutionResult = {
        success: false,
        content: "",
        error: "Database error",
      };

      const message = buildToolResultMessage("call_1", "search", result);

      expect(message.role).toBe("tool");
      expect(message.content).toBe("Error: Database error");
    });

    it("handles unknown error", () => {
      const result: ToolExecutionResult = {
        success: false,
        content: "",
      };

      const message = buildToolResultMessage("call_1", "search", result);

      expect(message.content).toBe("Error: Unknown error");
    });
  });

  describe("buildToolResultMessages", () => {
    it("builds messages for all tool calls", () => {
      const toolCalls: ToolCallResult[] = [
        { id: "call_1", type: "function", function: { name: "tool1", arguments: "{}" } },
        { id: "call_2", type: "function", function: { name: "tool2", arguments: "{}" } },
      ];

      const results = new Map<string, ToolExecutionResult>([
        ["call_1", { success: true, content: "Result 1" }],
        ["call_2", { success: true, content: "Result 2" }],
      ]);

      const messages = buildToolResultMessages(toolCalls, results);

      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe("Result 1");
      expect(messages[1]!.content).toBe("Result 2");
    });

    it("handles missing results", () => {
      const toolCalls: ToolCallResult[] = [
        { id: "call_1", type: "function", function: { name: "tool1", arguments: "{}" } },
      ];

      const results = new Map<string, ToolExecutionResult>();

      const messages = buildToolResultMessages(toolCalls, results);

      expect(messages).toHaveLength(1);
      expect(messages[0]!.content).toContain("No result found");
    });
  });

  describe("createToolDefinition", () => {
    it("builds OpenAI function format", () => {
      const definition = createToolDefinition("search", "Search for items", {
        type: "object",
        properties: { query: { type: "string" } },
      });

      expect(definition).toEqual({
        type: "function",
        function: {
          name: "search",
          description: "Search for items",
          parameters: {
            type: "object",
            properties: { query: { type: "string" } },
          },
        },
      });
    });
  });

  describe("createObjectSchema", () => {
    it("builds JSON schema with all properties required by default", () => {
      const schema = createObjectSchema({
        name: { type: "string" },
        age: { type: "number" },
      });

      expect(schema).toEqual({
        type: "object",
        properties: {
          name: { type: "string" },
          age: { type: "number" },
        },
        required: ["name", "age"],
      });
    });

    it("uses provided required array", () => {
      const schema = createObjectSchema(
        {
          name: { type: "string" },
          age: { type: "number" },
        },
        ["name"]
      );

      expect(schema.required).toEqual(["name"]);
    });
  });

  describe("shouldContinueToolLoop", () => {
    it("returns true when tools are present", () => {
      const response = {
        toolCalls: [
          { id: "1", type: "function" as const, function: { name: "search", arguments: "{}" } },
        ],
      };

      expect(shouldContinueToolLoop(response, 1, 10)).toBe(true);
    });

    it("returns false at max rounds", () => {
      const response = {
        toolCalls: [
          { id: "1", type: "function" as const, function: { name: "search", arguments: "{}" } },
        ],
      };

      expect(shouldContinueToolLoop(response, 10, 10)).toBe(false);
    });

    it("returns false when no tool calls", () => {
      const response = { toolCalls: [] };

      expect(shouldContinueToolLoop(response, 1, 10)).toBe(false);
    });
  });

  describe("createToolCallSummary", () => {
    it("creates summary with all fields", () => {
      const summary = createToolCallSummary({
        functionName: "search",
        arguments: { query: "test" },
        result: ["item1", "item2"],
        executionTimeMs: 150,
        success: true,
      });

      expect(summary.functionName).toBe("search");
      expect(summary.executionTimeMs).toBe(150);
      expect(summary.success).toBe(true);
      expect(summary.arguments).toEqual({ query: "test" });
      expect(summary.resultSummary).toBe("Found 2 items");
    });

    it("handles error case", () => {
      const summary = createToolCallSummary({
        functionName: "search",
        arguments: { query: "test" },
        result: null,
        executionTimeMs: 50,
        success: false,
        error: "Database error",
      });

      expect(summary.success).toBe(false);
      expect(summary.error).toBe("Database error");
      expect(summary.resultSummary).toBe("Error: Database error");
    });

    it("summarizes array results correctly", () => {
      const summary = createToolCallSummary({
        functionName: "list",
        arguments: {},
        result: ["a"],
        executionTimeMs: 10,
        success: true,
      });

      expect(summary.resultSummary).toBe("Found 1 item");
    });

    it("summarizes object results", () => {
      const summary = createToolCallSummary({
        functionName: "getData",
        arguments: {},
        result: { name: "test", value: 123 },
        executionTimeMs: 20,
        success: true,
      });

      expect(summary.resultSummary).toBe("Retrieved data with 2 fields");
    });

    it("summarizes string results", () => {
      const summary = createToolCallSummary({
        functionName: "getMessage",
        arguments: {},
        result: "Short message",
        executionTimeMs: 5,
        success: true,
      });

      expect(summary.resultSummary).toBe("Short message");
    });

    it("truncates long string results", () => {
      const longString = "a".repeat(150);
      const summary = createToolCallSummary({
        functionName: "getMessage",
        arguments: {},
        result: longString,
        executionTimeMs: 5,
        success: true,
      });

      expect(summary.resultSummary!.length).toBe(103); // 100 chars + "..."
      expect(summary.resultSummary).toContain("...");
    });

    it("handles null/undefined results", () => {
      const summary = createToolCallSummary({
        functionName: "doSomething",
        arguments: {},
        result: null,
        executionTimeMs: 10,
        success: true,
      });

      expect(summary.resultSummary).toBe("Operation completed");
    });

    it("handles circular references in arguments", () => {
      const circular: Record<string, unknown> = { name: "test" };
      circular.self = circular; // Create circular reference

      const summary = createToolCallSummary({
        functionName: "test",
        arguments: circular,
        result: "done",
        executionTimeMs: 10,
        success: true,
      });

      // Should not throw, and arguments should be undefined due to circular ref
      expect(summary.arguments).toBeUndefined();
    });
  });
});
