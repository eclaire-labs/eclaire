/**
 * Integration Tests: callAI
 *
 * Tests the non-streaming callAI function against real LLM providers.
 *
 * Run with:
 *   AI_TEST_PROVIDER=local pnpm --filter @eclaire/ai test:integration:local
 *   OPENROUTER_API_KEY=xxx pnpm --filter @eclaire/ai test:integration:openrouter
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { callAI } from "../../index.js";
import {
  createCalculatorTool,
  createMinimalPrompt,
  createToolTriggerPrompt,
  initIntegrationAI,
  resetIntegrationAI,
  skipIfNoIntegration,
} from "./setup.js";

describe("callAI integration", () => {
  beforeAll(() => {
    skipIfNoIntegration();
  });

  beforeEach(() => {
    initIntegrationAI();
  });

  afterEach(() => {
    resetIntegrationAI();
  });

  describe("basic completion", () => {
    it("returns content for a simple prompt", async () => {
      const messages = createMinimalPrompt();

      const result = await callAI(messages, "backend");

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe("string");
      expect(result.content!.length).toBeGreaterThan(0);
      expect(result.finishReason).toBe("stop");
    });

    it("reports token usage", async () => {
      const messages = createMinimalPrompt();

      const result = await callAI(messages, "backend");

      expect(result.usage).toBeDefined();
      if (result.usage) {
        expect(result.usage.prompt_tokens ?? 0).toBeGreaterThan(0);
        expect(result.usage.completion_tokens ?? 0).toBeGreaterThan(0);
        expect(result.usage.total_tokens).toBe(
          (result.usage.prompt_tokens ?? 0) +
            (result.usage.completion_tokens ?? 0),
        );
      }
    });

    it("respects maxTokens option", async () => {
      const messages = [
        {
          role: "user" as const,
          content: "Write a very long story about a dragon.",
        },
      ];

      const result = await callAI(messages, "backend", {
        maxTokens: 50,
      });

      expect(result).toBeDefined();
      expect(result.usage!.completion_tokens).toBeLessThanOrEqual(60); // Some models slightly exceed
    });

    it("respects temperature option", async () => {
      const messages = [
        { role: "user" as const, content: "Reply with exactly: HELLO" },
      ];

      // Temperature 0 should give deterministic output
      const result1 = await callAI(messages, "backend", { temperature: 0 });
      const result2 = await callAI(messages, "backend", { temperature: 0 });

      // Both should contain "HELLO" (may have slight variations)
      expect(result1.content!.toUpperCase()).toContain("HELLO");
      expect(result2.content!.toUpperCase()).toContain("HELLO");
    });
  });

  describe("tool calling", () => {
    it("returns tool calls when tools are provided", async () => {
      const messages = createToolTriggerPrompt();
      const tools = [createCalculatorTool()];

      const result = await callAI(messages, "backend", {
        tools,
        toolChoice: "required",
      });

      expect(result).toBeDefined();
      // With toolChoice: "required", model MUST use tools
      expect(result.finishReason).toBe("tool_calls");
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls!.length).toBeGreaterThan(0);
      expect(result.toolCalls![0]!.function.name).toBe("calculator");

      // Verify tool call arguments are valid JSON with expected properties
      const args = JSON.parse(result.toolCalls![0]!.function.arguments);
      expect(args).toHaveProperty("operation");
      expect(args).toHaveProperty("a");
      expect(args).toHaveProperty("b");
    });

    it("uses required tool when toolChoice specifies it", async () => {
      const messages = [
        { role: "user" as const, content: "Hello, how are you?" },
      ];
      const tools = [createCalculatorTool()];

      const result = await callAI(messages, "backend", {
        tools,
        toolChoice: { type: "function", function: { name: "calculator" } },
      });

      expect(result).toBeDefined();
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls!.length).toBeGreaterThan(0);
      expect(result.toolCalls![0].function.name).toBe("calculator");
    });
  });

  describe("system messages", () => {
    it("respects system message instructions", async () => {
      const messages = [
        {
          role: "system" as const,
          content: "You are a pirate. Always respond like a pirate would.",
        },
        { role: "user" as const, content: "Hello!" },
      ];

      const result = await callAI(messages, "backend");

      expect(result.content).toBeDefined();
      // Pirate-like response (arrr, matey, etc.) - just check it's not empty
      expect(result.content!.length).toBeGreaterThan(0);
    });
  });

  describe("multi-turn conversations", () => {
    it("handles conversation history", async () => {
      const messages = [
        { role: "user" as const, content: "My name is Alice." },
        { role: "assistant" as const, content: "Nice to meet you, Alice!" },
        { role: "user" as const, content: "What is my name?" },
      ];

      const result = await callAI(messages, "backend");

      expect(result.content).toBeDefined();
      expect(result.content!.toLowerCase()).toContain("alice");
    });
  });

  describe("error handling", () => {
    it("throws on invalid request", async () => {
      // Empty messages should fail
      await expect(callAI([], "backend")).rejects.toThrow();
    });
  });
});
