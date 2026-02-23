/**
 * Initialization Tests
 *
 * Tests for AI client initialization lifecycle and state management.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initAI, isAIInitialized, resetAI } from "../index.js";
import { createMockLoggerFactory, getFixturesPath } from "./setup.js";

describe("Initialization", () => {
  const mockLoggerFactory = createMockLoggerFactory();

  beforeEach(() => {
    // Ensure clean state before each test
    resetAI();
    mockLoggerFactory.reset();
  });

  afterEach(() => {
    // Clean up after each test
    resetAI();
  });

  describe("initAI", () => {
    it("sets initialized state", () => {
      expect(isAIInitialized()).toBe(false);

      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });

      expect(isAIInitialized()).toBe(true);
    });

    it("throws if already initialized", () => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });

      expect(() =>
        initAI({
          configPath: getFixturesPath(),
          createChildLogger: mockLoggerFactory.factory,
        }),
      ).toThrow("already initialized");
    });

    it("accepts optional debugLogPath", () => {
      // Should not throw
      expect(() =>
        initAI({
          configPath: getFixturesPath(),
          createChildLogger: mockLoggerFactory.factory,
          debugLogPath: "/tmp/ai-debug.jsonl",
        }),
      ).not.toThrow();

      expect(isAIInitialized()).toBe(true);
    });

    it("works without debugLogPath", () => {
      // Should not throw
      expect(() =>
        initAI({
          configPath: getFixturesPath(),
          createChildLogger: mockLoggerFactory.factory,
        }),
      ).not.toThrow();

      expect(isAIInitialized()).toBe(true);
    });
  });

  describe("resetAI", () => {
    it("clears initialized state", () => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });

      expect(isAIInitialized()).toBe(true);

      resetAI();

      expect(isAIInitialized()).toBe(false);
    });

    it("allows re-initialization after reset", () => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });

      resetAI();

      // Should not throw on re-init
      expect(() =>
        initAI({
          configPath: getFixturesPath(),
          createChildLogger: mockLoggerFactory.factory,
        }),
      ).not.toThrow();

      expect(isAIInitialized()).toBe(true);
    });

    it("is safe to call multiple times", () => {
      // Should not throw even when not initialized
      expect(() => resetAI()).not.toThrow();
      expect(() => resetAI()).not.toThrow();
    });
  });

  describe("isAIInitialized", () => {
    it("returns false before initialization", () => {
      expect(isAIInitialized()).toBe(false);
    });

    it("returns true after initialization", () => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });

      expect(isAIInitialized()).toBe(true);
    });

    it("returns false after reset", () => {
      initAI({
        configPath: getFixturesPath(),
        createChildLogger: mockLoggerFactory.factory,
      });

      resetAI();

      expect(isAIInitialized()).toBe(false);
    });
  });
});
