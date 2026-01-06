/**
 * Validation Tests
 *
 * Tests for request requirements derivation and capability checking.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AICallOptions, AIMessage, ModelCapabilities } from "../types.js";
import {
  CapabilityError,
  deriveRequestRequirements,
  getReasoningMode,
  modelSupportsJsonSchema,
  modelSupportsReasoning,
  modelSupportsStreaming,
  modelSupportsStructuredOutputs,
  modelSupportsTools,
  validateRequestAgainstCapabilities,
} from "../validation.js";
import { createMockLoggerFactory } from "./setup.js";

// Mock the logger module
vi.mock("../logger.js", () => ({
  createAILogger: () => createMockLoggerFactory().factory("ai-validation"),
}));

describe("Validation", () => {
  describe("deriveRequestRequirements", () => {
    it("detects text input modality", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello world" }];
      const options: AICallOptions = {};

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.inputModalities.has("text")).toBe(true);
    });

    it("detects image input modality", () => {
      const messages: AIMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,..." },
            },
          ],
        },
      ];
      const options: AICallOptions = {};

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.inputModalities.has("text")).toBe(true);
      expect(requirements.inputModalities.has("image")).toBe(true);
    });

    it("detects tools requirement", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Search for X" }];
      const options: AICallOptions = {
        tools: [
          {
            type: "function",
            function: {
              name: "search",
              description: "Search",
              parameters: {},
            },
          },
        ],
      };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.tools).toBe(true);
    });

    it("detects no tools when tools array is empty", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello" }];
      const options: AICallOptions = { tools: [] };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.tools).toBe(false);
    });

    it("detects json_schema requirement", () => {
      const messages: AIMessage[] = [{ role: "user", content: "List items" }];
      const options: AICallOptions = {
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "items",
            schema: { type: "object" },
          },
        },
      };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.jsonSchema).toBe(true);
    });

    it("detects json_object requirement", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Return JSON" }];
      const options: AICallOptions = {
        responseFormat: { type: "json_object" },
      };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.jsonSchema).toBe(true);
    });

    it("detects structured outputs requirement (strict mode)", () => {
      const messages: AIMessage[] = [{ role: "user", content: "List items" }];
      const options: AICallOptions = {
        responseFormat: {
          type: "json_schema",
          json_schema: {
            name: "items",
            schema: { type: "object" },
            strict: true,
          },
        },
      };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.structuredOutputs).toBe(true);
    });

    it("captures maxTokens from options", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello" }];
      const options: AICallOptions = { maxTokens: 1000 };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.maxOutputTokens).toBe(1000);
    });

    it("captures streaming from options", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello" }];
      const options: AICallOptions = { stream: true };

      const requirements = deriveRequestRequirements(messages, options);

      expect(requirements.streaming).toBe(true);
    });

    it("captures estimated tokens", () => {
      const messages: AIMessage[] = [{ role: "user", content: "Hello" }];
      const options: AICallOptions = {};

      const requirements = deriveRequestRequirements(messages, options, 500);

      expect(requirements.estimatedInputTokens).toBe(500);
    });
  });

  describe("validateRequestAgainstCapabilities", () => {
    const fullCapabilities: ModelCapabilities = {
      contextWindow: 8192,
      maxOutputTokens: 4096,
      streaming: true,
      tools: true,
      jsonSchema: true,
      structuredOutputs: true,
      reasoning: { supported: true },
      modalities: {
        input: ["text", "image"],
        output: ["text"],
      },
    };

    const basicCapabilities: ModelCapabilities = {
      contextWindow: 4096,
      maxOutputTokens: 1024,
      streaming: true,
      tools: false,
      jsonSchema: false,
      structuredOutputs: false,
      reasoning: { supported: false },
      modalities: {
        input: ["text"],
        output: ["text"],
      },
    };

    it("passes valid request against full capabilities", () => {
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: false,
        tools: false,
        jsonSchema: false,
        structuredOutputs: false,
        maxOutputTokens: 1000,
        estimatedInputTokens: 500,
      };

      // Should not throw
      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          fullCapabilities,
        ),
      ).not.toThrow();
    });

    it("throws for unsupported streaming", () => {
      const noStreamCapabilities = { ...fullCapabilities, streaming: false };
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: true,
        tools: false,
        jsonSchema: false,
        structuredOutputs: false,
        estimatedInputTokens: 100,
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          noStreamCapabilities,
        ),
      ).toThrow(CapabilityError);
    });

    it("throws for unsupported tools", () => {
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: false,
        tools: true,
        jsonSchema: false,
        structuredOutputs: false,
        estimatedInputTokens: 100,
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          basicCapabilities,
        ),
      ).toThrow(CapabilityError);
    });

    it("throws for unsupported json_schema", () => {
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: false,
        tools: false,
        jsonSchema: true,
        structuredOutputs: false,
        estimatedInputTokens: 100,
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          basicCapabilities,
        ),
      ).toThrow(CapabilityError);
    });

    it("throws for unsupported structured outputs", () => {
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: false,
        tools: false,
        jsonSchema: true,
        structuredOutputs: true,
        estimatedInputTokens: 100,
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          basicCapabilities,
        ),
      ).toThrow(CapabilityError);
    });

    it("throws for max tokens exceeded", () => {
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: false,
        tools: false,
        jsonSchema: false,
        structuredOutputs: false,
        maxOutputTokens: 5000, // Exceeds 1024
        estimatedInputTokens: 100,
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          basicCapabilities,
        ),
      ).toThrow(CapabilityError);
    });

    it("throws for context overflow", () => {
      const requirements = {
        inputModalities: new Set(["text"] as const),
        streaming: false,
        tools: false,
        jsonSchema: false,
        structuredOutputs: false,
        estimatedInputTokens: 10000, // Exceeds 4096
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          basicCapabilities,
        ),
      ).toThrow(CapabilityError);
    });

    it("throws for unsupported input modality", () => {
      const requirements = {
        inputModalities: new Set(["text", "image"] as const),
        streaming: false,
        tools: false,
        jsonSchema: false,
        structuredOutputs: false,
        estimatedInputTokens: 100,
      };

      expect(() =>
        validateRequestAgainstCapabilities(
          "test-model",
          requirements,
          basicCapabilities,
        ),
      ).toThrow(CapabilityError);
    });
  });

  describe("CapabilityError", () => {
    it("includes modelId and errors", () => {
      const error = new CapabilityError("test-model", [
        "requires streaming",
        "requires tools",
      ]);

      expect(error.modelId).toBe("test-model");
      expect(error.errors).toEqual(["requires streaming", "requires tools"]);
      expect(error.message).toContain("test-model");
      expect(error.message).toContain("requires streaming");
      expect(error.name).toBe("CapabilityError");
    });
  });

  describe("modelSupportsTools", () => {
    it("returns true when tools is true", () => {
      const capabilities: ModelCapabilities = {
        contextWindow: 4096,
        streaming: true,
        tools: true,
        jsonSchema: false,
        structuredOutputs: false,
        reasoning: { supported: false },
        modalities: { input: ["text"], output: ["text"] },
      };

      expect(modelSupportsTools(capabilities)).toBe(true);
    });

    it("returns false when tools is false", () => {
      const capabilities: ModelCapabilities = {
        contextWindow: 4096,
        streaming: true,
        tools: false,
        jsonSchema: false,
        structuredOutputs: false,
        reasoning: { supported: false },
        modalities: { input: ["text"], output: ["text"] },
      };

      expect(modelSupportsTools(capabilities)).toBe(false);
    });
  });

  describe("modelSupportsStreaming", () => {
    it("returns correct boolean", () => {
      expect(
        modelSupportsStreaming({
          contextWindow: 4096,
          streaming: true,
          tools: false,
          jsonSchema: false,
          structuredOutputs: false,
          reasoning: { supported: false },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBe(true);

      expect(
        modelSupportsStreaming({
          contextWindow: 4096,
          streaming: false,
          tools: false,
          jsonSchema: false,
          structuredOutputs: false,
          reasoning: { supported: false },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBe(false);
    });
  });

  describe("modelSupportsJsonSchema", () => {
    it("returns correct boolean", () => {
      expect(
        modelSupportsJsonSchema({
          contextWindow: 4096,
          streaming: true,
          tools: false,
          jsonSchema: true,
          structuredOutputs: false,
          reasoning: { supported: false },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBe(true);
    });
  });

  describe("modelSupportsStructuredOutputs", () => {
    it("returns correct boolean", () => {
      expect(
        modelSupportsStructuredOutputs({
          contextWindow: 4096,
          streaming: true,
          tools: false,
          jsonSchema: true,
          structuredOutputs: true,
          reasoning: { supported: false },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBe(true);
    });
  });

  describe("modelSupportsReasoning", () => {
    it("returns correct boolean", () => {
      expect(
        modelSupportsReasoning({
          contextWindow: 4096,
          streaming: true,
          tools: false,
          jsonSchema: false,
          structuredOutputs: false,
          reasoning: { supported: true },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBe(true);
    });
  });

  describe("getReasoningMode", () => {
    it("returns mode from reasoning config", () => {
      expect(
        getReasoningMode({
          contextWindow: 4096,
          streaming: true,
          tools: false,
          jsonSchema: false,
          structuredOutputs: false,
          reasoning: {
            supported: true,
            mode: "prompt-controlled",
            disablePrefix: "/no_think",
          },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBe("prompt-controlled");
    });

    it("returns undefined when no mode specified", () => {
      expect(
        getReasoningMode({
          contextWindow: 4096,
          streaming: true,
          tools: false,
          jsonSchema: false,
          structuredOutputs: false,
          reasoning: { supported: false },
          modalities: { input: ["text"], output: ["text"] },
        }),
      ).toBeUndefined();
    });
  });
});
