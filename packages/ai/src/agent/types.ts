/**
 * Agent Types
 *
 * Core type definitions for the ToolLoopAgent, inspired by AI SDK v6 patterns.
 */

import type { z } from "zod";

// Zod v4 type alias for any zod schema
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyZodType = z.ZodType<any, any, any>;
import type {
  AICallOptions,
  AIContext,
  AIMessage,
  FinishReason,
  TokenUsage,
  ToolCallResult,
  ToolCallingMode,
} from "../types.js";
import type { ToolCallSummaryOutput, ToolExecutionResult } from "../tools/types.js";

// =============================================================================
// AGENT CONTEXT
// =============================================================================

/**
 * Context object that flows through the entire agent execution.
 * Passed to all tool executions and step handlers.
 */
export interface AgentContext<TUserContext = unknown> {
  /** User identifier for authorization */
  userId: string;

  /** Request identifier for tracing/logging */
  requestId: string;

  /** Optional conversation identifier */
  conversationId?: string;

  /** User-provided extension data (e.g., user profile) */
  userContext?: TUserContext;

  /** Timestamp when the agent execution started */
  startTime: number;

  /** Optional abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Options for creating an agent context
 */
export interface CreateContextOptions<TUserContext = unknown> {
  userId: string;
  requestId?: string;
  conversationId?: string;
  userContext?: TUserContext;
  abortSignal?: AbortSignal;
}

// =============================================================================
// TOOL DEFINITION
// =============================================================================

/**
 * Declarative tool definition inspired by AI SDK v6.
 * Combines schema definition with execution logic.
 */
export interface AgentToolDefinition<
  TInput extends AnyZodType = AnyZodType,
  TContext extends AgentContext = AgentContext,
> {
  /** Unique tool name */
  name: string;

  /** Human-readable description for the AI */
  description: string;

  /** Zod schema for input validation */
  inputSchema: TInput;

  /**
   * Execute the tool with parsed input and context.
   */
  execute: (
    input: z.infer<TInput>,
    context: TContext
  ) => Promise<ToolExecutionResult>;

  /**
   * Optional: Whether this tool requires human approval before execution.
   * Can be a static boolean or a function that checks the input.
   */
  needsApproval?:
    | boolean
    | ((input: z.infer<TInput>, context: TContext) => boolean | Promise<boolean>);
}

// =============================================================================
// STOP CONDITIONS
// =============================================================================

/**
 * Stop condition receives full step history and decides whether to stop.
 */
export type StopCondition = (steps: AgentStep[]) => boolean;

// =============================================================================
// STEP TYPES
// =============================================================================

/**
 * Tool execution details within a step
 */
export interface StepToolExecution {
  toolName: string;
  toolCallId: string;
  input: Record<string, unknown>;
  output: ToolExecutionResult;
  durationMs: number;
}

/**
 * Represents one iteration of the agent loop
 */
export interface AgentStep {
  /** Step number (1-indexed) */
  stepNumber: number;

  /** When this step was executed */
  timestamp: string;

  /** AI response details */
  aiResponse: {
    content: string;
    reasoning?: string;
    toolCalls?: ToolCallResult[];
    usage?: TokenUsage;
    finishReason?: FinishReason;
  };

  /** Tool execution details (if tools were called) */
  toolResults?: StepToolExecution[];

  /** Whether this step completed the loop */
  isTerminal: boolean;

  /** Reason the loop stopped (if terminal) */
  stopReason?: "max_steps" | "no_tool_calls" | "stop_condition" | "finish_reason" | "needs_approval";
}

// =============================================================================
// AGENT CONFIGURATION
// =============================================================================

/**
 * Information provided to prepareStep callback
 */
export interface PrepareStepInfo<TContext extends AgentContext = AgentContext> {
  stepNumber: number;
  messages: AIMessage[];
  context: TContext;
  previousSteps: AgentStep[];
}

/**
 * Result from prepareStep callback - allows overriding per-step settings
 */
export interface PrepareStepResult<TContext extends AgentContext = AgentContext> {
  /** Override AI context for this step */
  aiContext?: AIContext;

  /** Override tools for this step */
  tools?: Record<string, AgentToolDefinition<AnyZodType, TContext>>;

  /** Modify messages for this step */
  messages?: AIMessage[];

  /** Additional AI options */
  aiOptions?: Partial<AICallOptions>;
}

/**
 * Configuration for ToolLoopAgent
 */
export interface ToolLoopAgentConfig<TContext extends AgentContext = AgentContext> {
  /**
   * AI context for model selection (e.g., "backend", "workers")
   */
  aiContext: AIContext;

  /**
   * System prompt or function to generate it dynamically
   */
  instructions: string | ((context: TContext) => string | Promise<string>);

  /**
   * Available tools for the agent
   */
  tools: Record<string, AgentToolDefinition<AnyZodType, TContext>>;

  /**
   * Tool calling mode:
   * - "native" (default): Use native tool calls from model response only
   * - "text": Parse text content for embedded JSON tool calls only
   * - "off": Don't send tools to AI and ignore any tool calls
   */
  toolCallingMode?: ToolCallingMode;

  /**
   * Stop conditions (default: stepCountIs(10))
   * Can be a single condition or array (stops when any matches)
   */
  stopWhen?: StopCondition | StopCondition[];

  /**
   * Callback before each step - can modify model, tools, messages
   */
  prepareStep?: (
    info: PrepareStepInfo<TContext>
  ) => PrepareStepResult<TContext> | Promise<PrepareStepResult<TContext>>;

  /**
   * Default AI call options
   */
  aiOptions?: Partial<AICallOptions>;
}

// =============================================================================
// AGENT RESULTS
// =============================================================================

/**
 * Final result from agent execution
 */
export interface AgentResult {
  /** Final text response */
  text: string;

  /** Thinking/reasoning content if available */
  thinking?: string;

  /** All steps executed */
  steps: AgentStep[];

  /** Aggregate token usage */
  usage: {
    totalPromptTokens: number;
    totalCompletionTokens: number;
    totalTokens: number;
  };

  /** Summaries of all tool calls (for UI) */
  toolCallSummaries: ToolCallSummaryOutput[];
}

/**
 * Streaming event types
 */
export type AgentStreamEvent =
  | { type: "thought"; content: string; timestamp: string }
  | { type: "text-chunk"; content: string; timestamp: string }
  | {
      type: "tool-call-start";
      toolName: string;
      toolCallId: string;
      arguments: Record<string, unknown>;
      timestamp: string;
    }
  | {
      type: "tool-call-complete";
      toolName: string;
      toolCallId: string;
      result: ToolExecutionResult;
      durationMs: number;
      timestamp: string;
    }
  | {
      type: "tool-call-error";
      toolName: string;
      toolCallId: string;
      error: string;
      timestamp: string;
    }
  | { type: "step-complete"; step: AgentStep; timestamp: string }
  | { type: "done"; result: AgentResult; timestamp: string }
  | { type: "error"; error: string; timestamp: string };

/**
 * Streaming result from agent execution
 */
export interface AgentStreamResult {
  /** Stream of events for real-time UI updates */
  eventStream: ReadableStream<AgentStreamEvent>;

  /** Promise that resolves to final result */
  result: Promise<AgentResult>;
}

/**
 * Options for agent generate/stream calls
 */
export interface GenerateOptions<TContext extends AgentContext = AgentContext> {
  /** User prompt */
  prompt: string;

  /** Execution context */
  context: TContext;

  /** Previous messages for conversation context */
  messages?: AIMessage[];

  /** Override default AI options */
  aiOptions?: Partial<AICallOptions>;
}
