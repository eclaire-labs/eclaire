/**
 * Runtime Tool Types
 *
 * Richer tool definitions with prompt contributions, structured results,
 * and progressive update support.
 */

import type { z } from "zod";

// biome-ignore lint/suspicious/noExplicitAny: intentional — Zod requires any for generic schema type alias
type AnyZodType = z.ZodType<any, any, any>;

// =============================================================================
// TOOL CONTEXT
// =============================================================================

/** Context passed to tool executions */
export interface ToolContext {
  /** User identifier for authorization */
  userId: string;
  /** Request identifier for tracing */
  requestId: string;
  /** Optional conversation/session identifier */
  sessionId?: string;
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** User-provided extension data */
  extra?: Record<string, unknown>;
}

// =============================================================================
// TOOL RESULT
// =============================================================================

/** Content block in a tool result */
export type ToolResultContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

/** Result from executing a tool */
export interface RuntimeToolResult {
  /** Structured content blocks (sent back to the model) */
  content: ToolResultContent[];
  /** Optional metadata for UI display and debugging (not sent to model) */
  details?: Record<string, unknown>;
  /** Whether this result represents an error */
  isError?: boolean;
}

/** Callback for progressive tool updates during execution */
export type ToolUpdateCallback = (update: ToolProgressInfo) => void;

/** Progressive update info from a running tool */
export interface ToolProgressInfo {
  /** What the tool is currently doing */
  status?: string;
  /** Progress fraction (0-1) if known */
  progress?: number;
  /** Partial result preview */
  preview?: string;
  /** Partial result so far */
  partialResult?: RuntimeToolResult;
}

// =============================================================================
// TOOL DEFINITION
// =============================================================================

/** Full runtime tool definition with execution, prompt contributions, and metadata */
export interface RuntimeToolDefinition<TInput extends AnyZodType = AnyZodType> {
  /** Unique tool name (used in API calls) */
  name: string;

  /** Human-readable label for UI display */
  label: string;

  /** Description for the model to understand when to use the tool */
  description: string;

  /** Zod schema for input validation and type inference */
  inputSchema: TInput;

  /** Execute the tool */
  execute: (
    callId: string,
    input: z.infer<TInput>,
    ctx: ToolContext,
    onUpdate?: ToolUpdateCallback,
  ) => Promise<RuntimeToolResult>;

  /**
   * Optional raw JSON Schema for the tool's parameters.
   * When set, `runtimeToolToOpenAI()` uses this directly instead of
   * calling `z.toJSONSchema(inputSchema)`. This allows MCP-sourced tools
   * to pass through their server-provided JSON Schema without lossy
   * JSON-Schema-to-Zod conversion.
   */
  __rawJsonSchema?: Record<string, unknown>;

  /**
   * Optional text snippet injected into the system prompt.
   * Use this for instructions the model needs to know about the tool
   * beyond the schema description.
   */
  promptSnippet?: string;

  /**
   * Optional guidelines appended as rules to the system prompt.
   * These are formatted as a bulleted list.
   */
  promptGuidelines?: string[];

  /** Where this tool is available */
  visibility?: "backend" | "cli" | "all";

  /** Whether this tool requires human approval before execution */
  needsApproval?:
    | boolean
    | ((
        input: z.infer<TInput>,
        ctx: ToolContext,
      ) => boolean | Promise<boolean>);
}

// =============================================================================
// HELPERS
// =============================================================================

/** Create a simple text-only tool result */
export function textResult(
  text: string,
  details?: Record<string, unknown>,
): RuntimeToolResult {
  return { content: [{ type: "text", text }], details };
}

/** Create an error tool result */
export function errorResult(
  error: string,
  details?: Record<string, unknown>,
): RuntimeToolResult {
  return { content: [{ type: "text", text: error }], details, isError: true };
}
