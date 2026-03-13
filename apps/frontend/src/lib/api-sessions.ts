/**
 * Session CRUD operations.
 * Replacement for api-conversations.ts — talks to /api/sessions endpoints.
 */

import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import type {
  ConversationListResponse,
  ConversationSummary,
  ConversationWithMessages,
} from "@/types/conversation";

// Type aliases — the backend returns the same DB rows as before
export type Session = ConversationSummary;
export type SessionWithMessages = ConversationWithMessages;
export type SessionListResponse = ConversationListResponse;

/**
 * Create a new session
 */
export async function createSession(options?: {
  title?: string;
  agentActorId?: string;
}): Promise<Session> {
  const response = await apiPost("/api/sessions", options ?? {});
  return response.json();
}

/**
 * List sessions
 */
export async function listSessions(
  limit = 50,
  offset = 0,
  agentActorId?: string,
): Promise<SessionListResponse> {
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
  });
  if (agentActorId) {
    params.set("agentActorId", agentActorId);
  }
  const response = await apiGet(`/api/sessions?${params.toString()}`);
  return response.json();
}

/**
 * Get session with messages
 */
export async function getSessionWithMessages(
  id: string,
): Promise<SessionWithMessages> {
  const response = await apiGet(`/api/sessions/${id}`);
  return response.json();
}

/**
 * Update session (currently only title)
 */
export async function updateSession(
  id: string,
  updates: { title?: string },
): Promise<Session> {
  const response = await apiPut(`/api/sessions/${id}`, updates);
  return response.json();
}

/**
 * Delete session
 */
export async function deleteSession(id: string): Promise<void> {
  await apiDelete(`/api/sessions/${id}`);
}

/**
 * Abort a running session execution
 */
export async function abortSession(id: string): Promise<boolean> {
  const response = await apiPost(`/api/sessions/${id}/abort`);
  const data = await response.json();
  return data.aborted;
}
