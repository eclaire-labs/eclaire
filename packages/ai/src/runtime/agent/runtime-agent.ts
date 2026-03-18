/**
 * RuntimeAgent
 *
 * New agent loop using RuntimeMessage internally and transforming
 * to AIMessage at the adapter boundary via convertToLlm().
 *
 * Key differences from ToolLoopAgent:
 * - Uses RuntimeToolDefinition (with prompt contributions, rich results, progress)
 * - Uses RuntimeMessage (structured content blocks) internally
 * - Transforms to AIMessage only when calling the LLM
 * - Emits RuntimeStreamEvent with tool progress updates
 * - Resolves tools from the tool map directly (no separate execution map bug)
 */

import type { z } from "zod";
import { callAI, callAIStream } from "../../client.js";
import { createLazyLogger, getErrorMessage } from "../../logger.js";
import { LLMStreamParser } from "../../stream-parser.js";
import {
  extractFinalResponse,
  extractToolCalls,
  parseTextToolContent,
} from "../../text-parser.js";
import { createToolCallSummary } from "../../tools/native.js";
import type { ToolCallSummaryOutput } from "../../tools/types.js";
import type {
  ToolCallResult,
  ToolCallingMode,
  ToolDefinition,
  TokenUsage,
} from "../../types.js";
import type {
  AssistantMessage,
  RuntimeMessage,
  RuntimeStreamEvent,
  ToolResultMessage,
} from "../messages.js";
import {
  getTextContent,
  getThinkingContent,
  getToolCalls,
} from "../messages.js";
import type {
  OnApprovalRequired,
  RuntimeToolDefinition,
  RuntimeToolResult,
} from "../tools/types.js";
import { convertToLlm } from "./convert-to-llm.js";
import {
  runtimeToolToOpenAI,
  executeRuntimeTool,
} from "./runtime-tool-helpers.js";
import type {
  RuntimeAgentConfig,
  RuntimeAgentContext,
  RuntimeAgentResult,
  RuntimeAgentStep,
  RuntimeGenerateOptions,
  RuntimeStepToolExecution,
  RuntimeStreamResult,
} from "./types.js";

// biome-ignore lint/suspicious/noExplicitAny: intentional — Zod requires any for generic schema type alias
type AnyZodType = z.ZodType<any, any, any>;

const getLogger = createLazyLogger("runtime-agent");

// =============================================================================
// RUNTIME AGENT
// =============================================================================

export class RuntimeAgent {
  private readonly config: RuntimeAgentConfig;
  private readonly maxSteps: number;

  constructor(config: RuntimeAgentConfig) {
    this.config = config;
    this.maxSteps = config.maxSteps ?? 10;
  }

  // ===========================================================================
  // NON-STREAMING
  // ===========================================================================

  async generate(options: RuntimeGenerateOptions): Promise<RuntimeAgentResult> {
    const logger = getLogger();
    const { context, aiOptions } = options;

    logger.info(
      { requestId: context.requestId, userId: context.userId },
      "Starting runtime agent execution",
    );

    const loopState = await this._initLoop(options);
    const {
      systemPrompt,
      runtimeMessages,
      tools,
      toolCallingMode,
      openAITools,
    } = loopState;

    const steps: RuntimeAgentStep[] = [];
    const toolCallSummaries: ToolCallSummaryOutput[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;

    let stepNumber = 0;
    while (true) {
      stepNumber++;

      if (context.abortSignal?.aborted) {
        logger.info(
          { requestId: context.requestId },
          "Agent execution aborted",
        );
        break;
      }

      if (stepNumber > this.maxSteps) {
        const step = this._makeTerminalStep(
          stepNumber,
          runtimeMessages,
          "max_steps",
        );
        steps.push(step);
        break;
      }

      // Convert to LLM format at the boundary
      const llmMessages = convertToLlm(systemPrompt, runtimeMessages);

      // Call AI
      const aiResponse = await callAI(llmMessages, this.config.aiContext, {
        ...this.config.aiOptions,
        ...aiOptions,
        modelOverride: this.config.modelOverride,
        tools: toolCallingMode !== "off" ? openAITools : undefined,
        toolChoice: openAITools && openAITools.length > 0 ? "auto" : undefined,
        debugContext: {
          requestId: context.requestId,
          userId: context.userId,
          stepNumber,
        },
      });

      // Track tokens
      if (aiResponse.usage) {
        totalPromptTokens += aiResponse.usage.prompt_tokens ?? 0;
        totalCompletionTokens += aiResponse.usage.completion_tokens ?? 0;
      }

      // Parse response into RuntimeMessage
      const assistantMsg = this._parseAssistantResponse(
        aiResponse,
        toolCallingMode,
        stepNumber,
      );
      runtimeMessages.push(assistantMsg);

      const toolCalls = getToolCalls(assistantMsg);

      // Create step record
      const step: RuntimeAgentStep = {
        stepNumber,
        timestamp: new Date().toISOString(),
        assistantMessage: assistantMsg,
        isTerminal: false,
      };

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        const execMethod =
          this.config.toolExecution === "parallel"
            ? this._executeToolsParallel
            : this._executeTools;
        step.toolExecutions = await execMethod.call(
          this,
          toolCalls,
          tools,
          context,
          runtimeMessages,
          toolCallSummaries,
        );
      }

      // Check stop
      if (toolCalls.length === 0) {
        step.isTerminal = true;
        step.stopReason = "no_tool_calls";
      }

      steps.push(step);
      if (step.isTerminal) break;
    }

    const result = this._buildResult(
      steps,
      runtimeMessages,
      totalPromptTokens,
      totalCompletionTokens,
      toolCallSummaries,
    );

    logger.info(
      {
        requestId: context.requestId,
        totalSteps: steps.length,
        totalToolCalls: toolCallSummaries.length,
        totalTokens: result.usage.totalTokens,
      },
      "Runtime agent execution completed",
    );

    return result;
  }

  // ===========================================================================
  // STREAMING
  // ===========================================================================

  stream(options: RuntimeGenerateOptions): RuntimeStreamResult {
    const logger = getLogger();
    const { context, aiOptions } = options;

    let resolveResult: (result: RuntimeAgentResult) => void;
    let rejectResult: (error: Error) => void;
    const resultPromise = new Promise<RuntimeAgentResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    const eventStream = new ReadableStream<RuntimeStreamEvent>({
      start: async (controller) => {
        try {
          logger.info(
            { requestId: context.requestId, userId: context.userId },
            "Starting streaming runtime agent execution",
          );

          const loopState = await this._initLoop(options);
          const {
            systemPrompt,
            runtimeMessages,
            tools,
            toolCallingMode,
            openAITools,
          } = loopState;

          const steps: RuntimeAgentStep[] = [];
          const toolCallSummaries: ToolCallSummaryOutput[] = [];
          let totalPromptTokens = 0;
          let totalCompletionTokens = 0;

          let stepNumber = 0;
          while (true) {
            stepNumber++;

            if (context.abortSignal?.aborted) {
              controller.enqueue({
                type: "error",
                error: "Agent execution aborted",
              });
              break;
            }

            if (stepNumber > this.maxSteps) {
              const step = this._makeTerminalStep(
                stepNumber,
                runtimeMessages,
                "max_steps",
              );
              steps.push(step);
              break;
            }

            // Convert at boundary
            const llmMessages = convertToLlm(systemPrompt, runtimeMessages);

            // Stream AI call
            const { stream } = await callAIStream(
              llmMessages,
              this.config.aiContext,
              {
                ...this.config.aiOptions,
                ...aiOptions,
                modelOverride: this.config.modelOverride,
                tools: toolCallingMode !== "off" ? openAITools : undefined,
                toolChoice:
                  openAITools && openAITools.length > 0 ? "auto" : undefined,
                debugContext: {
                  requestId: context.requestId,
                  userId: context.userId,
                  stepNumber,
                },
              },
            );

            // Process stream, emitting events
            const streamResult = await this._processStream(
              stream,
              toolCallingMode,
              stepNumber,
              controller,
            );

            totalPromptTokens += streamResult.promptTokens;
            totalCompletionTokens += streamResult.completionTokens;

            // Build assistant message from stream result
            const assistantMsg = streamResult.assistantMessage;
            runtimeMessages.push(assistantMsg);

            controller.enqueue({
              type: "message_complete",
              message: assistantMsg,
            });

            const toolCalls = getToolCalls(assistantMsg);

            const step: RuntimeAgentStep = {
              stepNumber,
              timestamp: new Date().toISOString(),
              assistantMessage: assistantMsg,
              isTerminal: false,
            };

            // Execute tool calls
            if (toolCalls.length > 0) {
              const execMethod =
                this.config.toolExecution === "parallel"
                  ? this._executeToolsStreamingParallel
                  : this._executeToolsStreaming;
              step.toolExecutions = await execMethod.call(
                this,
                toolCalls,
                tools,
                context,
                runtimeMessages,
                toolCallSummaries,
                controller,
              );
            }

            if (toolCalls.length === 0) {
              step.isTerminal = true;
              step.stopReason = "no_tool_calls";
            }

            steps.push(step);
            if (step.isTerminal) break;
          }

          const result = this._buildResult(
            steps,
            runtimeMessages,
            totalPromptTokens,
            totalCompletionTokens,
            toolCallSummaries,
          );

          controller.enqueue({
            type: "turn_complete",
            messages: runtimeMessages,
          });

          controller.close();
          resolveResult(result);

          logger.info(
            {
              requestId: context.requestId,
              totalSteps: steps.length,
              totalToolCalls: toolCallSummaries.length,
            },
            "Streaming runtime agent execution completed",
          );
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          controller.enqueue({ type: "error", error: errorMessage });
          controller.close();
          rejectResult(
            error instanceof Error ? error : new Error(errorMessage),
          );

          logger.error(
            { requestId: context.requestId, error: errorMessage },
            "Streaming runtime agent execution failed",
          );
        }
      },
    });

    return { eventStream, result: resultPromise };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async _initLoop(options: RuntimeGenerateOptions) {
    const { prompt, context, messages: previousMessages } = options;

    // Build system prompt
    const systemPrompt =
      typeof this.config.instructions === "function"
        ? await this.config.instructions(context)
        : this.config.instructions;

    // Initialize runtime messages
    const runtimeMessages: RuntimeMessage[] = previousMessages
      ? [...previousMessages]
      : [];

    // Add user message
    runtimeMessages.push({
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    });

    // Build tool configs
    const tools = this.config.tools;
    const toolCallingMode: ToolCallingMode =
      this.config.toolCallingMode ?? "native";
    const toolEntries = Object.values(tools);

    const openAITools: ToolDefinition[] | undefined =
      toolEntries.length > 0 && toolCallingMode === "native"
        ? toolEntries.map(runtimeToolToOpenAI)
        : undefined;

    return {
      systemPrompt,
      runtimeMessages,
      tools,
      toolCallingMode,
      openAITools,
    };
  }

  /**
   * Parse an AI response (non-streaming) into an AssistantMessage.
   */
  private _parseAssistantResponse(
    aiResponse: {
      content: string;
      reasoning?: string;
      toolCalls?: ToolCallResult[];
      usage?: TokenUsage;
      finishReason?: string;
    },
    toolCallingMode: ToolCallingMode,
    stepNumber: number,
  ): AssistantMessage {
    const contentBlocks: AssistantMessage["content"] = [];

    // Thinking
    if (aiResponse.reasoning) {
      contentBlocks.push({ type: "thinking", text: aiResponse.reasoning });
    }

    // For text mode, extract tool calls from content
    if (toolCallingMode === "text") {
      const parseResult = parseTextToolContent(
        aiResponse.content,
        aiResponse.reasoning,
      );
      const finalText = extractFinalResponse(parseResult) || aiResponse.content;
      if (finalText) {
        contentBlocks.push({ type: "text", text: finalText });
      }
      const extracted = extractToolCalls(parseResult);
      for (let i = 0; i < extracted.length; i++) {
        const tc = extracted[i];
        if (!tc) continue;
        contentBlocks.push({
          type: "tool_call",
          id: `call_${stepNumber}_${i}`,
          name: tc.functionName,
          arguments: tc.arguments,
        });
      }
    } else {
      // Native or off mode — text content
      if (aiResponse.content) {
        contentBlocks.push({ type: "text", text: aiResponse.content });
      }

      // Native tool calls
      if (toolCallingMode === "native" && aiResponse.toolCalls) {
        for (const tc of aiResponse.toolCalls) {
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(tc.function.arguments);
          } catch {
            args = {};
          }
          contentBlocks.push({
            type: "tool_call",
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          });
        }
      }
    }

    return {
      role: "assistant",
      content: contentBlocks,
      usage: aiResponse.usage,
    };
  }

  /**
   * Create an approval callback that wraps the config callback with stream
   * event emission. For non-streaming paths, pass no controller.
   */
  private _createApprovalCallback(
    controller?: ReadableStreamDefaultController<RuntimeStreamEvent>,
  ): OnApprovalRequired | undefined {
    const configCallback = this.config.onApprovalRequired;
    if (!configCallback) return undefined;
    return async (request) => {
      controller?.enqueue({
        type: "tool_approval_required",
        id: request.toolCallId,
        name: request.toolName,
        label: request.toolLabel,
        arguments: request.arguments,
      });
      const response = await configCallback(request);
      controller?.enqueue({
        type: "tool_approval_resolved",
        id: request.toolCallId,
        name: request.toolName,
        approved: response.approved,
        reason: response.reason,
      });
      return response;
    };
  }

  /**
   * Execute tools (non-streaming path).
   */
  private async _executeTools(
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
    tools: Record<string, RuntimeToolDefinition<AnyZodType>>,
    context: RuntimeAgentContext,
    runtimeMessages: RuntimeMessage[],
    toolCallSummaries: ToolCallSummaryOutput[],
  ): Promise<RuntimeStepToolExecution[]> {
    const logger = getLogger();
    const executions: RuntimeStepToolExecution[] = [];

    for (const tc of toolCalls) {
      const toolDef = tools[tc.name];
      const startTime = Date.now();

      if (!toolDef) {
        logger.warn(
          { requestId: context.requestId, toolName: tc.name },
          "Tool not found",
        );
        const errorResult: RuntimeToolResult = {
          content: [{ type: "text", text: `Tool '${tc.name}' not found` }],
          isError: true,
        };
        this._addToolResult(runtimeMessages, tc, errorResult);
        executions.push({
          toolName: tc.name,
          toolCallId: tc.id,
          input: tc.arguments,
          result: errorResult,
          durationMs: 0,
        });
        continue;
      }

      const result = await executeRuntimeTool(
        toolDef,
        tc.id,
        tc.arguments,
        context,
        undefined,
        this._createApprovalCallback(),
        this.config.approvalTimeoutMs,
      );
      const durationMs = Date.now() - startTime;

      logger.debug(
        {
          requestId: context.requestId,
          toolName: tc.name,
          durationMs,
          isError: result.isError,
        },
        "Tool executed",
      );

      this._addToolResult(runtimeMessages, tc, result);
      executions.push({
        toolName: tc.name,
        toolCallId: tc.id,
        input: tc.arguments,
        result,
        durationMs,
      });

      toolCallSummaries.push(
        createToolCallSummary({
          functionName: tc.name,
          arguments: tc.arguments,
          result: result.isError
            ? null
            : result.content
                .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
                .join("\n"),
          executionTimeMs: durationMs,
          success: !result.isError,
          error: result.isError
            ? result.content
                .map((c) => (c.type === "text" ? c.text : ""))
                .join("")
            : undefined,
        }),
      );
    }

    return executions;
  }

  /**
   * Execute tools with streaming events.
   */
  private async _executeToolsStreaming(
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
    tools: Record<string, RuntimeToolDefinition<AnyZodType>>,
    context: RuntimeAgentContext,
    runtimeMessages: RuntimeMessage[],
    toolCallSummaries: ToolCallSummaryOutput[],
    controller: ReadableStreamDefaultController<RuntimeStreamEvent>,
  ): Promise<RuntimeStepToolExecution[]> {
    const logger = getLogger();
    const executions: RuntimeStepToolExecution[] = [];

    for (const tc of toolCalls) {
      const toolDef = tools[tc.name];
      const startTime = Date.now();

      controller.enqueue({
        type: "tool_call_start",
        id: tc.id,
        name: tc.name,
      });

      if (!toolDef) {
        logger.warn(
          { requestId: context.requestId, toolName: tc.name },
          "Tool not found",
        );
        const errorResult: RuntimeToolResult = {
          content: [{ type: "text", text: `Tool '${tc.name}' not found` }],
          isError: true,
        };
        this._addToolResult(runtimeMessages, tc, errorResult);
        executions.push({
          toolName: tc.name,
          toolCallId: tc.id,
          input: tc.arguments,
          result: errorResult,
          durationMs: 0,
        });
        controller.enqueue({
          type: "tool_result",
          id: tc.id,
          name: tc.name,
          result: errorResult,
          durationMs: 0,
        });
        continue;
      }

      // Execute with progress callback and approval support
      const result = await executeRuntimeTool(
        toolDef,
        tc.id,
        tc.arguments,
        context,
        (update) => {
          controller.enqueue({
            type: "tool_progress",
            id: tc.id,
            name: tc.name,
            progress: {
              status: update.status,
              progress: update.progress,
              preview: update.preview,
            },
          });
        },
        this._createApprovalCallback(controller),
        this.config.approvalTimeoutMs,
      );

      const durationMs = Date.now() - startTime;

      logger.debug(
        {
          requestId: context.requestId,
          toolName: tc.name,
          durationMs,
          isError: result.isError,
        },
        "Tool executed",
      );

      this._addToolResult(runtimeMessages, tc, result);
      executions.push({
        toolName: tc.name,
        toolCallId: tc.id,
        input: tc.arguments,
        result,
        durationMs,
      });

      controller.enqueue({
        type: "tool_result",
        id: tc.id,
        name: tc.name,
        result,
        durationMs,
      });

      toolCallSummaries.push(
        createToolCallSummary({
          functionName: tc.name,
          arguments: tc.arguments,
          result: result.isError
            ? null
            : result.content
                .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
                .join("\n"),
          executionTimeMs: durationMs,
          success: !result.isError,
          error: result.isError
            ? result.content
                .map((c) => (c.type === "text" ? c.text : ""))
                .join("")
            : undefined,
        }),
      );
    }

    return executions;
  }

  /**
   * Execute tools in parallel (non-streaming path).
   * All tools start concurrently, results are collected in source order.
   */
  private async _executeToolsParallel(
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
    tools: Record<string, RuntimeToolDefinition<AnyZodType>>,
    context: RuntimeAgentContext,
    runtimeMessages: RuntimeMessage[],
    toolCallSummaries: ToolCallSummaryOutput[],
  ): Promise<RuntimeStepToolExecution[]> {
    const logger = getLogger();

    // Phase 1: Start all tool executions — immediate errors get a resolved promise
    const slots = toolCalls.map((tc) => {
      const toolDef = tools[tc.name];
      if (!toolDef) {
        logger.warn(
          { requestId: context.requestId, toolName: tc.name },
          "Tool not found",
        );
        return {
          tc,
          startTime: Date.now(),
          promise: Promise.resolve<RuntimeToolResult>({
            content: [
              { type: "text" as const, text: `Tool '${tc.name}' not found` },
            ],
            isError: true,
          }),
        };
      }
      return {
        tc,
        startTime: Date.now(),
        promise: executeRuntimeTool(
          toolDef,
          tc.id,
          tc.arguments,
          context,
          undefined,
          this._createApprovalCallback(),
          this.config.approvalTimeoutMs,
        ),
      };
    });

    // Phase 2: Await in source order, collecting results
    const executions: RuntimeStepToolExecution[] = [];
    for (const slot of slots) {
      const result = await slot.promise;
      const durationMs = Date.now() - slot.startTime;

      logger.debug(
        {
          requestId: context.requestId,
          toolName: slot.tc.name,
          durationMs,
          isError: result.isError,
        },
        "Tool executed",
      );

      this._addToolResult(runtimeMessages, slot.tc, result);
      executions.push({
        toolName: slot.tc.name,
        toolCallId: slot.tc.id,
        input: slot.tc.arguments,
        result,
        durationMs,
      });

      toolCallSummaries.push(
        createToolCallSummary({
          functionName: slot.tc.name,
          arguments: slot.tc.arguments,
          result: result.isError
            ? null
            : result.content
                .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
                .join("\n"),
          executionTimeMs: durationMs,
          success: !result.isError,
          error: result.isError
            ? result.content
                .map((c) => (c.type === "text" ? c.text : ""))
                .join("")
            : undefined,
        }),
      );
    }

    return executions;
  }

  /**
   * Execute tools in parallel with streaming events.
   * Emits all tool_call_start events immediately, then starts all executions
   * concurrently. Results are emitted in source order.
   */
  private async _executeToolsStreamingParallel(
    toolCalls: Array<{
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }>,
    tools: Record<string, RuntimeToolDefinition<AnyZodType>>,
    context: RuntimeAgentContext,
    runtimeMessages: RuntimeMessage[],
    toolCallSummaries: ToolCallSummaryOutput[],
    controller: ReadableStreamDefaultController<RuntimeStreamEvent>,
  ): Promise<RuntimeStepToolExecution[]> {
    const logger = getLogger();

    // Emit all tool_call_start events immediately so UI shows all tools starting
    for (const tc of toolCalls) {
      controller.enqueue({
        type: "tool_call_start",
        id: tc.id,
        name: tc.name,
      });
    }

    // Phase 1: Start all tool executions — immediate errors get a resolved promise
    const slots = toolCalls.map((tc) => {
      const toolDef = tools[tc.name];
      if (!toolDef) {
        logger.warn(
          { requestId: context.requestId, toolName: tc.name },
          "Tool not found",
        );
        const errorResult: RuntimeToolResult = {
          content: [{ type: "text", text: `Tool '${tc.name}' not found` }],
          isError: true,
        };
        controller.enqueue({
          type: "tool_result",
          id: tc.id,
          name: tc.name,
          result: errorResult,
          durationMs: 0,
        });
        return {
          tc,
          startTime: Date.now(),
          immediate: true as const,
          promise: Promise.resolve(errorResult),
        };
      }
      return {
        tc,
        startTime: Date.now(),
        immediate: false as const,
        promise: executeRuntimeTool(
          toolDef,
          tc.id,
          tc.arguments,
          context,
          (update) => {
            controller.enqueue({
              type: "tool_progress",
              id: tc.id,
              name: tc.name,
              progress: {
                status: update.status,
                progress: update.progress,
                preview: update.preview,
              },
            });
          },
          this._createApprovalCallback(controller),
          this.config.approvalTimeoutMs,
        ),
      };
    });

    // Phase 2: Await in source order, emitting results
    const executions: RuntimeStepToolExecution[] = [];
    for (const slot of slots) {
      const result = await slot.promise;
      const durationMs = Date.now() - slot.startTime;

      logger.debug(
        {
          requestId: context.requestId,
          toolName: slot.tc.name,
          durationMs,
          isError: result.isError,
        },
        "Tool executed",
      );

      this._addToolResult(runtimeMessages, slot.tc, result);
      executions.push({
        toolName: slot.tc.name,
        toolCallId: slot.tc.id,
        input: slot.tc.arguments,
        result,
        durationMs,
      });

      // Immediate errors already emitted tool_result in Phase 1
      if (!slot.immediate) {
        controller.enqueue({
          type: "tool_result",
          id: slot.tc.id,
          name: slot.tc.name,
          result,
          durationMs,
        });
      }

      toolCallSummaries.push(
        createToolCallSummary({
          functionName: slot.tc.name,
          arguments: slot.tc.arguments,
          result: result.isError
            ? null
            : result.content
                .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
                .join("\n"),
          executionTimeMs: durationMs,
          success: !result.isError,
          error: result.isError
            ? result.content
                .map((c) => (c.type === "text" ? c.text : ""))
                .join("")
            : undefined,
        }),
      );
    }

    return executions;
  }

  /**
   * Process an SSE stream, emitting RuntimeStreamEvents.
   */
  private async _processStream(
    stream: ReadableStream<Uint8Array>,
    toolCallingMode: ToolCallingMode,
    stepNumber: number,
    controller: ReadableStreamDefaultController<RuntimeStreamEvent>,
  ): Promise<{
    assistantMessage: AssistantMessage;
    promptTokens: number;
    completionTokens: number;
  }> {
    const streamParser = new LLMStreamParser();
    const parsedStream = await streamParser.processSSEStream(stream);
    const reader = parsedStream.getReader();

    const contentBlocks: AssistantMessage["content"] = [];
    let currentText = "";
    let currentThinking = "";
    const textToolCalls: ToolCallResult[] = [];
    let promptTokens = 0;
    let completionTokens = 0;
    let usage: TokenUsage | undefined;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        switch (value.type) {
          case "reasoning":
          case "think_content":
            if (value.content) {
              currentThinking += value.content;
              controller.enqueue({
                type: "thinking_delta",
                text: value.content,
              });
            }
            break;

          case "content":
            if (value.content) {
              currentText += value.content;
              controller.enqueue({ type: "text_delta", text: value.content });
            }
            break;

          case "usage":
            if (value.usage) {
              promptTokens += value.usage.prompt_tokens ?? 0;
              completionTokens += value.usage.completion_tokens ?? 0;
              usage = value.usage;
            }
            break;

          case "tool_call":
            if (toolCallingMode === "text" && value.data?.calls) {
              for (const call of value.data.calls) {
                if (call.name && call.args) {
                  textToolCalls.push({
                    id: `call_${stepNumber}_${textToolCalls.length}`,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.args),
                    },
                  });
                }
              }
            }
            break;
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Build content blocks
    if (currentThinking) {
      contentBlocks.push({ type: "thinking", text: currentThinking });
    }
    if (currentText) {
      contentBlocks.push({ type: "text", text: currentText });
    }

    // Handle tool calls
    if (toolCallingMode === "native") {
      const nativeToolCalls = streamParser.getAccumulatedToolCalls();
      for (const tc of nativeToolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.arguments);
        } catch {
          args = {};
        }
        contentBlocks.push({
          type: "tool_call",
          id: tc.id,
          name: tc.functionName,
          arguments: args,
        });
      }
    } else if (toolCallingMode === "text") {
      for (const tc of textToolCalls) {
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(tc.function.arguments);
        } catch {
          args = {};
        }
        contentBlocks.push({
          type: "tool_call",
          id: tc.id,
          name: tc.function.name,
          arguments: args,
        });
      }
    }

    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: contentBlocks,
      usage,
    };

    return { assistantMessage, promptTokens, completionTokens };
  }

  /**
   * Add a tool result message to the runtime messages array.
   */
  private _addToolResult(
    messages: RuntimeMessage[],
    toolCall: { id: string; name: string },
    result: RuntimeToolResult,
  ): void {
    const msg: ToolResultMessage = {
      role: "tool_result",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      content: result.content,
      details: result.details,
      isError: result.isError,
    };
    messages.push(msg);
  }

  /**
   * Create a terminal step (for max_steps or abort).
   */
  private _makeTerminalStep(
    stepNumber: number,
    _messages: RuntimeMessage[],
    reason: RuntimeAgentStep["stopReason"],
  ): RuntimeAgentStep {
    return {
      stepNumber,
      timestamp: new Date().toISOString(),
      assistantMessage: {
        role: "assistant",
        content: [{ type: "text", text: "" }],
      },
      isTerminal: true,
      stopReason: reason,
    };
  }

  /**
   * Build the final result from accumulated state.
   */
  private _buildResult(
    steps: RuntimeAgentStep[],
    messages: RuntimeMessage[],
    totalPromptTokens: number,
    totalCompletionTokens: number,
    toolCallSummaries: ToolCallSummaryOutput[],
  ): RuntimeAgentResult {
    // Extract final text from last step
    let finalText = "";
    let thinking: string | undefined;

    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      if (!lastStep) throw new Error("Expected at least one step");
      finalText = getTextContent(lastStep.assistantMessage);
      const thinkingText = getThinkingContent(lastStep.assistantMessage);
      if (thinkingText) thinking = thinkingText;
    }

    // Also collect thinking from earlier steps if not found in last
    if (!thinking) {
      for (const step of steps) {
        const t = getThinkingContent(step.assistantMessage);
        if (t) {
          thinking = t;
          break;
        }
      }
    }

    return {
      text: finalText,
      thinking,
      steps,
      messages,
      usage: {
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
      toolCallSummaries,
    };
  }
}
