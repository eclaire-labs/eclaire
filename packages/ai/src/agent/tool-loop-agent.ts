/**
 * ToolLoopAgent
 *
 * Main agent class that orchestrates multi-step tool calling.
 * Inspired by AI SDK v6's ToolLoopAgent pattern.
 */

import { callAI, callAIStream } from "../client.js";
import { createAILogger } from "../logger.js";
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
import type { AIMessage, ToolCallResult } from "../types.js";
import {
  anyOf,
  defaultStopConditions,
  evaluateStopConditions,
  noToolCalls,
  stepCountIs,
} from "./stop-conditions.js";
import { executeAgentTool, toOpenAITools } from "./tool.js";
import type {
  AgentContext,
  AgentResult,
  AgentStep,
  AgentStreamEvent,
  AgentStreamResult,
  GenerateOptions,
  StepToolExecution,
  StopCondition,
  ToolLoopAgentConfig,
} from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("tool-loop-agent");
  }
  return _logger;
}

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

  /**
   * Execute agent with non-streaming response.
   */
  async generate(options: GenerateOptions<TContext>): Promise<AgentResult> {
    const logger = getLogger();
    const { prompt, context, messages: previousMessages, aiOptions } = options;

    logger.info(
      {
        requestId: context.requestId,
        userId: context.userId,
        conversationId: context.conversationId,
      },
      "Starting agent execution",
    );

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

    // Tracking
    const steps: AgentStep[] = [];
    const toolCallSummaries: ToolCallSummaryOutput[] = [];
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let thinking: string | undefined;

    // Get tools in OpenAI format
    const tools = this.config.tools;
    const hasTools = Object.keys(tools).length > 0;
    const toolCallingMode = this.config.toolCallingMode ?? "native";

    // For "off" mode, we skip all tool calling
    // For "text" mode, we don't send tools to AI but parse text for tool calls
    // For "native" mode (default), we send tools and use native tool calls only
    const openAITools =
      hasTools && toolCallingMode === "native"
        ? toOpenAITools(tools)
        : undefined;

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

      // Apply prepareStep if configured
      let currentAiContext = this.config.aiContext;
      let currentTools = openAITools;
      let currentMessages = messages;
      let stepAiOptions = { ...this.config.aiOptions, ...aiOptions };

      if (this.config.prepareStep) {
        const prepareResult = await this.config.prepareStep({
          stepNumber,
          messages,
          context,
          previousSteps: steps,
        });

        if (prepareResult.aiContext) {
          currentAiContext = prepareResult.aiContext;
        }
        if (prepareResult.tools) {
          currentTools = toOpenAITools(prepareResult.tools);
        }
        if (prepareResult.messages) {
          currentMessages = prepareResult.messages;
        }
        if (prepareResult.aiOptions) {
          stepAiOptions = { ...stepAiOptions, ...prepareResult.aiOptions };
        }
      }

      // Call AI
      const aiResponse = await callAI(currentMessages, currentAiContext, {
        ...stepAiOptions,
        tools: currentTools,
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

      // Process tool calls based on toolCallingMode
      let toolCalls: ToolCallResult[] = [];

      if (toolCallingMode === "off") {
        // Off mode: ignore all tool calls
        toolCalls = [];
      } else if (toolCallingMode === "text") {
        // Text mode: only parse embedded JSON from text content
        if (hasTools) {
          const parseResult = parseTextToolContent(
            aiResponse.content,
            aiResponse.reasoning,
          );

          if (parseResult.thinkingContent && !thinking) {
            thinking = parseResult.thinkingContent;
          }

          const extractedCalls = extractToolCalls(parseResult);
          if (extractedCalls.length > 0) {
            toolCalls = extractedCalls.map((tc, idx) => ({
              id: `call_${stepNumber}_${idx}`,
              type: "function" as const,
              function: {
                name: tc.functionName,
                arguments: JSON.stringify(tc.arguments),
              },
            }));
          }
        }
      } else {
        // Native mode (default): only use native tool calls from response
        toolCalls = aiResponse.toolCalls || [];
      }

      // Add assistant message to history
      messages.push({
        role: "assistant",
        content: aiResponse.content,
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      });

      // Create step record
      const step: AgentStep = {
        stepNumber,
        timestamp: new Date().toISOString(),
        aiResponse: {
          content: aiResponse.content,
          reasoning: aiResponse.reasoning,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          usage: aiResponse.usage,
          finishReason: aiResponse.finishReason,
        },
        toolResults: undefined,
        isTerminal: false,
      };

      // Execute tool calls if any
      if (toolCalls.length > 0) {
        const toolResults: StepToolExecution[] = [];

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const toolDef = tools[toolName];

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
            toolResults.push({
              toolName,
              toolCallId: toolCall.id,
              input: {},
              output: errorResult,
              durationMs: 0,
            });

            // Add error result to messages
            messages.push({
              role: "tool",
              content: `Error: ${errorResult.error}`,
              name: toolName,
              tool_call_id: toolCall.id,
            });
            continue;
          }

          // Parse arguments
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {
            args = {};
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

          toolResults.push({
            toolName,
            toolCallId: toolCall.id,
            input: args,
            output: result,
            durationMs,
          });

          // Add result to messages
          messages.push({
            role: "tool",
            content: result.success
              ? result.content
              : `Error: ${result.error || "Unknown error"}`,
            name: toolName,
            tool_call_id: toolCall.id,
          });

          // Track for UI
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

        step.toolResults = toolResults;
      }

      steps.push(step);

      // Check stop conditions
      const { shouldStop, reason } = evaluateStopConditions(
        steps,
        this.stopConditions,
      );

      if (shouldStop) {
        step.isTerminal = true;
        step.stopReason = reason;
        logger.info(
          { requestId: context.requestId, stepNumber, reason },
          "Agent loop stopped",
        );
        break;
      }

      // If no tool calls, stop naturally
      if (toolCalls.length === 0) {
        step.isTerminal = true;
        step.stopReason = "no_tool_calls";
        logger.info(
          { requestId: context.requestId, stepNumber },
          "Agent loop completed (no tool calls)",
        );
        break;
      }
    }

    // Extract final text response
    let finalText = "";
    if (steps.length > 0) {
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

    const result: AgentResult = {
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
    const { prompt, context, messages: previousMessages, aiOptions } = options;

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

          // Tracking
          const steps: AgentStep[] = [];
          const toolCallSummaries: ToolCallSummaryOutput[] = [];
          const totalPromptTokens = 0;
          const totalCompletionTokens = 0;
          let thinking: string | undefined;

          // Get tools in OpenAI format
          const tools = this.config.tools;
          const hasTools = Object.keys(tools).length > 0;
          const toolCallingMode = this.config.toolCallingMode ?? "native";

          // For "off" mode, we skip all tool calling
          // For "text" mode, we don't send tools to AI but parse text for tool calls
          // For "native" mode (default), we send tools and use native tool calls only
          const openAITools =
            hasTools && toolCallingMode === "native"
              ? toOpenAITools(tools)
              : undefined;

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

            // Apply prepareStep if configured
            let currentAiContext = this.config.aiContext;
            let currentTools = openAITools;
            let currentMessages = messages;
            let stepAiOptions = { ...this.config.aiOptions, ...aiOptions };

            if (this.config.prepareStep) {
              const prepareResult = await this.config.prepareStep({
                stepNumber,
                messages,
                context,
                previousSteps: steps,
              });

              if (prepareResult.aiContext) {
                currentAiContext = prepareResult.aiContext;
              }
              if (prepareResult.tools) {
                currentTools = toOpenAITools(prepareResult.tools);
              }
              if (prepareResult.messages) {
                currentMessages = prepareResult.messages;
              }
              if (prepareResult.aiOptions) {
                stepAiOptions = {
                  ...stepAiOptions,
                  ...prepareResult.aiOptions,
                };
              }
            }

            // Call AI with streaming
            const { stream } = await callAIStream(
              currentMessages,
              currentAiContext,
              {
                ...stepAiOptions,
                tools: currentTools,
                toolChoice: hasTools ? "auto" : undefined,
                debugContext: {
                  requestId: context.requestId,
                  userId: context.userId,
                  stepNumber,
                },
              },
            );

            // Process stream
            const streamParser = new LLMStreamParser();
            const parsedStream = await streamParser.processSSEStream(stream);
            const reader = parsedStream.getReader();
            let fullContent = "";
            const streamedToolCalls: ToolCallResult[] = [];

            try {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const timestamp = new Date().toISOString();

                switch (value.type) {
                  case "reasoning":
                    if (value.content) {
                      thinking = (thinking || "") + value.content;
                      controller.enqueue({
                        type: "thought",
                        content: value.content,
                        timestamp,
                      });
                    }
                    break;

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

                  case "tool_call":
                    // Only capture text-based tool calls in "text" mode
                    if (toolCallingMode === "text" && value.data?.calls) {
                      for (const call of value.data.calls) {
                        if (call.name && call.args) {
                          streamedToolCalls.push({
                            id: `call_${stepNumber}_${streamedToolCalls.length}`,
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
                streamedToolCalls.push({
                  id: tc.id,
                  type: "function",
                  function: {
                    name: tc.functionName,
                    arguments: tc.arguments,
                  },
                });
              }
            }

            // Add assistant message to history
            messages.push({
              role: "assistant",
              content: fullContent,
              tool_calls:
                streamedToolCalls.length > 0 ? streamedToolCalls : undefined,
            });

            // Create step record
            const step: AgentStep = {
              stepNumber,
              timestamp: new Date().toISOString(),
              aiResponse: {
                content: fullContent,
                reasoning: thinking,
                toolCalls:
                  streamedToolCalls.length > 0 ? streamedToolCalls : undefined,
              },
              toolResults: undefined,
              isTerminal: false,
            };

            // Execute tool calls if any
            if (streamedToolCalls.length > 0) {
              const toolResults: StepToolExecution[] = [];

              for (const toolCall of streamedToolCalls) {
                const toolName = toolCall.function.name;
                const toolDef = tools[toolName];

                // Emit tool start event
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(toolCall.function.arguments);
                } catch {
                  // Keep empty args
                }

                controller.enqueue({
                  type: "tool-call-start",
                  toolName,
                  toolCallId: toolCall.id,
                  arguments: args,
                  timestamp: new Date().toISOString(),
                });

                if (!toolDef) {
                  const errorResult: ToolExecutionResult = {
                    success: false,
                    content: "",
                    error: `Tool '${toolName}' not found`,
                  };

                  controller.enqueue({
                    type: "tool-call-error",
                    toolName,
                    toolCallId: toolCall.id,
                    error: errorResult.error!,
                    timestamp: new Date().toISOString(),
                  });

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

                if (result.success) {
                  controller.enqueue({
                    type: "tool-call-complete",
                    toolName,
                    toolCallId: toolCall.id,
                    result,
                    durationMs,
                    timestamp: new Date().toISOString(),
                  });
                } else {
                  controller.enqueue({
                    type: "tool-call-error",
                    toolName,
                    toolCallId: toolCall.id,
                    error: result.error || "Unknown error",
                    timestamp: new Date().toISOString(),
                  });
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

              step.toolResults = toolResults;
            }

            steps.push(step);

            // Emit step complete event
            controller.enqueue({
              type: "step-complete",
              step,
              timestamp: new Date().toISOString(),
            });

            // Check stop conditions
            const { shouldStop, reason } = evaluateStopConditions(
              steps,
              this.stopConditions,
            );

            if (shouldStop) {
              step.isTerminal = true;
              step.stopReason = reason;
              break;
            }

            // If no tool calls, stop naturally
            if (streamedToolCalls.length === 0) {
              step.isTerminal = true;
              step.stopReason = "no_tool_calls";
              break;
            }
          }

          // Extract final text response
          let finalText = "";
          if (steps.length > 0) {
            const lastStep = steps[steps.length - 1]!;
            const parseResult = parseTextToolContent(
              lastStep.aiResponse.content,
              lastStep.aiResponse.reasoning,
            );
            finalText =
              extractFinalResponse(parseResult) || lastStep.aiResponse.content;
          }

          const result: AgentResult = {
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
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
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
}
