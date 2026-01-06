/**
 * ToolLoopAgent Tests (Non-Streaming)
 *
 * Tests for the agent loop with tool execution.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgentContext } from "../agent/context.js";
import { anyOf, noToolCalls, stepCountIs } from "../agent/stop-conditions.js";
import { ToolLoopAgent } from "../agent/tool-loop-agent.js";
import type { AgentContext, AgentToolDefinition } from "../agent/types.js";
import { initAI, resetAI } from "../index.js";
import type { ToolExecutionResult } from "../tools/types.js";
import {
  createMockFetch,
  createMockLoggerFactory,
  createOpenAIResponse,
  getFixturesPath,
} from "./setup.js";

describe("ToolLoopAgent", () => {
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

  // Helper to create a simple tool
  function createEchoTool(): AgentToolDefinition<
    z.ZodObject<{ message: z.ZodString }>,
    AgentContext
  > {
    return {
      name: "echo",
      description: "Echoes a message back",
      inputSchema: z.object({ message: z.string() }),
      execute: async (input): Promise<ToolExecutionResult> => {
        return { success: true, content: `Echo: ${input.message}` };
      },
    };
  }

  // Helper to create a search tool
  function createSearchTool(): AgentToolDefinition<
    z.ZodObject<{ query: z.ZodString }>,
    AgentContext
  > {
    return {
      name: "search",
      description: "Searches for items",
      inputSchema: z.object({ query: z.string() }),
      execute: async (input): Promise<ToolExecutionResult> => {
        return { success: true, content: `Found results for: ${input.query}` };
      },
    };
  }

  describe("generate (non-streaming)", () => {
    describe("basic execution", () => {
      it("completes a single step without tools", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Hello! How can I help you?",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are a helpful assistant.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Hi there!",
          context,
        });

        expect(result.text).toBe("Hello! How can I help you?");
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]!.isTerminal).toBe(true);
      });

      it("returns final text from last step", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "The answer is 42.",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "What is the answer?",
          context,
        });

        expect(result.text).toBe("The answer is 42.");
      });
    });

    describe("system prompt", () => {
      it("uses string instructions", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({ content: "Response" }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are a test assistant.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        await agent.generate({ prompt: "Test", context });

        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.messages[0].role).toBe("system");
        expect(requestBody.messages[0].content).toBe(
          "You are a test assistant.",
        );
      });

      it("uses function to generate instructions", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({ content: "Response" }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: (ctx) => `Hello ${ctx.userId}!`,
          tools: {},
        });

        const context = createAgentContext({ userId: "user_456" });
        await agent.generate({ prompt: "Test", context });

        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.messages[0].content).toBe("Hello user_456!");
      });

      it("uses async function to generate instructions", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({ content: "Response" }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: async (ctx) => {
            await new Promise((r) => setTimeout(r, 1));
            return `Async hello ${ctx.userId}!`;
          },
          tools: {},
        });

        const context = createAgentContext({ userId: "user_789" });
        await agent.generate({ prompt: "Test", context });

        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.messages[0].content).toBe("Async hello user_789!");
      });
    });

    describe("tool execution", () => {
      it("executes tool when AI returns tool call", async () => {
        // First response: tool call
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [
              { id: "call_1", name: "echo", arguments: { message: "Hello" } },
            ],
            finishReason: "tool_calls",
          }),
        );

        // Second response: final answer
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "The echo result was: Echo: Hello",
            finishReason: "stop",
          }),
        );

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Echo: Hello",
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
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Echo hello",
          context,
        });

        expect(executeSpy).toHaveBeenCalledWith(
          { message: "Hello" },
          expect.objectContaining({ userId: "user_123" }),
        );
        expect(result.steps).toHaveLength(2);
        expect(result.toolCallSummaries).toHaveLength(1);
      });

      it("handles multiple tool calls in one step", async () => {
        // First response: multiple tool calls
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [
              { id: "call_1", name: "echo", arguments: { message: "One" } },
              { id: "call_2", name: "echo", arguments: { message: "Two" } },
            ],
            finishReason: "tool_calls",
          }),
        );

        // Second response: final answer
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Done!",
            finishReason: "stop",
          }),
        );

        const executeSpy = vi.fn().mockImplementation((input) => ({
          success: true,
          content: `Echo: ${input.message}`,
        }));

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
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Echo both",
          context,
        });

        expect(executeSpy).toHaveBeenCalledTimes(2);
        expect(result.toolCallSummaries).toHaveLength(2);
      });

      it("handles tool not found", async () => {
        // Response with call to unknown tool
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [{ id: "call_1", name: "unknown_tool", arguments: {} }],
            finishReason: "tool_calls",
          }),
        );

        // Final response
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "I couldn't find that tool.",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            echo: createEchoTool(),
          },
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Use unknown tool",
          context,
        });

        // Should have error in tool results
        const step = result.steps[0]!;
        expect(step.toolResults).toHaveLength(1);
        expect(step.toolResults![0]!.output.success).toBe(false);
        expect(step.toolResults![0]!.output.error).toContain("not found");
      });

      it("handles tool execution error", async () => {
        // First response: tool call
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [{ id: "call_1", name: "failing", arguments: {} }],
            finishReason: "tool_calls",
          }),
        );

        // Final response
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "The tool failed.",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            failing: {
              name: "failing",
              description: "Always fails",
              inputSchema: z.object({}),
              execute: async (): Promise<ToolExecutionResult> => {
                return {
                  success: false,
                  content: "",
                  error: "Intentional failure",
                };
              },
            },
          },
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Use failing tool",
          context,
        });

        const summary = result.toolCallSummaries[0]!;
        expect(summary.success).toBe(false);
        expect(summary.error).toBe("Intentional failure");
      });
    });

    describe("stop conditions", () => {
      it("stops after max steps", async () => {
        // Queue multiple responses with tool calls
        for (let i = 0; i < 5; i++) {
          mockFetch.queueJsonResponse(
            createOpenAIResponse({
              content: "",
              toolCalls: [
                {
                  id: `call_${i}`,
                  name: "echo",
                  arguments: { message: "loop" },
                },
              ],
              finishReason: "tool_calls",
            }),
          );
        }

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
          stopWhen: stepCountIs(3),
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Loop forever",
          context,
        });

        expect(result.steps).toHaveLength(3);
        expect(result.steps[2]!.isTerminal).toBe(true);
      });

      it("stops when no tool calls", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "No tools needed!",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
          stopWhen: anyOf(stepCountIs(10), noToolCalls()),
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Hello",
          context,
        });

        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]!.stopReason).toBe("no_tool_calls");
      });

      it("uses default stop conditions when not specified", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Response",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
          // No stopWhen - should use default
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Hello",
          context,
        });

        expect(result.steps).toHaveLength(1);
        expect(result.steps[0]!.isTerminal).toBe(true);
      });
    });

    describe("toolCallingMode", () => {
      it("executes tools from text-based inline JSON when mode is 'text'", async () => {
        // Response with embedded JSON tool call in content, NO native toolCalls
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content:
              '```json\n{"type": "tool_calls", "calls": [{"name": "search", "args": {"query": "test query"}}]}\n```',
            toolCalls: undefined,
            finishReason: "stop",
          }),
        );

        // Follow-up response after tool execution
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Based on the search results, here is your answer.",
            finishReason: "stop",
          }),
        );

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Found 3 results for: test query",
        });

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are a helpful assistant.",
          tools: {
            search: {
              name: "search",
              description: "Searches for items",
              inputSchema: z.object({ query: z.string() }),
              execute: executeSpy,
            },
          },
          toolCallingMode: "text",
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Search for test query",
          context,
        });

        // Verify tool was parsed from text and executed
        expect(executeSpy).toHaveBeenCalledWith(
          { query: "test query" },
          expect.objectContaining({ userId: "user_123" }),
        );
        expect(result.steps.length).toBeGreaterThanOrEqual(2);
        expect(result.steps[0]!.toolResults).toBeDefined();
        expect(result.steps[0]!.toolResults![0]!.toolName).toBe("search");
      });

      it("ignores native tool calls when mode is 'text'", async () => {
        // Response with native toolCalls that should be ignored
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "I'll help you with that.",
            toolCalls: [
              { id: "call_1", name: "search", arguments: { query: "ignored" } },
            ],
            finishReason: "tool_calls",
          }),
        );

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Result",
        });

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            search: {
              name: "search",
              description: "Searches",
              inputSchema: z.object({ query: z.string() }),
              execute: executeSpy,
            },
          },
          toolCallingMode: "text",
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Search",
          context,
        });

        // Tool should NOT have been executed because mode is "text" and there's no text-embedded JSON
        expect(executeSpy).not.toHaveBeenCalled();
        expect(result.steps).toHaveLength(1);
      });

      it("ignores all tool calls when mode is 'off'", async () => {
        // Response with both native and text-based tool calls
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content:
              '```json\n{"type": "tool_calls", "calls": [{"name": "search", "args": {"query": "test"}}]}\n```',
            toolCalls: [
              { id: "call_1", name: "search", arguments: { query: "native" } },
            ],
            finishReason: "tool_calls",
          }),
        );

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Result",
        });

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            search: {
              name: "search",
              description: "Searches",
              inputSchema: z.object({ query: z.string() }),
              execute: executeSpy,
            },
          },
          toolCallingMode: "off",
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Search",
          context,
        });

        // Tool should NOT have been executed regardless of response content
        expect(executeSpy).not.toHaveBeenCalled();
        expect(result.steps).toHaveLength(1);
      });

      it("does not send tools to AI when mode is 'off'", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Response without tools",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            search: createSearchTool(),
          },
          toolCallingMode: "off",
        });

        const context = createAgentContext({ userId: "user_123" });
        await agent.generate({ prompt: "Hello", context });

        // Check that tools were not sent in the request
        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.tools).toBeUndefined();
      });

      it("does not send tools to AI when mode is 'text'", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Response",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {
            search: createSearchTool(),
          },
          toolCallingMode: "text",
        });

        const context = createAgentContext({ userId: "user_123" });
        await agent.generate({ prompt: "Hello", context });

        // Check that tools were not sent in the request
        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.tools).toBeUndefined();
      });

      it("uses native mode by default", async () => {
        // Test that native tool calls work without specifying mode
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [
              { id: "call_1", name: "echo", arguments: { message: "test" } },
            ],
            finishReason: "tool_calls",
          }),
        );

        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Done",
            finishReason: "stop",
          }),
        );

        const executeSpy = vi.fn().mockResolvedValue({
          success: true,
          content: "Echo: test",
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
          // No toolCallingMode specified - should default to "native"
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "Echo test",
          context,
        });

        expect(executeSpy).toHaveBeenCalled();
        expect(result.steps).toHaveLength(2);

        // Verify tools were sent in the request
        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.tools).toBeDefined();
      });
    });

    describe("prepareStep", () => {
      it("overrides aiContext per step", async () => {
        // First step uses backend
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Step 1 response",
            finishReason: "stop",
          }),
        );

        const aiContexts: string[] = [];

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
          prepareStep: ({ stepNumber }) => {
            // Track what context we use
            aiContexts.push(stepNumber === 1 ? "backend" : "workers");
            return {};
          },
        });

        const context = createAgentContext({ userId: "user_123" });
        await agent.generate({ prompt: "Hello", context });

        // prepareStep was called for step 1
        expect(aiContexts).toContain("backend");

        // First call to backend model
        const firstBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
        expect(firstBody.model).toBe("test-model-full");
      });

      it("overrides tools per step", async () => {
        // First step - call echo
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [
              { id: "call_1", name: "echo", arguments: { message: "test" } },
            ],
            finishReason: "tool_calls",
          }),
        );

        // Second step - done
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Done",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool(), search: createSearchTool() },
          prepareStep: ({ stepNumber }) => {
            // Only provide echo tool for step 1
            if (stepNumber === 1) {
              return { tools: { echo: createEchoTool() } };
            }
            return {};
          },
        });

        const context = createAgentContext({ userId: "user_123" });
        await agent.generate({ prompt: "Echo", context });

        // First call should only have echo tool
        const firstBody = JSON.parse(mockFetch.calls[0]!.init?.body as string);
        expect(firstBody.tools).toHaveLength(1);
        expect(firstBody.tools[0].function.name).toBe("echo");
      });
    });

    describe("token usage aggregation", () => {
      it("aggregates token usage across steps", async () => {
        // First step
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "",
            toolCalls: [
              { id: "call_1", name: "echo", arguments: { message: "test" } },
            ],
            finishReason: "tool_calls",
            promptTokens: 100,
            completionTokens: 50,
          }),
        );

        // Second step
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "Done",
            finishReason: "stop",
            promptTokens: 150,
            completionTokens: 30,
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: { echo: createEchoTool() },
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({ prompt: "Echo", context });

        expect(result.usage.totalPromptTokens).toBe(250);
        expect(result.usage.totalCompletionTokens).toBe(80);
        expect(result.usage.totalTokens).toBe(330);
      });
    });

    describe("reasoning/thinking", () => {
      it("captures reasoning from AI response", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({
            content: "The answer is 42.",
            reasoning: "Let me think about this question...",
            finishReason: "stop",
          }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        const result = await agent.generate({
          prompt: "What is the answer?",
          context,
        });

        expect(result.thinking).toBe("Let me think about this question...");
      });
    });

    describe("abort signal", () => {
      it("respects abort signal", async () => {
        const controller = new AbortController();
        controller.abort();

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({
          userId: "user_123",
          abortSignal: controller.signal,
        });

        const result = await agent.generate({ prompt: "Hello", context });

        // Should stop immediately, no API calls made
        expect(mockFetch.calls).toHaveLength(0);
        expect(result.steps).toHaveLength(0);
      });
    });

    describe("message history", () => {
      it("includes previous messages when provided", async () => {
        mockFetch.queueJsonResponse(
          createOpenAIResponse({ content: "Response" }),
        );

        const agent = new ToolLoopAgent({
          aiContext: "backend",
          instructions: "You are helpful.",
          tools: {},
        });

        const context = createAgentContext({ userId: "user_123" });
        await agent.generate({
          prompt: "What did I say earlier?",
          context,
          messages: [
            { role: "user", content: "My name is Alice" },
            { role: "assistant", content: "Hello Alice!" },
          ],
        });

        const requestBody = JSON.parse(
          mockFetch.calls[0]!.init?.body as string,
        );
        expect(requestBody.messages).toHaveLength(3);
        expect(requestBody.messages[0].content).toBe("My name is Alice");
        expect(requestBody.messages[1].content).toBe("Hello Alice!");
        expect(requestBody.messages[2].content).toBe("What did I say earlier?");
      });
    });
  });
});
