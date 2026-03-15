/**
 * Runtime Agent Types
 *
 * Configuration and result types for the new RuntimeAgent.
 */

import type { z } from "zod";
import type { AICallOptions, AIContext } from "../../types.js";
import type { ToolCallSummaryOutput } from "../../tools/types.js";
import type { RuntimeMessage, RuntimeStreamEvent } from "../messages.js";
import type { RuntimeToolDefinition, ToolContext } from "../tools/types.js";

// biome-ignore lint/suspicious/noExplicitAny: intentional — Zod requires any for generic schema type alias
type AnyZodType = z.ZodType<any, any, any>;

// =============================================================================
// AGENT CONTEXT
// =============================================================================

/** Context for a runtime agent execution */
export interface RuntimeAgentContext extends ToolContext {
  /** Timestamp when execution started */
  startTime: number;
  /** Optional abort signal */
  abortSignal?: AbortSignal;
  /** Optional conversation/session identifier (aliases sessionId for compat) */
  conversationId?: string;
}

/** Options for creating a runtime agent context */
export interface CreateRuntimeContextOptions {
  userId: string;
  requestId?: string;
  sessionId?: string;
  conversationId?: string;
  abortSignal?: AbortSignal;
  extra?: Record<string, unknown>;
}

/** Create a runtime agent context */
export function createRuntimeContext(
  opts: CreateRuntimeContextOptions,
): RuntimeAgentContext {
  return {
    userId: opts.userId,
    requestId:
      opts.requestId ??
      `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sessionId: opts.sessionId ?? opts.conversationId,
    conversationId: opts.conversationId,
    startTime: Date.now(),
    abortSignal: opts.abortSignal,
    extra: opts.extra,
  };
}

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

/** Configuration for RuntimeAgent */
export interface RuntimeAgentConfig {
  /** AI context for model selection (e.g., "backend", "cli") */
  aiContext: AIContext;

  /** Optional model ID override — bypasses context-based selection */
  modelOverride?: string;

  /** System prompt — static string or dynamic function */
  instructions:
    | string
    | ((ctx: RuntimeAgentContext) => string | Promise<string>);

  /** Available tools (keyed by name) */
  tools: Record<string, RuntimeToolDefinition<AnyZodType>>;

  /** Tool calling mode */
  toolCallingMode?: "native" | "text" | "off";

  /** Maximum number of agent loop iterations (default: 10) */
  maxSteps?: number;

  /** Default AI call options */
  aiOptions?: Partial<AICallOptions>;
}

// =============================================================================
// AGENT RESULTS
// =============================================================================

/** A single tool execution within a step */
export interface RuntimeStepToolExecution {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  result: import("../tools/types.js").RuntimeToolResult;
  durationMs: number;
}

/** One iteration of the agent loop */
export interface RuntimeAgentStep {
  stepNumber: number;
  timestamp: string;
  /** The assistant message produced in this step */
  assistantMessage: import("../messages.js").AssistantMessage;
  /** Tool executions if any */
  toolExecutions?: RuntimeStepToolExecution[];
  /** Whether this was the final step */
  isTerminal: boolean;
  /** Why the loop stopped (if terminal) */
  stopReason?: "max_steps" | "no_tool_calls" | "stop_condition" | "aborted";
}

/** Final result from agent execution */
export interface RuntimeAgentResult {
  /** Final text response */
  text: string;
  /** Thinking/reasoning content */
  thinking?: string;
  /** All steps executed */
  steps: RuntimeAgentStep[];
  /** All messages produced during execution */
  messages: RuntimeMessage[];
  /** Aggregate token usage */
  usage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
  };
  /** Tool call summaries for UI display */
  toolCallSummaries: ToolCallSummaryOutput[];
}

/** Options for generate/stream calls */
export interface RuntimeGenerateOptions {
  /** User prompt */
  prompt: string;
  /** Execution context */
  context: RuntimeAgentContext;
  /** Previous messages (for conversation continuity) */
  messages?: RuntimeMessage[];
  /** Override AI options for this call */
  aiOptions?: Partial<AICallOptions>;
}

/** Streaming result */
export interface RuntimeStreamResult {
  /** Stream of events for real-time UI */
  eventStream: ReadableStream<RuntimeStreamEvent>;
  /** Promise resolving to the final result */
  result: Promise<RuntimeAgentResult>;
}
