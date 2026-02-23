/**
 * Native Tool Calling Support
 *
 * Helpers for working with native tool calling (function calling) APIs.
 */

import { createAILogger } from "../logger.js";
import type { AIMessage, ToolCallResult, ToolDefinition } from "../types.js";
import type {
  ToolCallSummaryInput,
  ToolCallSummaryOutput,
  ToolExecutionResult,
  ToolRegistry,
} from "./types.js";

// Lazy-initialized logger
let _logger: ReturnType<typeof createAILogger> | null = null;
function getLogger() {
  if (!_logger) {
    _logger = createAILogger("ai-tools");
  }
  return _logger;
}

// =============================================================================
// TOOL CALL PARSING
// =============================================================================

/**
 * Parse tool call arguments from JSON string
 */
export function parseToolCallArguments(
  args: string,
): Record<string, unknown> | null {
  try {
    return JSON.parse(args);
  } catch (error) {
    const logger = getLogger();
    logger.warn(
      { args, error: error instanceof Error ? error.message : "Unknown" },
      "Failed to parse tool call arguments",
    );
    return null;
  }
}

/**
 * Check if a response contains tool calls
 */
export function hasToolCalls(response: {
  toolCalls?: ToolCallResult[];
}): boolean {
  return !!response.toolCalls && response.toolCalls.length > 0;
}

/**
 * Get tool names from a response
 */
export function getToolNames(toolCalls: ToolCallResult[]): string[] {
  return toolCalls.map((tc) => tc.function.name);
}

// =============================================================================
// TOOL EXECUTION
// =============================================================================

/**
 * Execute a single tool call
 */
export async function executeToolCall(
  toolCall: ToolCallResult,
  registry: ToolRegistry,
): Promise<ToolExecutionResult> {
  const logger = getLogger();
  const { name, arguments: argsString } = toolCall.function;

  logger.debug({ toolName: name }, "Executing tool call");

  // Get executor
  const executor = registry.getExecutor(name);
  if (!executor) {
    logger.warn({ toolName: name }, "Tool not found in registry");
    return {
      success: false,
      content: "",
      error: `Tool '${name}' not found`,
    };
  }

  // Parse arguments
  const args = parseToolCallArguments(argsString);
  if (args === null) {
    return {
      success: false,
      content: "",
      error: `Invalid arguments for tool '${name}'`,
    };
  }

  // Execute
  try {
    const result = await executor(args);
    logger.debug(
      { toolName: name, success: result.success },
      "Tool execution complete",
    );
    return result;
  } catch (error) {
    logger.error(
      {
        toolName: name,
        error: error instanceof Error ? error.message : "Unknown",
      },
      "Tool execution failed",
    );
    return {
      success: false,
      content: "",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Execute all tool calls and return results
 */
export async function executeAllToolCalls(
  toolCalls: ToolCallResult[],
  registry: ToolRegistry,
): Promise<Map<string, ToolExecutionResult>> {
  const results = new Map<string, ToolExecutionResult>();

  // Execute in parallel for efficiency
  const promises = toolCalls.map(async (tc) => {
    const result = await executeToolCall(tc, registry);
    return { id: tc.id, result };
  });

  const resolved = await Promise.all(promises);

  for (const { id, result } of resolved) {
    results.set(id, result);
  }

  return results;
}

// =============================================================================
// MESSAGE BUILDING
// =============================================================================

/**
 * Build an assistant message with tool calls
 */
export function buildAssistantToolCallMessage(
  toolCalls: ToolCallResult[],
): AIMessage {
  return {
    role: "assistant",
    content: "",
    tool_calls: toolCalls,
  };
}

/**
 * Build a tool result message
 */
export function buildToolResultMessage(
  toolCallId: string,
  toolName: string,
  result: ToolExecutionResult,
): AIMessage {
  return {
    role: "tool",
    content: result.success
      ? result.content
      : `Error: ${result.error || "Unknown error"}`,
    name: toolName,
    tool_call_id: toolCallId,
  };
}

/**
 * Build all tool result messages from execution results
 */
export function buildToolResultMessages(
  toolCalls: ToolCallResult[],
  results: Map<string, ToolExecutionResult>,
): AIMessage[] {
  return toolCalls.map((tc) => {
    const result = results.get(tc.id);
    if (!result) {
      return buildToolResultMessage(tc.id, tc.function.name, {
        success: false,
        content: "",
        error: "No result found for tool call",
      });
    }
    return buildToolResultMessage(tc.id, tc.function.name, result);
  });
}

// =============================================================================
// TOOL DEFINITION HELPERS
// =============================================================================

/**
 * Create a tool definition
 */
export function createToolDefinition(
  name: string,
  description: string,
  parameters: Record<string, unknown>,
): ToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters,
    },
  };
}

/**
 * Create a simple object schema for tool parameters
 */
export function createObjectSchema(
  properties: Record<string, unknown>,
  required?: string[],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required: required || Object.keys(properties),
  };
}

// =============================================================================
// TOOL LOOP HELPERS
// =============================================================================

/**
 * Options for the tool call loop
 */
export interface ToolLoopOptions {
  /**
   * Maximum number of tool call rounds before stopping
   */
  maxRounds?: number;

  /**
   * Callback for each tool execution result
   */
  onToolResult?: (
    toolCall: ToolCallResult,
    result: ToolExecutionResult,
  ) => void;
}

/**
 * Result of a tool call loop
 */
export interface ToolLoopResult {
  /**
   * All messages including tool calls and results
   */
  messages: AIMessage[];

  /**
   * Number of tool call rounds executed
   */
  rounds: number;

  /**
   * Whether the loop was stopped due to max rounds
   */
  stoppedAtMax: boolean;
}

/**
 * Check if we should continue the tool call loop
 */
export function shouldContinueToolLoop(
  response: { toolCalls?: ToolCallResult[]; finishReason?: string },
  currentRound: number,
  maxRounds: number,
): boolean {
  const logger = getLogger();

  // Stop if we've hit max rounds
  if (currentRound >= maxRounds) {
    logger.debug(
      { currentRound, maxRounds },
      "Stopping tool loop at max rounds",
    );
    return false;
  }

  // Continue if there are tool calls
  if (hasToolCalls(response)) {
    return true;
  }

  // Stop otherwise
  return false;
}

// =============================================================================
// TOOL CALL SUMMARY
// =============================================================================

/**
 * Create a JSON-safe deep copy of an object
 * Falls back to shallow copy if JSON serialization fails
 */
function safeJsonCopy<T>(obj: T): T | undefined {
  try {
    return JSON.parse(JSON.stringify(obj)) as T;
  } catch {
    return undefined;
  }
}

/**
 * Create a human-readable summary of a tool result
 */
function summarizeResult(result: unknown, error?: string): string {
  if (error) {
    return `Error: ${error}`;
  }

  if (result === undefined || result === null) {
    return "Operation completed";
  }

  if (Array.isArray(result)) {
    return `Found ${result.length} item${result.length === 1 ? "" : "s"}`;
  }

  if (typeof result === "object") {
    const keys = Object.keys(result);
    if (keys.length > 0) {
      return `Retrieved data with ${keys.length} field${keys.length === 1 ? "" : "s"}`;
    }
    return "Operation completed successfully";
  }

  if (typeof result === "string") {
    return result.length > 100 ? `${result.substring(0, 100)}...` : result;
  }

  return "Operation completed successfully";
}

/**
 * Create a tool call summary for UI display
 *
 * This function handles:
 * - JSON-safe serialization of arguments (catches circular refs, functions, etc.)
 * - Human-readable summarization of results
 *
 * @param input - Tool call execution details
 * @returns Summary suitable for UI display
 */
export function createToolCallSummary(
  input: ToolCallSummaryInput,
): ToolCallSummaryOutput {
  const {
    functionName,
    executionTimeMs,
    arguments: args,
    success,
    error,
    result,
  } = input;

  return {
    functionName,
    executionTimeMs,
    success,
    error,
    arguments: safeJsonCopy(args),
    resultSummary: summarizeResult(result, error),
  };
}
