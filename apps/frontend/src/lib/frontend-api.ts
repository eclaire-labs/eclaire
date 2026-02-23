/**
 * Frontend API utilities for making requests to the backend
 * This ensures all API calls use the correct backend URL configured in environment variables
 */

/**
 * Get the backend API URL from environment variables
 * Falls back to localhost:3001 if not set
 */
function getBackendUrl(): string {
  return ""; // Use relative URLs - requests go through Next.js proxy
}

/**
 * Helper function to handle authentication errors
 */
function handleAuthError() {
  if (typeof window !== "undefined") {
    // Get current path to redirect back after login
    const currentPath = window.location.pathname;
    const loginUrl = new URL("/auth/login", window.location.origin);

    // Only set callback URL if not already on auth pages
    if (!currentPath.includes("/auth")) {
      loginUrl.searchParams.set("callbackUrl", encodeURI(currentPath));
    }

    window.location.href = loginUrl.toString();
  }
}

/**
 * Enhanced fetch that automatically uses the correct backend URL
 * Use this instead of direct fetch() calls to API endpoints
 */
export async function apiFetch(
  endpoint: string,
  options: RequestInit = {},
): Promise<Response> {
  return apiFetchWithRetry(endpoint, options, 3);
}

/**
 * Internal function that handles retries for network errors
 */
async function apiFetchWithRetry(
  endpoint: string,
  options: RequestInit = {},
  maxRetries: number = 3,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Ensure endpoint starts with /
      const normalizedEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;

      // Construct full URL with backend base URL
      const url = `${getBackendUrl()}${normalizedEndpoint}`;

      // Default headers
      const defaultHeaders: HeadersInit = {};

      // Only set Content-Type to application/json if body is not FormData
      if (options.body && !(options.body instanceof FormData)) {
        defaultHeaders["Content-Type"] = "application/json";
      }

      // Merge headers
      const headers = {
        ...defaultHeaders,
        ...(options.headers || {}),
      };

      // Make the request with the full URL and include credentials for Better Auth
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: "include", // Essential for Better Auth session cookies
      });

      // Handle different HTTP status codes
      if (response.status === 401) {
        handleAuthError();
        throw new Error("Authentication required. Redirecting to login...");
      }

      // Handle other client errors (4xx) - don't retry these
      if (response.status >= 400 && response.status < 500) {
        let errorMessage = `Request failed with status ${response.status}`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch {
          // If JSON parsing fails, use the status text
          errorMessage = response.statusText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Handle server errors (5xx) - retry these
      if (response.status >= 500) {
        throw new Error(
          `Server error: ${response.status} ${response.statusText}`,
        );
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx) or auth errors
      if (
        lastError.message.includes("Authentication required") ||
        lastError.message.includes("Request failed with status 4")
      ) {
        throw lastError;
      }

      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }

      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * 2 ** attempt, 5000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but just in case
  throw lastError || new Error("Request failed after all retries");
}

/**
 * Convenience wrapper for GET requests
 */
export async function apiGet(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: "GET" });
}

/**
 * Convenience wrapper for POST requests
 */
// biome-ignore lint/suspicious/noExplicitAny: API request body type varies by endpoint
export async function apiPost(endpoint: string, data?: any): Promise<Response> {
  const body = data instanceof FormData ? data : JSON.stringify(data);
  return apiFetch(endpoint, {
    method: "POST",
    body: data ? body : undefined,
  });
}

/**
 * Convenience wrapper for PUT requests
 */
// biome-ignore lint/suspicious/noExplicitAny: API request body type varies by endpoint
export async function apiPut(endpoint: string, data?: any): Promise<Response> {
  const body = data instanceof FormData ? data : JSON.stringify(data);
  return apiFetch(endpoint, {
    method: "PUT",
    body: data ? body : undefined,
  });
}

/**
 * Convenience wrapper for DELETE requests
 */
export async function apiDelete(endpoint: string): Promise<Response> {
  return apiFetch(endpoint, { method: "DELETE" });
}

/**
 * Convert a relative API URL to an absolute URL using the backend base URL
 * This is useful for image URLs that need to be used in <img> src attributes
 *
 * @param relativeUrl - Relative URL like "/api/photos/123/view"
 * @returns Absolute URL like "http://localhost:3001/api/photos/123/view"
 */
export function getAbsoluteApiUrl(relativeUrl: string): string {
  if (!relativeUrl) return relativeUrl;

  // If it's already an absolute URL, return as is
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }

  // Ensure the URL starts with /
  const normalizedUrl = relativeUrl.startsWith("/")
    ? relativeUrl
    : `/${relativeUrl}`;

  // Construct absolute URL
  return `${getBackendUrl()}${normalizedUrl}`;
}

/**
 * Pin/Flag API utilities for content management
 */

/**
 * Toggle pin status for any content type
 */
export async function togglePin(
  contentType: "bookmarks" | "tasks" | "notes" | "photos" | "documents",
  id: string,
  isPinned: boolean,
): Promise<Response> {
  return apiFetch(`/api/${contentType}/${id}/pin`, {
    method: "PATCH",
    body: JSON.stringify({ isPinned }),
  });
}

/**
 * Set flag color for any content type
 */
export async function setFlagColor(
  contentType: "bookmarks" | "tasks" | "notes" | "photos" | "documents",
  id: string,
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null,
): Promise<Response> {
  return apiFetch(`/api/${contentType}/${id}/flag`, {
    method: "PATCH",
    body: JSON.stringify({ flagColor }),
  });
}

/**
 * Update review status for any content type
 */
export async function updateReviewStatus(
  contentType: "bookmarks" | "tasks" | "notes" | "photos" | "documents",
  id: string,
  reviewStatus: "pending" | "accepted" | "rejected",
): Promise<Response> {
  return apiFetch(`/api/${contentType}/${id}/review`, {
    method: "PATCH",
    body: JSON.stringify({ reviewStatus }),
  });
}

/**
 * Import and re-export conversation types from centralized location
 */
import type {
  BackendMessage,
  ConversationListResponse,
  ConversationResponse,
  ConversationSummary,
  ConversationWithMessages,
  ConversationWithMessagesResponse,
} from "@/types/conversation";

// Re-export for backwards compatibility
export type {
  ConversationSummary,
  ConversationWithMessages,
  ConversationListResponse,
  ConversationResponse,
  ConversationWithMessagesResponse,
  BackendMessage,
};

/**
 * Conversation API utilities
 */

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

/**
 * User and Task Comments API utilities
 */

import type { TaskComment, User } from "@/types/task";

/**
 * Get all users (for assignee dropdown)
 */
export async function getUsers(): Promise<User[]> {
  const response = await apiGet("/api/user");
  if (!response.ok) {
    throw new Error("Failed to fetch user data");
  }
  const data = await response.json();
  // Extract availableAssignees from the user response
  return data.availableAssignees || [];
}

/**
 * Get users by type (for filtering assistants vs humans)
 */
export async function getUsersByType(
  userType?: "user" | "assistant" | "worker",
): Promise<User[]> {
  const allUsers = await getUsers();
  if (!userType) {
    return allUsers;
  }
  return allUsers.filter((user) => user.userType === userType);
}

/**
 * Task Comments API
 */

/**
 * Get comments for a task
 */
export async function getTaskComments(taskId: string): Promise<TaskComment[]> {
  const response = await apiGet(`/api/tasks/${taskId}/comments`);
  if (!response.ok) {
    throw new Error("Failed to fetch task comments");
  }
  return response.json();
}

/**
 * Create a new comment on a task
 */
export async function createTaskComment(
  taskId: string,
  content: string,
): Promise<TaskComment> {
  const response = await apiPost(`/api/tasks/${taskId}/comments`, { content });
  if (!response.ok) {
    throw new Error("Failed to create comment");
  }
  return response.json();
}

/**
 * Update a task comment
 */
export async function updateTaskComment(
  taskId: string,
  commentId: string,
  content: string,
): Promise<TaskComment> {
  const response = await apiPut(`/api/tasks/${taskId}/comments/${commentId}`, {
    content,
  });
  if (!response.ok) {
    throw new Error("Failed to update comment");
  }
  return response.json();
}

/**
 * Delete a task comment
 */
export async function deleteTaskComment(
  taskId: string,
  commentId: string,
): Promise<void> {
  const response = await apiDelete(
    `/api/tasks/${taskId}/comments/${commentId}`,
  );
  if (!response.ok) {
    throw new Error("Failed to delete comment");
  }
}

// --- AI Assistant Types ---

// Import AssetReference from centralized types
import type { AssetReference } from "@/types/message";

// Re-export for backwards compatibility
export type { AssetReference };

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

export interface ToolCallSummary {
  functionName: string;
  executionTimeMs: number;
  success: boolean;
  error?: string;
  // biome-ignore lint/suspicious/noExplicitAny: tool call arguments are arbitrary JSON from AI tools
  arguments?: Record<string, any>;
  resultSummary?: string;
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
 * Send a prompt with user's thinking preference automatically applied
 * This is a convenience wrapper around sendPrompt that reads assistant preferences
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
