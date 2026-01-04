/**
 * Configuration Tests
 *
 * Tests for configuration loading, caching, and CRUD operations.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  initAI,
  resetAI,
  loadProvidersConfiguration,
  loadModelsConfiguration,
  loadSelectionConfiguration,
  clearConfigCaches,
  getActiveModelIdForContext,
  getModelConfigById,
  getProviderConfig,
  getProviders,
  getModels,
} from "../index.js";
import {
  getFixturesPath,
  createMockLoggerFactory,
  createTempDir,
  writeTempJson,
} from "./setup.js";

describe("Configuration", () => {
  const mockLoggerFactory = createMockLoggerFactory();

  beforeEach(() => {
    resetAI();
    mockLoggerFactory.reset();
  });

  afterEach(() => {
    resetAI();
  });

  describe("Loading with fixtures", () => {
    beforeEach(() => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });
    });

    it("loadProvidersConfiguration loads and caches", async () => {
      const providers1 = await loadProvidersConfiguration();
      const providers2 = await loadProvidersConfiguration();

      expect(providers1).toBeDefined();
      expect(providers2).toBeDefined();
      // Should be same cached object
      expect(providers1).toBe(providers2);
    });

    it("loadModelsConfiguration loads and caches", async () => {
      const models1 = await loadModelsConfiguration();
      const models2 = await loadModelsConfiguration();

      expect(models1).toBeDefined();
      expect(models2).toBeDefined();
      expect(models1).toBe(models2);
    });

    it("loadSelectionConfiguration loads and caches", async () => {
      const selection1 = await loadSelectionConfiguration();
      const selection2 = await loadSelectionConfiguration();

      expect(selection1).toBeDefined();
      expect(selection2).toBeDefined();
      expect(selection1).toBe(selection2);
    });

    it("clearConfigCaches forces reload", async () => {
      const models1 = await loadModelsConfiguration();
      clearConfigCaches();
      const models2 = await loadModelsConfiguration();

      expect(models1).toBeDefined();
      expect(models2).toBeDefined();
      // After clearing, should be different objects (freshly loaded)
      expect(models1).not.toBe(models2);
    });
  });

  describe("Model/Provider accessors", () => {
    beforeEach(() => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });
    });

    it("getActiveModelIdForContext returns correct model", async () => {
      const modelId = await getActiveModelIdForContext("backend");

      expect(modelId).toBe("test-model-full");
    });

    it("getActiveModelIdForContext returns different model for different context", async () => {
      const backendModel = await getActiveModelIdForContext("backend");
      const workersModel = await getActiveModelIdForContext("workers");

      expect(backendModel).toBe("test-model-full");
      expect(workersModel).toBe("test-model-basic");
    });

    it("getModelConfigById returns model config", async () => {
      const model = await getModelConfigById("test-model-full");

      expect(model).toBeDefined();
      expect(model?.name).toBe("Test Model Full");
      expect(model?.capabilities.tools).toBe(true);
    });

    it("getModelConfigById returns null for unknown model", async () => {
      const model = await getModelConfigById("nonexistent-model");

      expect(model).toBeNull();
    });

    it("getProviderConfig returns provider config", async () => {
      const provider = await getProviderConfig("test-openai");

      expect(provider).toBeDefined();
      expect(provider?.dialect).toBe("openai_compatible");
    });

    it("getProviders returns all providers", () => {
      const providers = getProviders();

      // getProviders returns Record<string, ProviderConfig>
      expect(Object.keys(providers).length).toBeGreaterThan(0);
      expect(providers["test-openai"]).toBeDefined();
    });

    it("getModels returns all models", () => {
      const models = getModels();

      // getModels returns Array<{ id, model }>
      expect(models.length).toBeGreaterThan(0);
      expect(models.some((m) => m.id === "test-model-full")).toBe(true);
    });
  });

  describe("Model capabilities", () => {
    beforeEach(() => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });
    });

    it("full capability model has all features", async () => {
      const model = await getModelConfigById("test-model-full");

      expect(model?.capabilities.streaming).toBe(true);
      expect(model?.capabilities.tools).toBe(true);
      expect(model?.capabilities.jsonSchema).toBe(true);
      expect(model?.capabilities.structuredOutputs).toBe(true);
      expect(model?.capabilities.modalities.input).toContain("text");
      expect(model?.capabilities.modalities.input).toContain("image");
    });

    it("basic model has limited features", async () => {
      const model = await getModelConfigById("test-model-basic");

      expect(model?.capabilities.streaming).toBe(true);
      expect(model?.capabilities.tools).toBe(false);
      expect(model?.capabilities.jsonSchema).toBe(false);
      expect(model?.capabilities.modalities.input).toContain("text");
      expect(model?.capabilities.modalities.input).not.toContain("image");
    });
  });

  describe("Tokenizer configuration", () => {
    beforeEach(() => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });
    });

    it("model with tiktoken tokenizer", async () => {
      const model = await getModelConfigById("test-model-full");

      expect(model?.tokenizer?.type).toBe("tiktoken");
      expect(model?.tokenizer?.name).toBe("cl100k_base");
    });

    it("model with unknown tokenizer", async () => {
      const model = await getModelConfigById("test-model-basic");

      expect(model?.tokenizer?.type).toBe("unknown");
    });
  });
});
