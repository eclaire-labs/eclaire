/**
 * Debug Logging Tests
 *
 * Tests for debug file logging functionality.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  setDebugLogPath,
  clearDebugLogPath,
  isDebugLoggingEnabled,
  logDebugEntry,
  type DebugLogEntry,
} from "../debug-logger.js";
import { createTempDir } from "./setup.js";

describe("Debug Logging", () => {
  let tempDir: string;
  let logPath: string;

  beforeEach(() => {
    clearDebugLogPath();
    tempDir = createTempDir();
    logPath = path.join(tempDir, "ai-debug.jsonl");
  });

  afterEach(() => {
    clearDebugLogPath();
  });

  describe("isDebugLoggingEnabled", () => {
    it("returns false when no path is set", () => {
      expect(isDebugLoggingEnabled()).toBe(false);
    });

    it("returns true when path is set", () => {
      setDebugLogPath(logPath);

      expect(isDebugLoggingEnabled()).toBe(true);
    });

    it("returns false after clearDebugLogPath", () => {
      setDebugLogPath(logPath);
      clearDebugLogPath();

      expect(isDebugLoggingEnabled()).toBe(false);
    });

    it("returns false when undefined path is set", () => {
      setDebugLogPath(undefined);

      expect(isDebugLoggingEnabled()).toBe(false);
    });
  });

  describe("logDebugEntry", () => {
    it("does nothing when logging is disabled", () => {
      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
      };

      // Should not throw
      expect(() => logDebugEntry(entry)).not.toThrow();

      // File should not exist
      expect(fs.existsSync(logPath)).toBe(false);
    });

    it("writes JSON line when logging is enabled", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
      };

      logDebugEntry(entry);

      expect(fs.existsSync(logPath)).toBe(true);
      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.timestamp).toBe("2024-01-01T00:00:00.000Z");
      expect(parsed.type).toBe("response");
      expect(parsed.aiContext).toBe("backend");
      expect(parsed.modelId).toBe("test-model");
      expect(parsed.provider).toBe("test-provider");
    });

    it("creates directory if it does not exist", () => {
      const nestedPath = path.join(tempDir, "nested", "dir", "ai-debug.jsonl");
      setDebugLogPath(nestedPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
      };

      logDebugEntry(entry);

      expect(fs.existsSync(nestedPath)).toBe(true);
    });

    it("appends multiple entries", () => {
      setDebugLogPath(logPath);

      const entry1: DebugLogEntry = {
        timestamp: "2024-01-01T00:00:00.000Z",
        type: "request",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
      };

      const entry2: DebugLogEntry = {
        timestamp: "2024-01-01T00:00:01.000Z",
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
      };

      logDebugEntry(entry1);
      logDebugEntry(entry2);

      const content = fs.readFileSync(logPath, "utf-8");
      const lines = content.trim().split("\n");

      expect(lines).toHaveLength(2);

      const parsed1 = JSON.parse(lines[0]!);
      const parsed2 = JSON.parse(lines[1]!);

      expect(parsed1.type).toBe("request");
      expect(parsed2.type).toBe("response");
    });

    it("includes durationMs when provided", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        durationMs: 150,
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.durationMs).toBe(150);
    });

    it("includes estimatedInputTokens when provided", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        estimatedInputTokens: 100,
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.estimatedInputTokens).toBe(100);
    });

    it("includes streaming flag when provided", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "request",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        streaming: true,
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.streaming).toBe(true);
    });

    it("includes appContext when provided", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        appContext: {
          userId: "user-123",
          requestId: "req-456",
        },
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.appContext.userId).toBe("user-123");
      expect(parsed.appContext.requestId).toBe("req-456");
    });

    it("includes request details when provided", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "request",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        request: {
          messages: [{ role: "user", content: "Hello" }],
          options: { temperature: 0.7 },
        },
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.request.messages).toHaveLength(1);
      expect(parsed.request.messages[0].role).toBe("user");
      expect(parsed.request.options.temperature).toBe(0.7);
    });

    it("includes response details when provided", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        response: {
          content: "Hello there!",
          reasoning: "Thinking...",
          finishReason: "stop",
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        },
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.response.content).toBe("Hello there!");
      expect(parsed.response.reasoning).toBe("Thinking...");
      expect(parsed.response.finishReason).toBe("stop");
      expect(parsed.response.usage.prompt_tokens).toBe(10);
    });

    it("includes error details for error type", () => {
      setDebugLogPath(logPath);

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "error",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
        error: "Connection refused",
      };

      logDebugEntry(entry);

      const content = fs.readFileSync(logPath, "utf-8");
      const parsed = JSON.parse(content.trim());

      expect(parsed.type).toBe("error");
      expect(parsed.error).toBe("Connection refused");
    });

    it("fails silently on write error", () => {
      // Set to a path that will fail (read-only or invalid)
      setDebugLogPath("/root/definitely-not-writable/debug.jsonl");

      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const entry: DebugLogEntry = {
        timestamp: new Date().toISOString(),
        type: "response",
        aiContext: "backend",
        modelId: "test-model",
        provider: "test-provider",
      };

      // Should not throw
      expect(() => logDebugEntry(entry)).not.toThrow();

      // Should log error to console
      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy.mock.calls[0]?.[0]).toContain("[ai-debug]");

      consoleSpy.mockRestore();
    });
  });

  describe("setDebugLogPath", () => {
    it("sets the path correctly", () => {
      setDebugLogPath(logPath);

      expect(isDebugLoggingEnabled()).toBe(true);
    });

    it("handles undefined", () => {
      setDebugLogPath(logPath);
      setDebugLogPath(undefined);

      expect(isDebugLoggingEnabled()).toBe(false);
    });

    it("handles empty string", () => {
      setDebugLogPath("");

      expect(isDebugLoggingEnabled()).toBe(false);
    });
  });

  describe("clearDebugLogPath", () => {
    it("clears the path", () => {
      setDebugLogPath(logPath);
      clearDebugLogPath();

      expect(isDebugLoggingEnabled()).toBe(false);
    });

    it("is safe to call multiple times", () => {
      expect(() => {
        clearDebugLogPath();
        clearDebugLogPath();
        clearDebugLogPath();
      }).not.toThrow();
    });
  });
});
