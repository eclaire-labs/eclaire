/**
 * Test Setup and Utilities
 *
 * Shared test infrastructure for @eclaire/ai package tests.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, vi } from "vitest";

// Get the directory of this file
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// =============================================================================
// TEST FIXTURES PATH
// =============================================================================

export const FIXTURES_DIR = path.join(__dirname, "fixtures");

/**
 * Get the path to the fixtures directory for use as configPath
 */
export function getFixturesPath(): string {
  return FIXTURES_DIR;
}

// =============================================================================
// MOCK LOGGER
// =============================================================================

type MockFn = (...args: any[]) => any;

export interface MockLogger {
  debug: MockFn;
  info: MockFn;
  warn: MockFn;
  error: MockFn;
  trace: MockFn;
  fatal: MockFn;
  child: MockFn;
}

/**
 * Create a mock logger for testing
 */
export function createMockLogger(): MockLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
  };
}

export interface MockLoggerFactory {
  factory: (name: string) => MockLogger;
  getLogger: (name: string) => MockLogger | undefined;
  getAllLoggers: () => Map<string, MockLogger>;
  reset: () => void;
}

/**
 * Create a logger factory that returns mock loggers
 */
export function createMockLoggerFactory(): MockLoggerFactory {
  const loggers = new Map<string, MockLogger>();

  return {
    factory: (name: string) => {
      if (!loggers.has(name)) {
        loggers.set(name, createMockLogger());
      }
      return loggers.get(name)!;
    },
    getLogger: (name: string) => loggers.get(name),
    getAllLoggers: () => loggers,
    reset: () => loggers.clear(),
  };
}

// =============================================================================
// MOCK FETCH
// =============================================================================

export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Headers;
  body?: ReadableStream<Uint8Array> | null;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}

export interface MockFetchInstance {
  fetch: MockFn;
  calls: Array<{ url: string; init?: RequestInit }>;
  queueResponse: (response: MockFetchResponse) => void;
  queueJsonResponse: (data: unknown, status?: number) => void;
  queueErrorResponse: (status: number, message: string) => void;
  queueStreamResponse: (
    stream: ReadableStream<Uint8Array>,
    status?: number,
  ) => void;
  reset: () => void;
}

/**
 * Create a mock fetch function
 */
export function createMockFetch(): MockFetchInstance {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let responseQueue: MockFetchResponse[] = [];

  const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });

    const response = responseQueue.shift();
    if (!response) {
      throw new Error("No mock response configured");
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers ?? new Headers(),
      body: response.body ?? null,
      json: response.json ?? (async () => ({})),
      text: response.text ?? (async () => ""),
    };
  });

  return {
    fetch: mockFetch,
    calls,
    queueResponse: (response: MockFetchResponse) => {
      responseQueue.push(response);
    },
    queueJsonResponse: (data: unknown, status = 200) => {
      responseQueue.push({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        json: async () => data,
        text: async () => JSON.stringify(data),
      });
    },
    queueErrorResponse: (status: number, message: string) => {
      responseQueue.push({
        ok: false,
        status,
        statusText: message,
        text: async () => message,
      });
    },
    queueStreamResponse: (stream: ReadableStream<Uint8Array>, status = 200) => {
      responseQueue.push({
        ok: status >= 200 && status < 300,
        status,
        statusText: "OK",
        body: stream,
      });
    },
    reset: () => {
      calls.length = 0;
      responseQueue = [];
      mockFetch.mockClear();
    },
  };
}

// =============================================================================
// SSE STREAM HELPERS
// =============================================================================

/**
 * Create a mock SSE stream from an array of SSE events
 */
export function createSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;

  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < events.length) {
        const event = events[index]!;
        controller.enqueue(encoder.encode(`${event}\n\n`));
        index++;
      } else {
        controller.close();
      }
    },
  });
}

/**
 * Create SSE data line
 */
export function sseData(data: unknown): string {
  return `data: ${JSON.stringify(data)}`;
}

/**
 * Create a content delta SSE event
 */
export function sseContentDelta(content: string): string {
  return sseData({
    choices: [{ delta: { content } }],
  });
}

/**
 * Create a reasoning delta SSE event
 */
export function sseReasoningDelta(reasoning: string): string {
  return sseData({
    choices: [{ delta: { reasoning } }],
  });
}

/**
 * Create a finish reason SSE event
 */
export function sseFinishReason(
  reason: "stop" | "tool_calls" | "length",
): string {
  return sseData({
    choices: [{ finish_reason: reason, delta: {} }],
  });
}

/**
 * Create a usage SSE event
 */
export function sseUsage(
  promptTokens: number,
  completionTokens: number,
): string {
  return sseData({
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  });
}

/**
 * Create a tool call delta SSE event
 */
export function sseToolCallDelta(
  index: number,
  id?: string,
  functionName?: string,
  argumentsDelta?: string,
): string {
  const toolCall: Record<string, unknown> = { index };
  if (id) toolCall.id = id;
  if (functionName || argumentsDelta) {
    const fn: Record<string, unknown> = {};
    if (functionName) fn.name = functionName;
    if (argumentsDelta) fn.arguments = argumentsDelta;
    toolCall.function = fn;
  }
  return sseData({
    choices: [{ delta: { tool_calls: [toolCall] } }],
  });
}

/**
 * Create the SSE done event
 */
export function sseDone(): string {
  return "data: [DONE]";
}

// =============================================================================
// OPENAI RESPONSE HELPERS
// =============================================================================

/**
 * Create a mock OpenAI chat completion response
 */
export function createOpenAIResponse(options: {
  content?: string;
  reasoning?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  finishReason?: "stop" | "tool_calls" | "length";
  promptTokens?: number;
  completionTokens?: number;
}) {
  return {
    id: "test-completion-id",
    object: "chat.completion",
    created: Date.now(),
    model: "test-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: options.content ?? "",
          reasoning: options.reasoning,
          tool_calls: options.toolCalls?.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        },
        finish_reason: options.finishReason ?? "stop",
      },
    ],
    usage: {
      prompt_tokens: options.promptTokens ?? 10,
      completion_tokens: options.completionTokens ?? 20,
      total_tokens:
        (options.promptTokens ?? 10) + (options.completionTokens ?? 20),
    },
  };
}

// =============================================================================
// TEMP FILE HELPERS
// =============================================================================

let tempDirs: string[] = [];

/**
 * Create a temporary directory for tests
 */
export function createTempDir(): string {
  const tempDir = fs.mkdtempSync(path.join("/tmp", "ai-test-"));
  tempDirs.push(tempDir);
  return tempDir;
}

/**
 * Write JSON to a file in a temp directory
 */
export function writeTempJson(
  dir: string,
  filename: string,
  data: unknown,
): string {
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return filePath;
}

/**
 * Clean up all temp directories
 */
export function cleanupTempDirs(): void {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
  tempDirs = [];
}

// =============================================================================
// AGENT TEST HELPERS
// =============================================================================

import type { AgentStep, StepToolExecution } from "../agent/types.js";
import type { ToolCallResult } from "../types.js";

/**
 * Create a mock AgentStep for testing stop conditions
 */
export function createMockStep(options: {
  stepNumber?: number;
  content?: string;
  reasoning?: string;
  toolCalls?: ToolCallResult[];
  toolResults?: StepToolExecution[];
  finishReason?: "stop" | "tool_calls" | "length";
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): AgentStep {
  return {
    stepNumber: options.stepNumber ?? 1,
    timestamp: new Date().toISOString(),
    aiResponse: {
      content: options.content ?? "",
      reasoning: options.reasoning,
      toolCalls: options.toolCalls,
      finishReason: options.finishReason,
      usage: options.usage,
    },
    toolResults: options.toolResults,
    isTerminal: false,
  };
}

/**
 * Create a mock tool call result
 */
export function createMockToolCall(
  name: string,
  args: Record<string, unknown>,
  id?: string,
): ToolCallResult {
  return {
    id: id ?? `call_${name}_${Date.now()}`,
    type: "function",
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

/**
 * Create a mock tool execution result
 */
export function createMockToolExecution(
  toolName: string,
  success: boolean,
  content: string = "",
  error?: string,
): StepToolExecution {
  return {
    toolName,
    toolCallId: `call_${toolName}_${Date.now()}`,
    input: {},
    output: {
      success,
      content,
      error,
    },
    durationMs: 100,
  };
}

// =============================================================================
// CLEANUP
// =============================================================================

// Auto-cleanup after each test
afterEach(() => {
  cleanupTempDirs();
});
