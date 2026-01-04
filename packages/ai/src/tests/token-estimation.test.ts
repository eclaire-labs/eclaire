/**
 * Token Estimation Tests
 *
 * Tests for token counting and context fit checking.
 */

import { describe, expect, it, vi } from "vitest";
import { estimateTokenCount, checkContextFit } from "../token-estimation.js";
import type { AIMessage } from "../types.js";
import { createMockLoggerFactory } from "./setup.js";

// Mock the logger module
vi.mock("../logger.js", () => ({
  createAILogger: () => createMockLoggerFactory().factory("ai-tokens"),
}));

describe("Token Estimation", () => {
  describe("estimateTokenCount", () => {
    it("returns count for simple text", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello world" }];

      const count = estimateTokenCount(messages, "gpt-4");

      // Should return a reasonable positive number
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(100); // "Hello world" should not be many tokens
    });

    it("handles multiple messages", () => {
      const messages: AIMessage[] = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const count = estimateTokenCount(messages, "gpt-4");

      // Should be greater than single message
      expect(count).toBeGreaterThan(5);
    });

    it("handles empty messages", () => {
      const messages: AIMessage[] = [];

      const count = estimateTokenCount(messages, "gpt-4");

      // May have minimal overhead for empty array
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThan(10);
    });

    it("handles messages with empty content", () => {
      const messages: AIMessage[] = [{ role: "user", content: "" }];

      const count = estimateTokenCount(messages, "gpt-4");

      // May include overhead for message structure (role, etc.)
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThan(20); // Should be minimal
    });

    it("handles multimodal content with image", () => {
      const messages: AIMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
            },
          ],
        },
      ];

      const count = estimateTokenCount(messages, "gpt-4");

      // Should count text part; image handling varies
      expect(count).toBeGreaterThan(0);
    });

    it("uses different models", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello world" }];

      // These should both work without errors
      const count1 = estimateTokenCount(messages, "gpt-4");
      const count2 = estimateTokenCount(messages, "gpt-3.5-turbo");

      expect(count1).toBeGreaterThan(0);
      expect(count2).toBeGreaterThan(0);
    });

    it("handles long content", () => {
      const longContent = "word ".repeat(1000);
      const messages: AIMessage[] = [{ role: "user", content: longContent }];

      const count = estimateTokenCount(messages, "gpt-4");

      // Should be substantial for 1000 words
      expect(count).toBeGreaterThan(500);
    });

    it("handles special characters", () => {
      const messages: AIMessage[] = [
        { role: "user", content: "Hello! 你好! مرحبا! 🌍" },
      ];

      const count = estimateTokenCount(messages, "gpt-4");

      expect(count).toBeGreaterThan(0);
    });

    it("handles code content", () => {
      const messages: AIMessage[] = [
        {
          role: "user",
          content: `function hello() {
  console.log("Hello, world!");
}`,
        },
      ];

      const count = estimateTokenCount(messages, "gpt-4");

      expect(count).toBeGreaterThan(5);
    });
  });

  describe("checkContextFit", () => {
    it("returns fits: true when tokens fit", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello" }];

      const result = checkContextFit(messages, "test-model", 8192, 1000);

      expect(result.fits).toBe(true);
      expect(result.estimatedInputTokens).toBeGreaterThan(0);
      expect(result.availableTokens).toBeGreaterThan(0);
    });

    it("returns fits: false when context overflow", () => {
      // Create content that would exceed a small context window
      const longContent = "word ".repeat(10000);
      const messages: AIMessage[] = [{ role: "user", content: longContent }];

      const result = checkContextFit(messages, "test-model", 1000, 100);

      expect(result.fits).toBe(false);
    });

    it("accounts for max output tokens", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello" }];

      // Context of 100, max output of 50, leaves 50 for input
      const result = checkContextFit(messages, "test-model", 100, 50);

      expect(result.availableTokens).toBeLessThanOrEqual(50);
    });

    it("returns estimated counts", () => {
      const messages: AIMessage[] = [
        { role: "user", content: "This is a test message" },
      ];

      const result = checkContextFit(messages, "test-model", 8192, 2000);

      expect(result.estimatedInputTokens).toBeGreaterThan(0);
      expect(result.availableTokens).toBe(8192 - 2000);
    });

    it("handles edge case of exact fit", () => {
      const messages: AIMessage[] = [{ role: "user", content: "x" }];

      // Get the actual token count first
      const tokenCount = estimateTokenCount(messages, "gpt-4");

      // Set context window to exactly fit
      const contextWindow = tokenCount + 100; // tokens + max output
      const maxOutput = 100;

      const result = checkContextFit(messages, "test-model", contextWindow, maxOutput);

      expect(result.fits).toBe(true);
    });

    it("handles empty messages", () => {
      const messages: AIMessage[] = [];

      const result = checkContextFit(messages, "test-model", 8192, 1000);

      expect(result.fits).toBe(true);
      // May include minimal overhead
      expect(result.estimatedInputTokens).toBeGreaterThanOrEqual(0);
      expect(result.estimatedInputTokens).toBeLessThan(20);
    });
  });
});
