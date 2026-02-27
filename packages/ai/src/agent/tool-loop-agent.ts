/**
 * ToolLoopAgent
 *
 * Main agent class that orchestrates multi-step tool calling.
 * Inspired by AI SDK v6's ToolLoopAgent pattern.
 */

import { callAI, callAIStream } from "../client.js";
import { createLazyLogger, getErrorMessage } from "../logger.js";
import { LLMStreamParser } from "../stream-parser.js";
import {
  extractFinalResponse,
  extractToolCalls,
  parseTextToolContent,
} from "../text-parser.js";
import { createToolCallSummary } from "../tools/native.js";
import type {
  ToolCallSummaryOutput,
  ToolExecutionResult,
} from "../tools/types.js";
import type {
  AICallOptions,
  AIContext,
  AIMessage,
  FinishReason,
  ToolCallResult,
  ToolCallingMode,
  TokenUsage,
  ToolDefinition,
} from "../types.js";
import {
  defaultStopConditions,
  evaluateStopConditions,
} from "./stop-conditions.js";
import { executeAgentTool, toOpenAITools } from "./tool.js";
import type {
  AgentContext,
  AgentResult,
  AgentStep,
  AgentStreamEvent,
  AgentStreamResult,
  AgentToolDefinition,
  AnyZodType,
  GenerateOptions,
  StepToolExecution,
  StopCondition,
  ToolLoopAgentConfig,
} from "./types.js";

const getLogger = createLazyLogger("tool-loop-agent");

// =============================================================================
// INTERNAL TYPES
// =============================================================================

/** Result from a single AI call step (content + tool calls) */
interface StepAIResult {
  content: string;
  reasoning?: string;
  toolCalls: ToolCallResult[];
  usage?: TokenUsage;
  finishReason?: FinishReason;
}

/** Callbacks for streaming events during tool execution */
interface ToolExecutionCallbacks {
  onToolCallStart(
    toolName: string,
    toolCallId: string,
    args: Record<string, unknown>,
  ): void;
  onToolCallComplete(
    toolName: string,
    toolCallId: string,
    result: ToolExecutionResult,
    durationMs: number,
  ): void;
  onToolCallError(
    toolName: string,
    toolCallId: string,
    error: string,
  ): void;
}

/** Initialized loop state */
interface LoopState<TContext extends AgentContext> {
  messages: AIMessage[];
  tools: Record<string, AgentToolDefinition<AnyZodType, TContext>>;
  hasTools: boolean;
  toolCallingMode: ToolCallingMode;
  openAITools: ToolDefinition[] | undefined;
}

/** Step preparation result */
interface PreparedStep {
  aiContext: AIContext;
  tools: ToolDefinition[] | undefined;
  messages: AIMessage[];
  aiOptions: Partial<AICallOptions>;
}

// =============================================================================
// TOOL LOOP AGENT
// =============================================================================

/**
 * ToolLoopAgent orchestrates multi-step AI conversations with tool calling.
 *
 * @example
 * ```typescript
 * const agent = new ToolLoopAgent({
 *   aiContext: "backend",
 *   instructions: "You are a helpful assistant.",
 *   tools: {
 *     findNotes: findNotesTool,
 *     createNote: createNoteTool,
 *   },
 *   stopWhen: anyOf(stepCountIs(10), noToolCalls()),
 * });
 *
 * const result = await agent.generate({
 *   prompt: "Find all notes about TypeScript",
 *   context: createAgentContext({ userId: "user_123" }),
 * });
 *
 * console.log(result.text);
 * console.log(result.steps);
 * ```
 */
export class ToolLoopAgent<TContext extends AgentContext = AgentContext> {
  private config: ToolLoopAgentConfig<TContext>;
  private stopConditions: StopCondition[];

  constructor(config: ToolLoopAgentConfig<TContext>) {
    this.config = config;

    // Normalize stop conditions to array
    if (config.stopWhen) {
      this.stopConditions = Array.isArray(config.stopWhen)
        ? config.stopWhen
        : [config.stopWhen];
    } else {
      // Default: stop after 10 steps or when no tool calls
      this.stopConditions = [defaultStopConditions];
    }
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Execute agent with non-streaming response.
   */
  async generate(options: GenerateOptions<TContext>): Promise<AgentResult> {
    const logger = getLogger();
    const { prompt, context, aiOptions } = options;

    logger.info(
      {
        requestId: context.requestId,
        userId: context.userId,
        conversationId: context.conversationId,
      },
      "Starting agent execution",
    );

    const loopState = await this._initLoop(options);
    const { messages, tools, hasTools, toolCallingMode, openAITools } =
      loopState;

    // Tracking
    const steps: AgentStep[] = [];
    const toolCallSummaries: ToolCallSummaryOutput[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let thinking: string | undefined;

    // Agent loop
    let stepNumber = 0;
    while (true) {
      stepNumber++;

      // Check abort signal
      if (context.abortSignal?.aborted) {
        logger.info(
          { requestId: context.requestId },
          "Agent execution aborted",
        );
        break;
      }

      logger.debug(
        { requestId: context.requestId, stepNumber },
        "Starting agent step",
      );

      const prepared = await this._prepareStep(
        stepNumber,
        messages,
        context,
        steps,
        openAITools,
        aiOptions,
      );

      // Call AI (non-streaming)
      const aiResponse = await callAI(prepared.messages, prepared.aiContext, {
        ...prepared.aiOptions,
        tools: prepared.tools,
        toolChoice: hasTools ? "auto" : undefined,
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

      // Track reasoning/thinking
      if (aiResponse.reasoning) {
        thinking = aiResponse.reasoning;
      }

      // Extract tool calls
      const extracted = this._extractToolCalls(
        {
          content: aiResponse.content,
          reasoning: aiResponse.reasoning,
          toolCalls: aiResponse.toolCalls || [],
          usage: aiResponse.usage,
          finishReason: aiResponse.finishReason,
        },
        toolCallingMode,
        hasTools,
        stepNumber,
        thinking,
      );
      thinking = extracted.thinking;

      // Add assistant message to history
      messages.push({
        role: "assistant",
        content: aiResponse.content,
        tool_calls:
          extracted.toolCalls.length > 0 ? extracted.toolCalls : undefined,
      });

      // Create step record
      const step: AgentStep = {
        stepNumber,
        timestamp: new Date().toISOString(),
        aiResponse: {
          content: aiResponse.content,
          reasoning: aiResponse.reasoning,
          toolCalls:
            extracted.toolCalls.length > 0 ? extracted.toolCalls : undefined,
          usage: aiResponse.usage,
          finishReason: aiResponse.finishReason,
        },
        toolResults: undefined,
        isTerminal: false,
      };

      // Execute tool calls if any
      if (extracted.toolCalls.length > 0) {
        step.toolResults = await this._executeToolCalls(
          extracted.toolCalls,
          tools,
          context,
          messages,
          toolCallSummaries,
        );
      }

      steps.push(step);

      // Check stop conditions
      const shouldBreak = this._checkStopConditions(
        step,
        steps,
        extracted.toolCalls.length,
        context.requestId,
        stepNumber,
      );
      if (shouldBreak) break;
    }

    const result = this._buildResult(
      steps,
      thinking,
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
      "Agent execution completed",
    );

    return result;
  }

  /**
   * Execute agent with streaming response.
   */
  stream(options: GenerateOptions<TContext>): AgentStreamResult {
    const logger = getLogger();
    const { context, aiOptions } = options;

    // Create a promise that will resolve to the final result
    let resolveResult: (result: AgentResult) => void;
    let rejectResult: (error: Error) => void;
    const resultPromise = new Promise<AgentResult>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    // Create the event stream
    const eventStream = new ReadableStream<AgentStreamEvent>({
      start: async (controller) => {
        try {
          logger.info(
            {
              requestId: context.requestId,
              userId: context.userId,
              conversationId: context.conversationId,
            },
            "Starting streaming agent execution",
          );

          const loopState = await this._initLoop(options);
          const {
            messages,
            tools,
            hasTools,
            toolCallingMode,
            openAITools,
          } = loopState;

          // Tracking
          const steps: AgentStep[] = [];
          const toolCallSummaries: ToolCallSummaryOutput[] = [];
          let totalPromptTokens = 0;
          let totalCompletionTokens = 0;
          let thinking: string | undefined;

          // Streaming callbacks for tool execution events
          const callbacks: ToolExecutionCallbacks = {
            onToolCallStart(toolName, toolCallId, args) {
              controller.enqueue({
                type: "tool-call-start",
                toolName,
                toolCallId,
                arguments: args,
                timestamp: new Date().toISOString(),
              });
            },
            onToolCallComplete(toolName, toolCallId, result, durationMs) {
              controller.enqueue({
                type: "tool-call-complete",
                toolName,
                toolCallId,
                result,
                durationMs,
                timestamp: new Date().toISOString(),
              });
            },
            onToolCallError(toolName, toolCallId, error) {
              controller.enqueue({
                type: "tool-call-error",
                toolName,
                toolCallId,
                error,
                timestamp: new Date().toISOString(),
              });
            },
          };

          // Agent loop
          let stepNumber = 0;
          while (true) {
            stepNumber++;

            // Check abort signal
            if (context.abortSignal?.aborted) {
              controller.enqueue({
                type: "error",
                error: "Agent execution aborted",
                timestamp: new Date().toISOString(),
              });
              break;
            }

            const prepared = await this._prepareStep(
              stepNumber,
              messages,
              context,
              steps,
              openAITools,
              aiOptions,
            );

            // Call AI with streaming
            const { stream } = await callAIStream(
              prepared.messages,
              prepared.aiContext,
              {
                ...prepared.aiOptions,
                tools: prepared.tools,
                toolChoice: hasTools ? "auto" : undefined,
                debugContext: {
                  requestId: context.requestId,
                  userId: context.userId,
                  stepNumber,
                },
              },
            );

            // Process stream and collect content + tool calls
            const streamResult = await this._processStream(
              stream,
              toolCallingMode,
              stepNumber,
              thinking,
              controller,
            );

            thinking = streamResult.thinking;
            totalPromptTokens += streamResult.promptTokens;
            totalCompletionTokens += streamResult.completionTokens;

            // Add assistant message to history
            messages.push({
              role: "assistant",
              content: streamResult.content,
              tool_calls:
                streamResult.toolCalls.length > 0
                  ? streamResult.toolCalls
                  : undefined,
            });

            // Create step record
            const step: AgentStep = {
              stepNumber,
              timestamp: new Date().toISOString(),
              aiResponse: {
                content: streamResult.content,
                reasoning: thinking,
                toolCalls:
                  streamResult.toolCalls.length > 0
                    ? streamResult.toolCalls
                    : undefined,
              },
              toolResults: undefined,
              isTerminal: false,
            };

            // Execute tool calls if any
            if (streamResult.toolCalls.length > 0) {
              step.toolResults = await this._executeToolCalls(
                streamResult.toolCalls,
                tools,
                context,
                messages,
                toolCallSummaries,
                callbacks,
              );
            }

            steps.push(step);

            // Emit step complete event
            controller.enqueue({
              type: "step-complete",
              step,
              timestamp: new Date().toISOString(),
            });

            // Check stop conditions
            const shouldBreak = this._checkStopConditions(
              step,
              steps,
              streamResult.toolCalls.length,
              context.requestId,
              stepNumber,
            );
            if (shouldBreak) break;
          }

          const result = this._buildResult(
            steps,
            thinking,
            totalPromptTokens,
            totalCompletionTokens,
            toolCallSummaries,
          );

          // Emit done event
          controller.enqueue({
            type: "done",
            result,
            timestamp: new Date().toISOString(),
          });

          controller.close();
          resolveResult(result);

          logger.info(
            {
              requestId: context.requestId,
              totalSteps: steps.length,
              totalToolCalls: toolCallSummaries.length,
            },
            "Streaming agent execution completed",
          );
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          controller.enqueue({
            type: "error",
            error: errorMessage,
            timestamp: new Date().toISOString(),
          });
          controller.close();
          rejectResult(
            error instanceof Error ? error : new Error(errorMessage),
          );

          logger.error(
            {
              requestId: context.requestId,
              error: errorMessage,
            },
            "Streaming agent execution failed",
          );
        }
      },
    });

    return {
      eventStream,
      result: resultPromise,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Initialize the agent loop: build system prompt, messages, and tool config.
   */
  private async _initLoop(
    options: GenerateOptions<TContext>,
  ): Promise<LoopState<TContext>> {
    const { prompt, context, messages: previousMessages } = options;

    // Build system prompt
    const systemPrompt =
      typeof this.config.instructions === "function"
        ? await this.config.instructions(context)
        : this.config.instructions;

    // Initialize messages
    const messages: AIMessage[] = previousMessages
      ? [...previousMessages]
      : [{ role: "system", content: systemPrompt }];

    // Add user message
    messages.push({ role: "user", content: prompt });

    // Get tools config
    const tools = this.config.tools;
    const hasTools = Object.keys(tools).length > 0;
    const toolCallingMode = this.config.toolCallingMode ?? "native";

    const openAITools =
      hasTools && toolCallingMode === "native"
        ? toOpenAITools(tools)
        : undefined;

    return { messages, tools, hasTools, toolCallingMode, openAITools };
  }

  /**
   * Apply prepareStep callback and return resolved step configuration.
   */
  private async _prepareStep(
    stepNumber: number,
    messages: AIMessage[],
    context: TContext,
    previousSteps: AgentStep[],
    defaultTools: ToolDefinition[] | undefined,
    overrideAiOptions?: Partial<AICallOptions>,
  ): Promise<PreparedStep> {
    let aiContext = this.config.aiContext;
    let tools = defaultTools;
    let currentMessages = messages;
    let aiOptions = { ...this.config.aiOptions, ...overrideAiOptions };

    if (this.config.prepareStep) {
      const prepareResult = await this.config.prepareStep({
        stepNumber,
        messages,
        context,
        previousSteps,
      });

      if (prepareResult.aiContext) {
        aiContext = prepareResult.aiContext;
      }
      if (prepareResult.tools) {
        tools = toOpenAITools(prepareResult.tools);
      }
      if (prepareResult.messages) {
        currentMessages = prepareResult.messages;
      }
      if (prepareResult.aiOptions) {
        aiOptions = { ...aiOptions, ...prepareResult.aiOptions };
      }
    }

    return { aiContext, tools, messages: currentMessages, aiOptions };
  }

  /**
   * Extract tool calls from an AI response based on the calling mode.
   */
  private _extractToolCalls(
    response: StepAIResult,
    toolCallingMode: ToolCallingMode,
    hasTools: boolean,
    stepNumber: number,
    thinking: string | undefined,
  ): { toolCalls: ToolCallResult[]; thinking: string | undefined } {
    if (toolCallingMode === "off") {
      return { toolCalls: [], thinking };
    }

    if (toolCallingMode === "text") {
      if (!hasTools) return { toolCalls: [], thinking };

      const parseResult = parseTextToolContent(
        response.content,
        response.reasoning,
      );

      if (parseResult.thinkingContent && !thinking) {
        thinking = parseResult.thinkingContent;
      }

      const extractedCalls = extractToolCalls(parseResult);
      const toolCalls = extractedCalls.map((tc, idx) => ({
        id: `call_${stepNumber}_${idx}`,
        type: "function" as const,
        function: {
          name: tc.functionName,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

      return { toolCalls, thinking };
    }

    // Native mode (default)
    return { toolCalls: response.toolCalls, thinking };
  }

  /**
   * Execute tool calls, update messages, and track summaries.
   */
  private async _executeToolCalls(
    toolCalls: ToolCallResult[],
    tools: Record<string, AgentToolDefinition<AnyZodType, TContext>>,
    context: TContext,
    messages: AIMessage[],
    toolCallSummaries: ToolCallSummaryOutput[],
    callbacks?: ToolExecutionCallbacks,
  ): Promise<StepToolExecution[]> {
    const logger = getLogger();
    const toolResults: StepToolExecution[] = [];

    for (const toolCall of toolCalls) {
      const toolName = toolCall.function.name;
      const toolDef = tools[toolName];

      // Parse arguments
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch {
        args = {};
      }

      // Emit start event (streaming only)
      callbacks?.onToolCallStart(toolName, toolCall.id, args);

      if (!toolDef) {
        logger.warn(
          { requestId: context.requestId, toolName },
          "Tool not found",
        );
        const errorResult: ToolExecutionResult = {
          success: false,
          content: "",
          error: `Tool '${toolName}' not found`,
        };

        callbacks?.onToolCallError(
          toolName,
          toolCall.id,
          // biome-ignore lint/style/noNonNullAssertion: error field is set in the literal above
          errorResult.error!,
        );

        toolResults.push({
          toolName,
          toolCallId: toolCall.id,
          input: args,
          output: errorResult,
          durationMs: 0,
        });

        messages.push({
          role: "tool",
          content: `Error: ${errorResult.error}`,
          name: toolName,
          tool_call_id: toolCall.id,
        });
        continue;
      }

      // Execute tool
      const startTime = Date.now();
      const result = await executeAgentTool(toolDef, args, context);
      const durationMs = Date.now() - startTime;

      logger.debug(
        {
          requestId: context.requestId,
          toolName,
          durationMs,
          success: result.success,
        },
        "Tool executed",
      );

      // Emit completion/error event (streaming only)
      if (result.success) {
        callbacks?.onToolCallComplete(toolName, toolCall.id, result, durationMs);
      } else {
        callbacks?.onToolCallError(
          toolName,
          toolCall.id,
          result.error || "Unknown error",
        );
      }

      toolResults.push({
        toolName,
        toolCallId: toolCall.id,
        input: args,
        output: result,
        durationMs,
      });

      messages.push({
        role: "tool",
        content: result.success
          ? result.content
          : `Error: ${result.error || "Unknown error"}`,
        name: toolName,
        tool_call_id: toolCall.id,
      });

      toolCallSummaries.push(
        createToolCallSummary({
          functionName: toolName,
          arguments: args,
          result: result.success ? result.content : null,
          executionTimeMs: durationMs,
          success: result.success,
          error: result.error,
        }),
      );
    }

    return toolResults;
  }

  /**
   * Process an SSE stream, emitting events to the controller.
   * Returns collected content, tool calls, thinking, and token usage.
   */
  private async _processStream(
    stream: ReadableStream<Uint8Array>,
    toolCallingMode: ToolCallingMode,
    stepNumber: number,
    thinking: string | undefined,
    controller: ReadableStreamDefaultController<AgentStreamEvent>,
  ): Promise<{
    content: string;
    toolCalls: ToolCallResult[];
    thinking: string | undefined;
    promptTokens: number;
    completionTokens: number;
  }> {
    const streamParser = new LLMStreamParser();
    const parsedStream = await streamParser.processSSEStream(stream);
    const reader = parsedStream.getReader();
    let fullContent = "";
    const toolCalls: ToolCallResult[] = [];
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const timestamp = new Date().toISOString();

        switch (value.type) {
          case "reasoning":
          case "think_content":
            if (value.content) {
              thinking = (thinking || "") + value.content;
              controller.enqueue({
                type: "thought",
                content: value.content,
                timestamp,
              });
            }
            break;

          case "content":
            if (value.content) {
              fullContent += value.content;
              controller.enqueue({
                type: "text-chunk",
                content: value.content,
                timestamp,
              });
            }
            break;

          case "usage":
            if (value.usage) {
              promptTokens += value.usage.prompt_tokens ?? 0;
              completionTokens += value.usage.completion_tokens ?? 0;
            }
            break;

          case "tool_call":
            // Only capture text-based tool calls in "text" mode
            if (toolCallingMode === "text" && value.data?.calls) {
              for (const call of value.data.calls) {
                if (call.name && call.args) {
                  toolCalls.push({
                    id: `call_${stepNumber}_${toolCalls.length}`,
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

    // For native mode, get accumulated tool calls from the parser
    if (toolCallingMode === "native") {
      const nativeToolCalls = streamParser.getAccumulatedToolCalls();
      for (const tc of nativeToolCalls) {
        toolCalls.push({
          id: tc.id,
          type: "function",
          function: {
            name: tc.functionName,
            arguments: tc.arguments,
          },
        });
      }
    }

    return { content: fullContent, toolCalls, thinking, promptTokens, completionTokens };
  }

  /**
   * Check stop conditions and update step if terminal.
   * Returns true if the loop should break.
   */
  private _checkStopConditions(
    step: AgentStep,
    steps: AgentStep[],
    toolCallCount: number,
    requestId: string,
    stepNumber: number,
  ): boolean {
    const logger = getLogger();

    const { shouldStop, reason } = evaluateStopConditions(
      steps,
      this.stopConditions,
    );

    if (shouldStop) {
      step.isTerminal = true;
      step.stopReason = reason;
      logger.info(
        { requestId, stepNumber, reason },
        "Agent loop stopped",
      );
      return true;
    }

    // If no tool calls, stop naturally
    if (toolCallCount === 0) {
      step.isTerminal = true;
      step.stopReason = "no_tool_calls";
      logger.info(
        { requestId, stepNumber },
        "Agent loop completed (no tool calls)",
      );
      return true;
    }

    return false;
  }

  /**
   * Build the final AgentResult from accumulated loop state.
   */
  private _buildResult(
    steps: AgentStep[],
    thinking: string | undefined,
    totalPromptTokens: number,
    totalCompletionTokens: number,
    toolCallSummaries: ToolCallSummaryOutput[],
  ): AgentResult {
    // Extract final text response
    let finalText = "";
    if (steps.length > 0) {
      // biome-ignore lint/style/noNonNullAssertion: length check guarantees element exists
      const lastStep = steps[steps.length - 1]!;
      const parseResult = parseTextToolContent(
        lastStep.aiResponse.content,
        lastStep.aiResponse.reasoning,
      );
      finalText =
        extractFinalResponse(parseResult) || lastStep.aiResponse.content;

      // Also capture thinking from final step
      if (parseResult.thinkingContent && !thinking) {
        thinking = parseResult.thinkingContent;
      }
    }

    return {
      text: finalText,
      thinking,
      steps,
      usage: {
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens: totalPromptTokens + totalCompletionTokens,
      },
      toolCallSummaries,
    };
  }
}
