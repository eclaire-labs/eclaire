/**
 * Runtime Message Model
 *
 * Internal message types with structured content blocks.
 * These are richer than the wire-format AIMessage and get transformed
 * to provider-specific formats at the adapter boundary only.
 */

import type { TokenUsage } from "../types.js";

// =============================================================================
// CONTENT BLOCKS
// =============================================================================

/** Plain text content */
export interface TextBlock {
  type: "text";
  text: string;
}

/** Model thinking/reasoning content */
export interface ThinkingBlock {
  type: "thinking";
  text: string;
}

/** Tool call request from the model */
export interface ToolCallBlock {
  type: "tool_call";
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Image content (for tool results or multimodal input) */
export interface ImageBlock {
  type: "image";
  data: string;
  mimeType: string;
}

/** Content blocks that can appear in assistant messages */
export type AssistantContentBlock = TextBlock | ThinkingBlock | ToolCallBlock;

/** Content blocks that can appear in user messages */
export type UserContentBlock = TextBlock | ImageBlock;

/** Content blocks that can appear in tool result messages */
export type ResultContentBlock = TextBlock | ImageBlock;

// =============================================================================
// MESSAGES
// =============================================================================

export interface UserMessage {
  role: "user";
  content: string | UserContentBlock[];
  timestamp: number;
}

export interface AssistantMessage {
  role: "assistant";
  content: AssistantContentBlock[];
  usage?: TokenUsage;
  stopReason?: StopReason;
}

export interface ToolResultMessage {
  role: "tool_result";
  toolCallId: string;
  toolName: string;
  content: ResultContentBlock[];
  details?: Record<string, unknown>;
  isError?: boolean;
}

/** System message — used only at the LLM boundary, not stored in runtime history */
export interface SystemMessage {
  role: "system";
  content: string;
}

/** Union of all runtime message types (excluding system) */
export type RuntimeMessage = UserMessage | AssistantMessage | ToolResultMessage;

/** All messages including system (for LLM context building) */
export type AnyRuntimeMessage = RuntimeMessage | SystemMessage;

// =============================================================================
// STOP REASONS
// =============================================================================

export type StopReason =
  | "stop"
  | "tool_calls"
  | "max_tokens"
  | "content_filter"
  | "error";

// =============================================================================
// STREAMING EVENTS
// =============================================================================

/** Events emitted during agent execution for real-time UI updates */
export type RuntimeStreamEvent =
  | { type: "text_start" }
  | { type: "text_delta"; text: string }
  | { type: "text_end" }
  | { type: "thinking_start" }
  | { type: "thinking_delta"; text: string }
  | { type: "thinking_end" }
  | {
      type: "tool_call_start";
      id: string;
      name: string;
    }
  | {
      type: "tool_call_delta";
      id: string;
      argumentsDelta: string;
    }
  | {
      type: "tool_call_end";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "tool_progress";
      id: string;
      name: string;
      progress: ToolProgressUpdate;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      result: import("./tools/types.js").RuntimeToolResult;
      durationMs: number;
    }
  | {
      type: "tool_approval_required";
      id: string;
      name: string;
      label: string;
      arguments: Record<string, unknown>;
    }
  | {
      type: "tool_approval_resolved";
      id: string;
      name: string;
      approved: boolean;
      reason?: string;
    }
  | {
      type: "message_complete";
      message: AssistantMessage;
    }
  | {
      type: "turn_complete";
      messages: RuntimeMessage[];
    }
  | {
      type: "error";
      error: string;
    };

/** Progress update from a tool during execution */
export interface ToolProgressUpdate {
  /** What the tool is currently doing */
  status?: string;
  /** Progress fraction (0-1) if known */
  progress?: number;
  /** Partial result preview */
  preview?: string;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Extract the text content from a message */
export function getTextContent(message: RuntimeMessage): string {
  if (message.role === "user") {
    if (typeof message.content === "string") return message.content;
    return message.content
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  if (message.role === "assistant") {
    return message.content
      .filter((b): b is TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }
  // tool_result
  return message.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/** Extract tool calls from an assistant message */
export function getToolCalls(message: AssistantMessage): ToolCallBlock[] {
  return message.content.filter(
    (b): b is ToolCallBlock => b.type === "tool_call",
  );
}

/** Extract thinking content from an assistant message */
export function getThinkingContent(message: AssistantMessage): string {
  return message.content
    .filter((b): b is ThinkingBlock => b.type === "thinking")
    .map((b) => b.text)
    .join("");
}

/** Create a user message */
export function userMessage(content: string): UserMessage {
  return { role: "user", content, timestamp: Date.now() };
}

/** Create a system message */
export function systemMessage(content: string): SystemMessage {
  return { role: "system", content };
}
