/**
 * ToolLoopAgent Stream Tests
 *
 * Tests for the streaming variant of the agent.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { initAI, resetAI } from "../index.js";
import { ToolLoopAgent } from "../agent/tool-loop-agent.js";
import { createAgentContext } from "../agent/context.js";
import { stepCountIs, noToolCalls, anyOf } from "../agent/stop-conditions.js";
import type { AgentContext, AgentToolDefinition, AgentStreamEvent } from "../agent/types.js";
import type { ToolExecutionResult } from "../tools/types.js";
import {
  getFixturesPath,
  createMockLoggerFactory,
  createMockFetch,
  createSSEStream,
  sseContentDelta,
  sseReasoningDelta,
  sseFinishReason,
  sseUsage,
  sseToolCallDelta,
  sseDone,
} from "./setup.js";

describe("ToolLoopAgent Stream", () => {
  const mockLoggerFactory = createMockLoggerFactory();
  const mockFetch = createMockFetch();

  beforeEach(() => {
    resetAI();
    mockLoggerFactory.reset();
    mockFetch.reset();

    // Initialize AI with test fixtures
    initAI({
      configPath: getFixturesPath(),
      createChildLogger: mockLoggerFactory.factory,
    });

    // Replace global fetch with mock
    vi.stubGlobal("fetch", mockFetch.fetch);
  });

  afterEach(() => {
    resetAI();
    vi.unstubAllGlobals();
  });

  // Helper to collect all events from a stream
  async function collectEvents(
    stream: ReadableStream<AgentStreamEvent>
  ): Promise<AgentStreamEvent[]> {
    const reader = stream.getReader();
    const events: AgentStreamEvent[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      events.push(value);
    }
    return events;
  }

  // Helper to create a simple tool
  function createEchoTool(): AgentToolDefinition<z.ZodObject<{ message: z.ZodString }>, AgentContext> {
    return {
      name: "echo",
      description: "Echoes a message back",
      inputSchema: z.object({ message: z.string() }),
      execute: async (input): Promise<ToolExecutionResult> => {
        return { success: true, content: `Echo: ${input.message}` };
      },
    };
  }

  describe("stream method", () => {
    describe("event stream", () => {
      it("returns an eventStream and result promise", async () => {
        const events = [
          sseContentDelta("Hello"),
          sseContentDelta(" world!"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });

        expect(streamResult.eventStream).toBeInstanceOf(ReadableStream);
        expect(streamResult.result).toBeInstanceOf(Promise);

        // Consume stream to let it complete
        await collectEvents(streamResult.eventStream);
        const result = await streamResult.result;

        expect(result.text).toBe("Hello world!");
      });

      it("emits text-chunk events for content", async () => {
        const events = [
          sseContentDelta("Hello"),
          sseContentDelta(" world"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const textChunks = allEvents.filter((e) => e.type === "text-chunk");
        expect(textChunks.length).toBeGreaterThanOrEqual(1);

        const combinedText = textChunks
          .map((e) => (e.type === "text-chunk" ? e.content : ""))
          .join("");
        expect(combinedText).toBe("Hello world");
      });

      it("emits thought events for reasoning content", async () => {
        const events = [
          sseReasoningDelta("Let me think..."),
          sseContentDelta("The answer is 42"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Question", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const thoughtEvents = allEvents.filter((e) => e.type === "thought");
        expect(thoughtEvents.length).toBeGreaterThanOrEqual(1);

        const thinking = thoughtEvents
          .map((e) => (e.type === "thought" ? e.content : ""))
          .join("");
        expect(thinking).toContain("Let me think");
      });

      it("emits step-complete event after each step", async () => {
        const events = [
          sseContentDelta("Response"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const stepComplete = allEvents.filter((e) => e.type === "step-complete");
        expect(stepComplete).toHaveLength(1);

        if (stepComplete[0]?.type === "step-complete") {
          expect(stepComplete[0].step.stepNumber).toBe(1);
          expect(stepComplete[0].step.isTerminal).toBe(true);
        }
      });

      it("emits done event with final result", async () => {
        const events = [
          sseContentDelta("Final answer"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const doneEvent = allEvents.find((e) => e.type === "done");
        expect(doneEvent).toBeDefined();

        if (doneEvent?.type === "done") {
          expect(doneEvent.result.text).toBe("Final answer");
          expect(doneEvent.result.steps).toHaveLength(1);
        }
      });
    });

    describe("tool events", () => {
      it("emits tool-call-start and tool-call-complete events", async () => {
        // First step: trigger text-based tool call
        const step1Events = [
          sseContentDelta('```json\n{"type": "tool_calls", "calls": [{"name": "echo", "args": {"message": "test"}}]}\n```'),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step1Events));

        // Second step: final response
        const step2Events = [
          sseContentDelta("Done!"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step2Events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
          toolCallingMode: "text", // Use text mode for JSON code block parsing
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Echo test", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const toolStart = allEvents.filter((e) => e.type === "tool-call-start");
        const toolComplete = allEvents.filter((e) => e.type === "tool-call-complete");

        expect(toolStart.length).toBeGreaterThanOrEqual(1);
        expect(toolComplete.length).toBeGreaterThanOrEqual(1);

        if (toolStart[0]?.type === "tool-call-start") {
          expect(toolStart[0].toolName).toBe("echo");
        }

        if (toolComplete[0]?.type === "tool-call-complete") {
          expect(toolComplete[0].result.success).toBe(true);
        }
      });

      it("emits tool-call-error when tool fails", async () => {
        // First step: trigger tool call
        const step1Events = [
          sseContentDelta('```json\n{"type": "tool_calls", "calls": [{"name": "failing", "args": {}}]}\n```'),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step1Events));

        // Second step: final response
        const step2Events = [
          sseContentDelta("Tool failed"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step2Events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            failing: {
              name: "failing",
              description: "Always fails",
              inputSchema: z.object({}),
              execute: async (): Promise<ToolExecutionResult> => {
                return { success: false, content: "", error: "Intentional failure" };
              },
            },
          },
          toolCallingMode: "text", // Use text mode for JSON code block parsing
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Use failing tool", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const toolErrors = allEvents.filter((e) => e.type === "tool-call-error");
        expect(toolErrors.length).toBeGreaterThanOrEqual(1);

        if (toolErrors[0]?.type === "tool-call-error") {
          expect(toolErrors[0].error).toContain("Intentional failure");
        }
      });

      it("emits tool-call-error for unknown tool", async () => {
        // Step with call to unknown tool
        const step1Events = [
          sseContentDelta('```json\n{"type": "tool_calls", "calls": [{"name": "unknown", "args": {}}]}\n```'),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step1Events));

        // Second step
        const step2Events = [
          sseContentDelta("Unknown tool"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step2Events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
          toolCallingMode: "text", // Use text mode for JSON code block parsing
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Use unknown", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const toolErrors = allEvents.filter((e) => e.type === "tool-call-error");
        expect(toolErrors.length).toBeGreaterThanOrEqual(1);

        if (toolErrors[0]?.type === "tool-call-error") {
          expect(toolErrors[0].error).toContain("not found");
        }
      });

      it("executes tools from native tool_call_delta events", async () => {
        // First step: native tool_call_delta events (OpenAI streaming format)
        const step1Events = [
          sseToolCallDelta(0, "call_123", "echo", undefined),
          sseToolCallDelta(0, undefined, undefined, '{"message":'),
          sseToolCallDelta(0, undefined, undefined, '"hello from native"}'),
          sseFinishReason("tool_calls"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step1Events));

        // Second step: final response
        const step2Events = [
          sseContentDelta("Tool executed successfully!"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step2Events));

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Echo: hello from native",
        });

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            echo: {
              name: "echo",
              description: "Echoes a message",
              inputSchema: z.object({ message: z.string() }),
              execute: executeSpy,
            },
          },
          // Default mode is "native" - should use accumulated tool_call_deltas
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Echo hello", context });
        const allEvents = await collectEvents(streamResult.eventStream);
        const finalResult = await streamResult.result;

        // Verify tool was executed
        expect(executeSpy).toHaveBeenCalledWith(
          { message: "hello from native" },
          expect.objectContaining({ userId: "user_123" })
        );

        // Verify events
        const toolStart = allEvents.filter((e) => e.type === "tool-call-start");
        const toolComplete = allEvents.filter((e) => e.type === "tool-call-complete");
        expect(toolStart.length).toBeGreaterThanOrEqual(1);
        expect(toolComplete.length).toBeGreaterThanOrEqual(1);

        // Verify final result
        expect(finalResult.steps).toHaveLength(2);
        expect(finalResult.steps[0]!.toolResults).toBeDefined();
        expect(finalResult.steps[0]!.toolResults![0]!.toolName).toBe("echo");
      });

      it("ignores native tool_call_delta events when mode is 'text'", async () => {
        // Native tool_call_delta events that should be ignored
        const events = [
          sseToolCallDelta(0, "call_123", "echo", '{"message":"ignored"}'),
          sseFinishReason("tool_calls"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Echo",
        });

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            echo: {
              name: "echo",
              description: "Echoes",
              inputSchema: z.object({ message: z.string() }),
              execute: executeSpy,
            },
          },
          toolCallingMode: "text", // Should ignore native tool_call_deltas
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Echo", context });
        await collectEvents(streamResult.eventStream);
        const finalResult = await streamResult.result;

        // Tool should NOT have been executed
        expect(executeSpy).not.toHaveBeenCalled();
        expect(finalResult.steps).toHaveLength(1);
        expect(finalResult.steps[0]!.toolResults).toBeUndefined();
      });

      it("ignores all tool events when mode is 'off'", async () => {
        // Both native and text-based tool calls
        const events = [
          sseToolCallDelta(0, "call_123", "echo", '{"message":"native"}'),
          sseContentDelta('```json\n{"type": "tool_calls", "calls": [{"name": "echo", "args": {"message": "text"}}]}\n```'),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Echo",
        });

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            echo: {
              name: "echo",
              description: "Echoes",
              inputSchema: z.object({ message: z.string() }),
              execute: executeSpy,
            },
          },
          toolCallingMode: "off",
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Echo", context });
        await collectEvents(streamResult.eventStream);
        const finalResult = await streamResult.result;

        // Tool should NOT have been executed
        expect(executeSpy).not.toHaveBeenCalled();
        expect(finalResult.steps).toHaveLength(1);
        expect(finalResult.steps[0]!.toolResults).toBeUndefined();
      });
    });

    describe("result promise", () => {
      it("resolves with final result", async () => {
        const events = [
          sseContentDelta("Final answer"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });

        // Consume stream
        await collectEvents(streamResult.eventStream);

        // Result should be available
        const result = await streamResult.result;
        expect(result.text).toBe("Final answer");
        expect(result.steps).toHaveLength(1);
      });

      it("result matches done event result", async () => {
        const events = [
          sseContentDelta("Answer"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const doneEvent = allEvents.find((e) => e.type === "done");
        const result = await streamResult.result;

        if (doneEvent?.type === "done") {
          expect(result.text).toBe(doneEvent.result.text);
          expect(result.steps.length).toBe(doneEvent.result.steps.length);
        }
      });
    });

    describe("error handling", () => {
      it("emits error event on API failure", async () => {
        mockFetch.queueErrorResponse(500, "Internal Server Error");

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const errorEvents = allEvents.filter((e) => e.type === "error");
        expect(errorEvents.length).toBeGreaterThanOrEqual(1);

        if (errorEvents[0]?.type === "error") {
          expect(errorEvents[0].error).toContain("500");
        }

        // Result promise should reject
        await expect(streamResult.result).rejects.toThrow();
      });

      it("emits error event when aborted", async () => {
        const controller = new AbortController();

        // Create a stream that will take a while
        const events = [
          sseContentDelta("Starting..."),
          // More events would come, but we'll abort
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        // Abort immediately
        controller.abort();

        const context = createAgentContext({
          userId: "user_123",
          abortSignal: controller.signal,
        });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const errorEvents = allEvents.filter((e) => e.type === "error");
        expect(errorEvents.length).toBeGreaterThanOrEqual(1);

        if (errorEvents[0]?.type === "error") {
          expect(errorEvents[0].error).toContain("abort");
        }
      });
    });

    describe("multi-step execution", () => {
      it("processes multiple steps with tools", async () => {
        // First step: tool call
        const step1Events = [
          sseContentDelta('```json\n{"type": "tool_calls", "calls": [{"name": "echo", "args": {"message": "step1"}}]}\n```'),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step1Events));

        // Second step: final response
        const step2Events = [
          sseContentDelta("All done!"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(step2Events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
          toolCallingMode: "text", // Use text mode for JSON code block parsing
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Echo", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const stepCompletes = allEvents.filter((e) => e.type === "step-complete");
        expect(stepCompletes).toHaveLength(2);

        const result = await streamResult.result;
        expect(result.steps).toHaveLength(2);
        expect(result.toolCallSummaries.length).toBeGreaterThanOrEqual(1);
      });

      it("stops at max steps", async () => {
        // Queue multiple steps with tool calls
        for (let i = 0; i < 5; i++) {
          const stepEvents = [
            sseContentDelta(`\`\`\`json\n{"type": "tool_calls", "calls": [{"name": "echo", "args": {"message": "loop${i}"}}]}\n\`\`\``),
            sseFinishReason("stop"),
            sseDone(),
          ];
          mockFetch.queueStreamResponse(createSSEStream(stepEvents));
        }

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
          toolCallingMode: "text", // Use text mode for JSON code block parsing
          stopWhen: stepCountIs(3),
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Loop", context });

        await collectEvents(streamResult.eventStream);
        const result = await streamResult.result;

        expect(result.steps).toHaveLength(3);
      });
    });

    describe("event order", () => {
      it("events are in logical order", async () => {
        const events = [
          sseReasoningDelta("Thinking..."),
          sseContentDelta("Answer"),
          sseFinishReason("stop"),
          sseDone(),
        ];
        mockFetch.queueStreamResponse(createSSEStream(events));

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const streamResult = agent.stream({ prompt: "Hi", context });
        const allEvents = await collectEvents(streamResult.eventStream);

        const types = allEvents.map((e) => e.type);

        // step-complete should come before done
        const stepCompleteIdx = types.indexOf("step-complete");
        const doneIdx = types.indexOf("done");
        expect(stepCompleteIdx).toBeLessThan(doneIdx);

        // done should be last
        expect(types[types.length - 1]).toBe("done");
      });
    });
  });
});
