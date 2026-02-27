/**
 * Conversation CRUD operations.
 */

import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import type {
  ConversationListResponse,
  ConversationResponse,
  ConversationSummary,
  ConversationWithMessages,
  ConversationWithMessagesResponse,
} from "@/types/conversation";

/**
 * Create a new conversation
 */
export async function createConversation(
  title: string,
): Promise<ConversationSummary> {
  const response = await apiPost("/api/conversations", { title });
  const data: ConversationResponse = await response.json();
  return data.conversation;
}

/**
 * Get list of conversations
 */
export async function getConversations(
  limit = 50,
  offset = 0,
): Promise<ConversationListResponse> {
  const response = await apiGet(
    `/api/conversations?limit=${limit}&offset=${offset}`,
  );
  return response.json();
}

/**
 * Get conversation with messages
 */
export async function getConversationWithMessages(
  id: string,
): Promise<ConversationWithMessages> {
  const response = await apiGet(`/api/conversations/${id}`);
  const data: ConversationWithMessagesResponse = await response.json();
  return data.conversation;
}

/**
 * Update conversation (currently only title)
 */
export async function updateConversation(
  id: string,
  updates: { title?: string },
): Promise<ConversationSummary> {
  const response = await apiPut(`/api/conversations/${id}`, updates);
  const data: ConversationResponse = await response.json();
  return data.conversation;
}

/**
 * Delete conversation
 */
export async function deleteConversation(id: string): Promise<void> {
  await apiDelete(`/api/conversations/${id}`);
}
