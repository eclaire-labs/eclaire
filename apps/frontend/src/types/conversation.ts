/**
 * Conversation type definitions for the frontend
 * This is the single source of truth for conversation-related types
 */

import type { Message, ToolCallSummary } from "./message";

export interface ConversationSummary {
  id: string;
  userId: string;
  title: string;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastMessageAt: Date | string | null;
  messageCount: number;
}

// For API responses, we need a version that uses backend message format
export interface BackendMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummary[];
  createdAt: Date | string;
  metadata?: Record<string, unknown>;
}

export interface ConversationWithMessages extends ConversationSummary {
  messages: BackendMessage[];
}

// Frontend version with converted messages
export interface ConversationWithFrontendMessages extends ConversationSummary {
  messages: Message[];
}

export interface ConversationListResponse {
  status: "OK";
  conversations: ConversationSummary[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
}

export interface ConversationResponse {
  status: "OK";
  conversation: ConversationSummary;
}

export interface ConversationWithMessagesResponse {
  status: "OK";
  conversation: ConversationWithMessages;
}
