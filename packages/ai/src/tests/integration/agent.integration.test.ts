/**
 * Integration Tests: ToolLoopAgent
 *
 * Tests the ToolLoopAgent against real LLM providers.
 *
 * Run with:
 *   AI_TEST_PROVIDER=local pnpm --filter @eclaire/ai test:integration:local
 *   OPENROUTER_API_KEY=xxx pnpm --filter @eclaire/ai test:integration:openrouter
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  anyOf,
  createAgentContext,
  noToolCalls,
  stepCountIs,
  ToolLoopAgent,
} from "../../agent/index.js";
import type {
  AgentContext,
  AgentToolDefinition,
  AnyZodType,
} from "../../agent/types.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import {
  initIntegrationAI,
  resetIntegrationAI,
  skipIfNoIntegration,
} from "./setup.js";

describe("ToolLoopAgent integration", () => {
  beforeAll(() => {
    skipIfNoIntegration();
  });

  beforeEach(() => {
    initIntegrationAI();
  });

  afterEach(() => {
    resetIntegrationAI();
  });

  // ==========================================================================
  // TEST TOOLS
  // ==========================================================================

  const calculatorInputSchema = z.object({
    operation: z.enum(["add", "subtract", "multiply", "divide"]),
    a: z.number(),
    b: z.number(),
  });

  function createCalculatorTool(): AgentToolDefinition<
    typeof calculatorInputSchema,
    AgentContext
  > {
    return {
      name: "calculator",
      description: "Perform basic arithmetic calculations",
      inputSchema: calculatorInputSchema,
      execute: async (input): Promise<ToolExecutionResult> => {
        const { operation, a, b } = input;
        let result: number;
        switch (operation) {
          case "add":
            result = a + b;
            break;
          case "subtract":
            result = a - b;
            break;
          case "multiply":
            result = a * b;
            break;
          case "divide":
            result = a / b;
            break;
        }
        return { success: true, content: `Result: ${result}` };
      },
    };
  }

  // ==========================================================================
  // TESTS: BASIC EXECUTION
  // ==========================================================================

  describe("basic execution", () => {
    it("completes a single step without tools", async () => {
      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions: "You are a helpful assistant. Be concise.",
        tools: {},
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "Say hello in exactly one word.",
        context,
      });

      expect(result.text).toBeDefined();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]!.isTerminal).toBe(true);
    });

    it("aggregates token usage across the run", async () => {
      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions: "You are a helpful assistant.",
        tools: {},
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "Reply with: OK",
        context,
      });

      expect(result.usage).toBeDefined();
      expect(result.usage.totalPromptTokens).toBeGreaterThan(0);
      expect(result.usage.totalCompletionTokens).toBeGreaterThan(0);
      expect(result.usage.totalTokens).toBe(
        result.usage.totalPromptTokens + result.usage.totalCompletionTokens,
      );
    });
  });

  // ==========================================================================
  // TESTS: TOOL EXECUTION
  // ==========================================================================

  describe("tool execution", () => {
    it("executes a single tool call", async () => {
      const calculator = createCalculatorTool();

      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions:
          "You are a math assistant. When asked to calculate, use the calculator tool. After getting the result, provide it to the user.",
        tools: { calculator },
        stopWhen: anyOf(stepCountIs(5), noToolCalls()),
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "What is 25 + 17?",
        context,
      });

      expect(result.text).toBeDefined();
      // The final response should mention 42 (25 + 17)
      expect(result.text.toLowerCase()).toMatch(/42|forty[- ]?two/);

      // Should have at least 2 steps: tool call + final response
      expect(result.steps.length).toBeGreaterThanOrEqual(2);

      // Check that calculator was called
      const toolSteps = result.steps.filter(
        (s) => s.toolResults && s.toolResults.length > 0,
      );
      expect(toolSteps.length).toBeGreaterThan(0);

      const toolExecution = toolSteps[0]!.toolResults![0];
      expect(toolExecution.toolName).toBe("calculator");
      expect(toolExecution.output.success).toBe(true);
    });

    it("handles multi-step tool execution", async () => {
      const calculator = createCalculatorTool();

      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions:
          "You are a math assistant. Use the calculator for each operation. Calculate step by step.",
        tools: { calculator },
        stopWhen: anyOf(stepCountIs(10), noToolCalls()),
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "What is (10 + 5) * 2? Calculate step by step.",
        context,
      });

      expect(result.text).toBeDefined();
      // Final answer should be 30
      expect(result.text).toMatch(/30|thirty/i);

      // Should have multiple tool calls
      const allToolCalls = result.steps.flatMap((s) => s.toolResults || []);
      expect(allToolCalls.length).toBeGreaterThanOrEqual(2);

      // Track tool call summaries
      expect(result.toolCallSummaries).toBeDefined();
      expect(result.toolCallSummaries.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ==========================================================================
  // TESTS: STOP CONDITIONS
  // ==========================================================================

  describe("stop conditions", () => {
    it("stops when step count limit is reached", async () => {
      const calculator = createCalculatorTool();

      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions: "Keep calculating random additions.",
        tools: { calculator },
        stopWhen: stepCountIs(2), // Stop after 2 steps
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "Calculate 1+1, then 2+2, then 3+3, keep going forever.",
        context,
      });

      expect(result.steps.length).toBeLessThanOrEqual(2);
      expect(result.steps[result.steps.length - 1]!.isTerminal).toBe(true);
    });

    it("stops when no tool calls are made", async () => {
      const calculator = createCalculatorTool();

      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions:
          "You are a helpful assistant. Only use tools when explicitly asked to perform calculations. For greetings and casual conversation, respond directly without using any tools.",
        tools: { calculator },
        stopWhen: anyOf(stepCountIs(3), noToolCalls()), // Step limit as safety fallback
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "Say hello!",
        context,
      });

      // Should complete in one step (no tool needed)
      expect(result.steps.length).toBe(1);
      expect(result.steps[0]!.aiResponse.toolCalls).toBeUndefined();
    });
  });

  // ==========================================================================
  // TESTS: STREAMING
  // ==========================================================================

  describe("streaming execution", () => {
    it("emits events during execution", async () => {
      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions: "You are a helpful assistant.",
        tools: {},
      });

      const context = createAgentContext({ userId: "test-user" });
      const { eventStream, result } = agent.stream({
        prompt: "Say hello briefly.",
        context,
      });

      const events: Array<{ type: string }> = [];
      const reader = eventStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          events.push({ type: value.type });
        }
      } finally {
        reader.releaseLock();
      }

      // Should have received events
      expect(events.length).toBeGreaterThan(0);

      // Should have text chunks and done event
      const hasTextChunk = events.some((e) => e.type === "text-chunk");
      const hasDone = events.some((e) => e.type === "done");
      expect(hasTextChunk).toBe(true);
      expect(hasDone).toBe(true);

      // Wait for result
      const finalResult = await result;
      expect(finalResult.text).toBeDefined();
    });

    it("emits tool events during tool execution", async () => {
      const calculator = createCalculatorTool();

      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions: "Use the calculator for any math.",
        tools: { calculator },
        stopWhen: anyOf(stepCountIs(5), noToolCalls()),
      });

      const context = createAgentContext({ userId: "test-user" });
      const { eventStream, result } = agent.stream({
        prompt: "What is 7 + 8?",
        context,
      });

      const eventTypes: string[] = [];
      const reader = eventStream.getReader();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          eventTypes.push(value.type);
        }
      } finally {
        reader.releaseLock();
      }

      // Wait for result
      const finalResult = await result;

      // If tool was called, should have tool events
      if (finalResult.toolCallSummaries.length > 0) {
        expect(eventTypes).toContain("tool-call-start");
        expect(eventTypes).toContain("tool-call-complete");
      }
    });
  });

  // ==========================================================================
  // TESTS: ERROR HANDLING
  // ==========================================================================

  describe("error handling", () => {
    it("handles tool execution errors gracefully", async () => {
      const failingToolSchema = z.object({ shouldFail: z.boolean() });

      const failingTool: AgentToolDefinition<
        typeof failingToolSchema,
        AgentContext
      > = {
        name: "mayFail",
        description: "A tool that may fail",
        inputSchema: failingToolSchema,
        execute: async (input): Promise<ToolExecutionResult> => {
          if (input.shouldFail) {
            return {
              success: false,
              content: "",
              error: "Intentional failure",
            };
          }
          return { success: true, content: "Success!" };
        },
      };

      const agent = new ToolLoopAgent({
        aiContext: "backend",
        instructions: "Use the mayFail tool with shouldFail=true.",
        tools: { mayFail: failingTool },
        stopWhen: anyOf(stepCountIs(3), noToolCalls()),
      });

      const context = createAgentContext({ userId: "test-user" });
      const result = await agent.generate({
        prompt: "Call mayFail with shouldFail set to true.",
        context,
      });

      // Should complete despite tool failure
      expect(result.text).toBeDefined();

      // Should have recorded the failure
      const toolExecutions = result.steps.flatMap((s) => s.toolResults || []);
      const failedExecution = toolExecutions.find(
        (e) => e.toolName === "mayFail" && !e.output.success,
      );
      expect(failedExecution).toBeDefined();
      expect(failedExecution!.output.error).toBe("Intentional failure");
    });
  });
});
