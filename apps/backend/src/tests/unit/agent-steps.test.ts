import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RuntimeAgentStep } from "@eclaire/ai";

// ---------------------------------------------------------------------------
// Mocks (vi.hoisted ensures values are available inside vi.mock factories)
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => {
  let idCounter = 0;

  const insertValues = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));

  const orderBy = vi.fn().mockResolvedValue([]);
  const where = vi.fn(() => ({ orderBy }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  return {
    idCounter,
    getAndIncrementId: () => `step-${++idCounter}`,
    resetIdCounter: () => {
      idCounter = 0;
    },
    insertValues,
    insert,
    orderBy,
    where,
    from,
    select,
    logger,
  };
});

vi.mock("@eclaire/core", () => ({
  generateAgentStepId: () => mocks.getAndIncrementId(),
}));

vi.mock("../../db/index.js", () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
  },
  schema: {
    agentSteps: {
      messageId: "messageId",
      conversationId: "conversationId",
      stepNumber: "stepNumber",
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: (a: unknown, b: unknown) => ({ type: "eq", a, b }),
  and: (...args: unknown[]) => ({ type: "and", args }),
  asc: (col: unknown) => ({ type: "asc", col }),
}));

vi.mock("../../lib/logger.js", () => ({
  createChildLogger: () => mocks.logger,
}));

// Import after mocks are set up
import {
  getAgentSteps,
  saveAgentSteps,
} from "../../lib/services/agent-steps.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// biome-ignore lint/suspicious/noExplicitAny: test helper allows arbitrary shapes to exercise truncation paths
function makeStep(overrides: Record<string, any> = {}): RuntimeAgentStep {
  return {
    stepNumber: 1,
    timestamp: "2026-01-15T10:00:00.000Z",
    assistantMessage: {
      role: "assistant",
      content: [{ type: "text", text: "Hello" }],
    },
    isTerminal: false,
    ...overrides,
  } as RuntimeAgentStep;
}

function makeStepWithContent(
  textBlocks: string[],
  thinkingBlocks: string[],
): RuntimeAgentStep {
  const content: RuntimeAgentStep["assistantMessage"]["content"] = [
    ...thinkingBlocks.map((t) => ({ type: "thinking" as const, text: t })),
    ...textBlocks.map((t) => ({ type: "text" as const, text: t })),
  ];
  return makeStep({ assistantMessage: { role: "assistant", content } });
}

/** Generate a string of approximately `sizeBytes` length. */
function largeString(sizeBytes: number): string {
  return "x".repeat(sizeBytes);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("agent-steps service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetIdCounter();
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.orderBy.mockResolvedValue([]);
  });

  // =========================================================================
  // extractContentFromStep (tested via saveAgentSteps)
  // =========================================================================

  describe("extractContentFromStep (via saveAgentSteps)", () => {
    it("extracts both thinking and text content", async () => {
      const step = makeStepWithContent(["Hello world"], ["I should greet"]);

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values).toHaveLength(1);
      expect(values[0].thinkingContent).toBe("I should greet");
      expect(values[0].textContent).toBe("Hello world");
    });

    it("returns null thinkingContent when only text blocks exist", async () => {
      const step = makeStepWithContent(["Just text"], []);

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].thinkingContent).toBeNull();
      expect(values[0].textContent).toBe("Just text");
    });

    it("returns null textContent when only thinking blocks exist", async () => {
      const step = makeStepWithContent([], ["Deep thinking"]);

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].thinkingContent).toBe("Deep thinking");
      expect(values[0].textContent).toBeNull();
    });

    it("returns both null when content array is empty", async () => {
      const step = makeStep({
        assistantMessage: { role: "assistant", content: [] },
      });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].thinkingContent).toBeNull();
      expect(values[0].textContent).toBeNull();
    });

    it("returns both null when assistantMessage has no content", async () => {
      const step = makeStep({
        assistantMessage: { role: "assistant", content: undefined as any },
      });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].thinkingContent).toBeNull();
      expect(values[0].textContent).toBeNull();
    });

    it("joins multiple thinking blocks with newline", async () => {
      const step = makeStepWithContent([], ["Think A", "Think B", "Think C"]);

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].thinkingContent).toBe("Think A\nThink B\nThink C");
    });

    it("joins multiple text blocks with newline", async () => {
      const step = makeStepWithContent(["Part 1", "Part 2"], []);

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].textContent).toBe("Part 1\nPart 2");
    });

    it("ignores blocks with empty text", async () => {
      const step = makeStep({
        assistantMessage: {
          role: "assistant",
          content: [
            { type: "text", text: "" },
            { type: "text", text: "Real content" },
            { type: "thinking", text: "" },
          ],
        },
      });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].textContent).toBe("Real content");
      expect(values[0].thinkingContent).toBeNull();
    });

    it("ignores tool_call blocks (only processes text and thinking)", async () => {
      const step = makeStep({
        assistantMessage: {
          role: "assistant",
          content: [
            { type: "text", text: "Before tool" },
            { type: "tool_call", id: "tc-1", name: "search", arguments: {} },
            { type: "text", text: "After tool" },
          ],
        },
      });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].textContent).toBe("Before tool\nAfter tool");
      expect(values[0].thinkingContent).toBeNull();
    });
  });

  // =========================================================================
  // truncateToolExecutions (tested via saveAgentSteps)
  // =========================================================================

  describe("truncateToolExecutions (via saveAgentSteps)", () => {
    it("passes small results through unchanged", async () => {
      const toolExec = {
        toolName: "search",
        toolCallId: "tc-1",
        input: { query: "hello" },
        result: { content: [{ type: "text", text: "Found it" }] },
        durationMs: 100,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].toolExecutions[0].result).toEqual(toolExec.result);
      expect(values[0].toolExecutions[0].input).toEqual(toolExec.input);
    });

    it("truncates large result with metadata", async () => {
      const bigText = largeString(60_000);
      const toolExec = {
        toolName: "search",
        toolCallId: "tc-1",
        input: { query: "test" },
        result: { data: bigText },
        durationMs: 200,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      const truncatedResult = values[0].toolExecutions[0].result;
      expect(truncatedResult._truncated).toBe(true);
      expect(truncatedResult._message).toBe("Result truncated for storage");
      expect(truncatedResult._originalSize).toMatch(/\d+KB/);
    });

    it("preserves isError flag on truncated results", async () => {
      const bigText = largeString(60_000);
      const toolExec = {
        toolName: "search",
        toolCallId: "tc-1",
        input: {},
        result: { isError: true, data: bigText },
        durationMs: 100,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      const truncatedResult = values[0].toolExecutions[0].result;
      expect(truncatedResult._truncated).toBe(true);
      expect(truncatedResult.isError).toBe(true);
    });

    it("preserves first 2000 chars of content[0].text on truncated results", async () => {
      const longText = largeString(60_000);
      const toolExec = {
        toolName: "read",
        toolCallId: "tc-1",
        input: {},
        result: { content: [{ type: "text", text: longText }] },
        durationMs: 150,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      const truncatedResult = values[0].toolExecutions[0].result;
      expect(truncatedResult._truncated).toBe(true);
      expect(truncatedResult.content).toHaveLength(1);
      expect(truncatedResult.content[0].type).toBe("text");
      // 2000 chars + "..."
      expect(truncatedResult.content[0].text).toHaveLength(2003);
      expect(truncatedResult.content[0].text.endsWith("...")).toBe(true);
    });

    it("truncates large input with metadata", async () => {
      const bigInput = { data: largeString(60_000) };
      const toolExec = {
        toolName: "write",
        toolCallId: "tc-1",
        input: bigInput,
        result: { ok: true },
        durationMs: 50,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      const truncatedInput = values[0].toolExecutions[0].input;
      expect(truncatedInput._truncated).toBe(true);
      expect(truncatedInput._originalSize).toMatch(/\d+KB/);
    });

    it("replaces non-serializable result with error marker", async () => {
      const circular: any = { a: 1 };
      circular.self = circular;
      const toolExec = {
        toolName: "fetch",
        toolCallId: "tc-1",
        input: { url: "http://example.com" },
        result: circular,
        durationMs: 100,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      const result = values[0].toolExecutions[0].result;
      expect(result._truncated).toBe(true);
      expect(result._message).toBe("Result could not be serialized");
    });

    it("replaces non-serializable input with error marker", async () => {
      const circular: any = { b: 2 };
      circular.self = circular;
      const toolExec = {
        toolName: "write",
        toolCallId: "tc-1",
        input: circular,
        result: { ok: true },
        durationMs: 50,
      };
      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      const input = values[0].toolExecutions[0].input;
      expect(input._truncated).toBe(true);
    });

    it("handles steps with no toolExecutions", async () => {
      const step = makeStep({ toolExecutions: undefined });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].toolExecutions).toBeNull();
    });

    it("does not truncate result that is exactly at the limit", async () => {
      // Build a result whose JSON is just under 50KB
      // JSON.stringify({data:"x..."}) adds ~11 chars of overhead
      const sizeForPayload = 49_980;
      const toolExec = {
        toolName: "read",
        toolCallId: "tc-1",
        input: {},
        result: { d: largeString(sizeForPayload) },
        durationMs: 100,
      };
      // Verify our string is under the limit
      const jsonLen = JSON.stringify(toolExec.result).length;
      expect(jsonLen).toBeLessThanOrEqual(50_000);

      const step = makeStep({ toolExecutions: [toolExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      // Should not be truncated
      expect(values[0].toolExecutions[0].result._truncated).toBeUndefined();
      expect(values[0].toolExecutions[0].result.d).toBe(toolExec.result.d);
    });

    it("handles multiple tool executions with mixed sizes", async () => {
      const smallExec = {
        toolName: "search",
        toolCallId: "tc-1",
        input: { q: "hi" },
        result: { data: "small" },
        durationMs: 10,
      };
      const bigExec = {
        toolName: "read",
        toolCallId: "tc-2",
        input: { path: "/big" },
        result: { data: largeString(60_000) },
        durationMs: 500,
      };
      const step = makeStep({ toolExecutions: [smallExec, bigExec] });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].toolExecutions[0].result.data).toBe("small");
      expect(values[0].toolExecutions[1].result._truncated).toBe(true);
    });
  });

  // =========================================================================
  // saveAgentSteps
  // =========================================================================

  describe("saveAgentSteps", () => {
    it("returns immediately for empty steps array without DB call", async () => {
      await saveAgentSteps("msg-1", "conv-1", []);

      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.insertValues).not.toHaveBeenCalled();
    });

    it("inserts values with correct shape", async () => {
      const step = makeStep({
        stepNumber: 3,
        timestamp: "2026-03-15T14:30:00.000Z",
        isTerminal: true,
        stopReason: "no_tool_calls",
      });

      await saveAgentSteps("msg-42", "conv-7", [step]);

      expect(mocks.insert).toHaveBeenCalledTimes(1);
      expect(mocks.insertValues).toHaveBeenCalledTimes(1);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values).toHaveLength(1);

      const row = values[0];
      expect(row.id).toBe("step-1");
      expect(row.messageId).toBe("msg-42");
      expect(row.conversationId).toBe("conv-7");
      expect(row.stepNumber).toBe(3);
      expect(row.timestamp).toEqual(new Date("2026-03-15T14:30:00.000Z"));
      expect(row.isTerminal).toBe(true);
      expect(row.stopReason).toBe("no_tool_calls");
      expect(row.promptTokens).toBeNull();
      expect(row.completionTokens).toBeNull();
    });

    it("generates unique IDs for each step", async () => {
      const steps = [
        makeStep({ stepNumber: 1 }),
        makeStep({ stepNumber: 2 }),
        makeStep({ stepNumber: 3 }),
      ];

      await saveAgentSteps("msg-1", "conv-1", steps);

      const values = mocks.insertValues.mock.calls[0]![0];
      const ids = values.map((v: any) => v.id);
      expect(ids).toEqual(["step-1", "step-2", "step-3"]);
      expect(new Set(ids).size).toBe(3);
    });

    it("defaults stopReason to null when undefined", async () => {
      const step = makeStep({ stopReason: undefined });

      await saveAgentSteps("msg-1", "conv-1", [step]);

      const values = mocks.insertValues.mock.calls[0]![0];
      expect(values[0].stopReason).toBeNull();
    });

    it("logs after successful save", async () => {
      await saveAgentSteps("msg-1", "conv-1", [
        makeStep(),
        makeStep({ stepNumber: 2 }),
      ]);

      expect(mocks.logger.info).toHaveBeenCalledWith(
        { messageId: "msg-1", conversationId: "conv-1", stepCount: 2 },
        "Saved agent execution steps",
      );
    });

    it("propagates DB errors (no internal try/catch)", async () => {
      mocks.insertValues.mockRejectedValueOnce(new Error("DB connection lost"));

      await expect(
        saveAgentSteps("msg-1", "conv-1", [makeStep()]),
      ).rejects.toThrow("DB connection lost");
    });

    it("passes the agentSteps table to db.insert", async () => {
      await saveAgentSteps("msg-1", "conv-1", [makeStep()]);

      // The mock receives schema.agentSteps which is our mock object
      expect(mocks.insert).toHaveBeenCalledWith({
        messageId: "messageId",
        conversationId: "conversationId",
        stepNumber: "stepNumber",
      });
    });
  });

  // =========================================================================
  // getAgentSteps
  // =========================================================================

  describe("getAgentSteps", () => {
    it("returns ordered steps on success", async () => {
      const mockSteps = [
        { id: "step-1", stepNumber: 1, textContent: "A" },
        { id: "step-2", stepNumber: 2, textContent: "B" },
      ];
      mocks.orderBy.mockResolvedValueOnce(mockSteps);

      const result = await getAgentSteps("msg-1", "conv-1");

      expect(result).toEqual(mockSteps);
      expect(mocks.select).toHaveBeenCalled();
      expect(mocks.from).toHaveBeenCalled();
      expect(mocks.where).toHaveBeenCalled();
      expect(mocks.orderBy).toHaveBeenCalled();
    });

    it("returns empty array on DB error", async () => {
      mocks.orderBy.mockRejectedValueOnce(new Error("Table not found"));

      const result = await getAgentSteps("msg-1", "conv-1");

      expect(result).toEqual([]);
    });

    it("logs error details when DB query fails", async () => {
      mocks.orderBy.mockRejectedValueOnce(new Error("Connection timeout"));

      await getAgentSteps("msg-err", "conv-err");

      expect(mocks.logger.error).toHaveBeenCalledWith(
        {
          messageId: "msg-err",
          conversationId: "conv-err",
          error: "Connection timeout",
        },
        "Failed to get agent steps",
      );
    });

    it("logs 'Unknown error' for non-Error exceptions", async () => {
      mocks.orderBy.mockRejectedValueOnce("string error");

      await getAgentSteps("msg-1", "conv-1");

      expect(mocks.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Unknown error" }),
        "Failed to get agent steps",
      );
    });
  });
});
