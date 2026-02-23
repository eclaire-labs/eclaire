/**
 * Message and related type definitions for the frontend
 * This is the single source of truth for message-related types
 */

// Tool call summary from backend API
export interface ToolCallSummary {
  functionName: string;
  executionTimeMs: number;
  success: boolean;
  error?: string;
  // biome-ignore lint/suspicious/noExplicitAny: tool call arguments are arbitrary JSON from various AI tools
  arguments?: Record<string, any>;
  resultSummary?: string;
}

export interface ContentLink {
  type: "bookmark" | "document" | "photo" | "task" | "note";
  id: string;
  url: string;
  title?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface AssetReference {
  type: "note" | "bookmark" | "document" | "photo" | "task";
  id: string;
  title?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  imageUrl?: string;
  isError?: boolean;
  contentLinks?: ContentLink[];
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummary[];
}

export interface TextResponse {
  type: "text_response";
  response: string;
  status?: string;
  requestId?: string;
}

export type AssistantResponse = TextResponse;

/**
 * Convert backend ToolCallSummary to frontend ToolCall format for ToolExecutionTracker
 */
export function convertToToolCall(
  summary: ToolCallSummary,
  index: number,
): import("@/components/ui/tool-execution-tracker").ToolCall {
  return {
    id: `${summary.functionName}-${index}`,
    name: summary.functionName,
    status: summary.success ? "completed" : "error",
    arguments: summary.arguments,
    result:
      summary.resultSummary ||
      (summary.success ? "Operation completed" : undefined),
    error: summary.error,
    startTime: new Date(Date.now() - summary.executionTimeMs),
    endTime: new Date(),
  };
}

/**
 * Convert streaming ToolCall[] to ToolCallSummary[] for message storage
 */
export function convertToToolCallSummary(
  toolCall: import("@/components/ui/tool-execution-tracker").ToolCall,
): ToolCallSummary {
  const executionTimeMs =
    toolCall.startTime && toolCall.endTime
      ? toolCall.endTime.getTime() - toolCall.startTime.getTime()
      : 0;

  return {
    functionName: toolCall.name,
    executionTimeMs,
    success: toolCall.status === "completed",
    error: toolCall.error,
    arguments: toolCall.arguments,
    resultSummary:
      typeof toolCall.result === "string" ? toolCall.result : undefined,
  };
}
