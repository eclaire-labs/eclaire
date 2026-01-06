/**
 * Tool Types
 *
 * Type definitions for AI tool calling support.
 * Re-exports from main types for convenience.
 */

// Re-export tool types from main types file
export type {
  JSONSchema,
  ToolCallResult,
  ToolChoice,
  ToolDefinition,
} from "../types.js";

// =============================================================================
// TOOL RESULT TYPES
// =============================================================================

/**
 * Result of executing a tool call
 */
export interface ToolExecutionResult {
  /**
   * Whether the tool executed successfully
   */
  success: boolean;

  /**
   * The result content to send back to the AI
   */
  content: string;

  /**
   * Optional error message if execution failed
   */
  error?: string;
}

/**
 * Tool executor function type
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

/**
 * Registry of available tools
 */
export interface ToolRegistry {
  /**
   * Get a tool executor by name
   */
  getExecutor(name: string): ToolExecutor | undefined;

  /**
   * Get all tool definitions
   */
  getDefinitions(): import("../types.js").ToolDefinition[];

  /**
   * Check if a tool exists
   */
  hasTool(name: string): boolean;
}

// =============================================================================
// TOOL CALL SUMMARY TYPES
// =============================================================================

/**
 * Input for creating a tool call summary
 */
export interface ToolCallSummaryInput {
  /**
   * Name of the tool that was called
   */
  functionName: string;

  /**
   * How long the tool took to execute in milliseconds
   */
  executionTimeMs: number;

  /**
   * Arguments passed to the tool
   */
  arguments: Record<string, unknown>;

  /**
   * Whether the tool executed successfully
   */
  success: boolean;

  /**
   * Error message if the tool failed
   */
  error?: string;

  /**
   * Result returned by the tool (will be summarized)
   */
  result?: unknown;
}

/**
 * Output from creating a tool call summary (for UI display)
 */
export interface ToolCallSummaryOutput {
  /**
   * Name of the tool that was called
   */
  functionName: string;

  /**
   * How long the tool took to execute in milliseconds
   */
  executionTimeMs: number;

  /**
   * Whether the tool executed successfully
   */
  success: boolean;

  /**
   * Error message if the tool failed
   */
  error?: string;

  /**
   * JSON-safe copy of the arguments (may be omitted if serialization fails)
   */
  arguments?: Record<string, unknown>;

  /**
   * Human-readable summary of the result
   */
  resultSummary?: string;
}
