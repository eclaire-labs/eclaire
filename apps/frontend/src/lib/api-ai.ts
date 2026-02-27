/**
 * AI prompt types and functions for the assistant feature.
 */

import { apiFetch } from "@/lib/api-client";
import type { AssetReference, ToolCallSummary } from "@/types/message";

// Re-export for convenience so consumers don't need a second import
export type { AssetReference, ToolCallSummary };

export interface PromptRequest {
  prompt: string;
  conversationId?: string;
  context?: {
    agent?: string;
    assets?: AssetReference[];
  };
  deviceInfo?: {
    userAgent?: string;
    dateTime?: string;
    timeZone?: string;
    screenWidth?: string;
    screenHeight?: string;
    app?: { name: string; version: string };
  };
  trace?: boolean;
  enableThinking?: boolean;
}

export interface PromptResponse {
  type: "text_response";
  response: string;
  requestId: string;
  conversationId?: string;
  thinkingContent?: string;
  toolCalls?: ToolCallSummary[];
  // biome-ignore lint/suspicious/noExplicitAny: trace data has variable structure from AI provider
  trace?: any;
}

/**
 * Send a prompt to the AI assistant (non-streaming)
 */
export async function sendPrompt(
  request: PromptRequest,
): Promise<PromptResponse> {
  const response = await apiFetch("/api/prompt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Send a prompt with user's thinking preference automatically applied.
 * Convenience wrapper around sendPrompt that reads assistant preferences.
 */
export async function sendPromptWithPreferences(
  request: Omit<PromptRequest, "enableThinking">,
  enableThinking?: boolean,
): Promise<PromptResponse> {
  return sendPrompt({
    ...request,
    enableThinking,
  });
}
