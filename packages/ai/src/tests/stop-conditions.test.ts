/**
 * Stop Conditions Tests
 *
 * Tests for composable stop condition functions.
 */

import { describe, expect, it } from "vitest";
import {
  allOf,
  anyOf,
  custom,
  defaultStopConditions,
  evaluateStopConditions,
  finishReasonStop,
  hasToolCall,
  maxDuration,
  maxTokens,
  noToolCalls,
  stepCountIs,
} from "../agent/stop-conditions.js";
import {
  createMockStep,
  createMockToolCall,
  createMockToolExecution,
} from "./setup.js";

describe("Stop Conditions", () => {
  describe("stepCountIs", () => {
    it("stops at N steps", () => {
      const condition = stepCountIs(3);
      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
        createMockStep({ stepNumber: 3 }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("continues below N", () => {
      const condition = stepCountIs(3);
      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("stops when steps exceed N", () => {
      const condition = stepCountIs(2);
      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
        createMockStep({ stepNumber: 3 }),
      ];

      expect(condition(steps)).toBe(true);
    });
  });

  describe("hasToolCall", () => {
    it("stops when specific tool was called", () => {
      const condition = hasToolCall("search");
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolResults: [createMockToolExecution("search", true, "results")],
        }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("continues if tool was not called", () => {
      const condition = hasToolCall("search");
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolResults: [createMockToolExecution("other_tool", true, "results")],
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("returns false for empty steps", () => {
      const condition = hasToolCall("search");

      expect(condition([])).toBe(false);
    });

    it("finds tool in any step", () => {
      const condition = hasToolCall("finalAnswer");
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolResults: [createMockToolExecution("search", true, "results")],
        }),
        createMockStep({
          stepNumber: 2,
          toolResults: [createMockToolExecution("finalAnswer", true, "done")],
        }),
      ];

      expect(condition(steps)).toBe(true);
    });
  });

  describe("noToolCalls", () => {
    it("stops when last step has no tool calls", () => {
      const condition = noToolCalls();
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolCalls: [createMockToolCall("search", { query: "test" })],
        }),
        createMockStep({
          stepNumber: 2,
          content: "Final response",
          // No tool calls
        }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("continues when last step has tool calls", () => {
      const condition = noToolCalls();
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolCalls: [createMockToolCall("search", { query: "test" })],
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("returns false for empty steps", () => {
      const condition = noToolCalls();

      expect(condition([])).toBe(false);
    });

    it("stops when tool calls array is empty", () => {
      const condition = noToolCalls();
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolCalls: [],
        }),
      ];

      expect(condition(steps)).toBe(true);
    });
  });

  describe("finishReasonStop", () => {
    it("stops when finish reason is stop", () => {
      const condition = finishReasonStop();
      const steps = [
        createMockStep({
          stepNumber: 1,
          finishReason: "stop",
        }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("continues when finish reason is tool_calls", () => {
      const condition = finishReasonStop();
      const steps = [
        createMockStep({
          stepNumber: 1,
          finishReason: "tool_calls",
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("continues when finish reason is length", () => {
      const condition = finishReasonStop();
      const steps = [
        createMockStep({
          stepNumber: 1,
          finishReason: "length",
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("returns false for empty steps", () => {
      const condition = finishReasonStop();

      expect(condition([])).toBe(false);
    });
  });

  describe("anyOf", () => {
    it("stops when any condition matches", () => {
      const condition = anyOf(
        stepCountIs(10),
        hasToolCall("finalAnswer"),
        noToolCalls(),
      );

      // This matches noToolCalls
      const steps = [
        createMockStep({
          stepNumber: 1,
          content: "response",
        }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("continues when none match", () => {
      const condition = anyOf(stepCountIs(10), hasToolCall("finalAnswer"));

      const steps = [
        createMockStep({
          stepNumber: 1,
          toolCalls: [createMockToolCall("search", { query: "test" })],
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("short-circuits on first match", () => {
      let secondCalled = false;
      const condition = anyOf(
        stepCountIs(1), // This matches
        custom(() => {
          secondCalled = true;
          return false;
        }),
      );

      const steps = [createMockStep({ stepNumber: 1 })];
      const result = condition(steps);

      expect(result).toBe(true);
      expect(secondCalled).toBe(false);
    });
  });

  describe("allOf", () => {
    it("stops when all conditions match", () => {
      const condition = allOf(stepCountIs(1), noToolCalls());

      const steps = [
        createMockStep({
          stepNumber: 1,
          content: "response",
          // No tool calls
        }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("continues when some conditions do not match", () => {
      const condition = allOf(stepCountIs(1), hasToolCall("finalAnswer"));

      const steps = [
        createMockStep({
          stepNumber: 1,
          content: "response",
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("short-circuits on first non-match", () => {
      let secondCalled = false;
      const condition = allOf(
        stepCountIs(10), // This doesn't match (only 1 step)
        custom(() => {
          secondCalled = true;
          return true;
        }),
      );

      const steps = [createMockStep({ stepNumber: 1 })];
      const result = condition(steps);

      expect(result).toBe(false);
      expect(secondCalled).toBe(false);
    });
  });

  describe("custom", () => {
    it("evaluates provided function", () => {
      const condition = custom((steps) => {
        return steps.length > 0 && steps[0]!.aiResponse.content === "stop now";
      });

      const steps = [
        createMockStep({
          stepNumber: 1,
          content: "stop now",
        }),
      ];

      expect(condition(steps)).toBe(true);
    });

    it("receives full step history", () => {
      let receivedSteps: unknown[] = [];
      const condition = custom((steps) => {
        receivedSteps = steps;
        return false;
      });

      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
      ];

      condition(steps);

      expect(receivedSteps).toHaveLength(2);
    });
  });

  describe("maxTokens", () => {
    it("stops when total tokens exceed threshold", () => {
      const condition = maxTokens(100);
      const steps = [
        createMockStep({
          stepNumber: 1,
          usage: { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50 },
        }),
        createMockStep({
          stepNumber: 2,
          usage: { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 },
        }),
      ];

      // Total: 50 + 70 = 120, which is >= 100
      expect(condition(steps)).toBe(true);
    });

    it("continues when tokens below threshold", () => {
      const condition = maxTokens(100);
      const steps = [
        createMockStep({
          stepNumber: 1,
          usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
        }),
      ];

      expect(condition(steps)).toBe(false);
    });

    it("handles steps without usage", () => {
      const condition = maxTokens(100);
      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
      ];

      // No usage = 0 tokens, so should not stop
      expect(condition(steps)).toBe(false);
    });
  });

  describe("maxDuration", () => {
    it("stops when duration exceeds threshold", () => {
      const condition = maxDuration(1000); // 1 second

      const now = Date.now();
      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
      ];

      // Manually set timestamps to simulate duration
      steps[0]!.timestamp = new Date(now - 2000).toISOString(); // 2 seconds ago
      steps[1]!.timestamp = new Date(now).toISOString(); // now

      expect(condition(steps)).toBe(true);
    });

    it("continues when duration below threshold", () => {
      const condition = maxDuration(5000); // 5 seconds

      const now = Date.now();
      const steps = [
        createMockStep({ stepNumber: 1 }),
        createMockStep({ stepNumber: 2 }),
      ];

      // Set timestamps to simulate 100ms duration
      steps[0]!.timestamp = new Date(now - 100).toISOString();
      steps[1]!.timestamp = new Date(now).toISOString();

      expect(condition(steps)).toBe(false);
    });

    it("returns false for empty steps", () => {
      const condition = maxDuration(1000);

      expect(condition([])).toBe(false);
    });
  });

  describe("evaluateStopConditions", () => {
    it("returns shouldStop true and reason when condition matches", () => {
      const result = evaluateStopConditions(
        [createMockStep({ stepNumber: 1 })],
        stepCountIs(1),
      );

      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBeDefined();
    });

    it("returns shouldStop false when no condition matches", () => {
      const result = evaluateStopConditions(
        [createMockStep({ stepNumber: 1 })],
        stepCountIs(10),
      );

      expect(result.shouldStop).toBe(false);
      expect(result.reason).toBeUndefined();
    });

    it("accepts array of conditions", () => {
      const result = evaluateStopConditions(
        [createMockStep({ stepNumber: 1 })],
        [stepCountIs(10), stepCountIs(1)],
      );

      expect(result.shouldStop).toBe(true);
    });

    it("returns no_tool_calls reason when last step has no tools", () => {
      const result = evaluateStopConditions(
        [createMockStep({ stepNumber: 1, content: "response" })],
        noToolCalls(),
      );

      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("no_tool_calls");
    });

    it("returns finish_reason when finish reason is stop with tool calls", () => {
      // Must have tool calls to not trigger no_tool_calls reason first
      const result = evaluateStopConditions(
        [
          createMockStep({
            stepNumber: 1,
            finishReason: "stop",
            toolCalls: [createMockToolCall("search", { query: "test" })],
          }),
        ],
        finishReasonStop(),
      );

      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe("finish_reason");
    });
  });

  describe("defaultStopConditions", () => {
    it("stops at 10 steps", () => {
      const steps = Array.from({ length: 10 }, (_, i) =>
        createMockStep({
          stepNumber: i + 1,
          toolCalls: [createMockToolCall("tool", {})],
        }),
      );

      expect(defaultStopConditions(steps)).toBe(true);
    });

    it("stops when no tool calls", () => {
      const steps = [
        createMockStep({
          stepNumber: 1,
          content: "final response",
        }),
      ];

      expect(defaultStopConditions(steps)).toBe(true);
    });

    it("continues when under 10 steps with tool calls", () => {
      const steps = [
        createMockStep({
          stepNumber: 1,
          toolCalls: [createMockToolCall("search", { query: "test" })],
        }),
      ];

      expect(defaultStopConditions(steps)).toBe(false);
    });
  });
});
