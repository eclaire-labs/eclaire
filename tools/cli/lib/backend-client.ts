/**
 * Backend API client for the CLI.
 *
 * Calls the Eclaire backend HTTP API instead of AI providers directly.
 * Configured via ECLAIRE_BACKEND_URL and ECLAIRE_API_KEY env vars.
 */

const DEFAULT_BACKEND_URL = "http://localhost:3000";

function getBackendUrl(): string {
  return (process.env.ECLAIRE_BACKEND_URL || DEFAULT_BACKEND_URL).replace(
    /\/$/,
    "",
  );
}

function getApiKey(): string | undefined {
  return process.env.ECLAIRE_API_KEY;
}

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const apiKey = getApiKey();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
}

export async function backendFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const url = `${getBackendUrl()}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...getHeaders(),
      ...(options.headers as Record<string, string>),
    },
  });
  return response;
}

export interface ModelInfo {
  provider: string;
  modelShortName: string;
  modelFullName: string;
  capabilities: {
    stream: boolean;
    thinking?: { supported: boolean };
  };
}

export async function getModelInfo(): Promise<ModelInfo> {
  const response = await backendFetch("/api/model");
  if (!response.ok) {
    throw new Error(
      `Failed to get model info: ${response.status} ${response.statusText}`,
    );
  }
  return response.json() as Promise<ModelInfo>;
}

// ============================================================================
// Session API
// ============================================================================

export interface Session {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface SessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string | null;
  createdAt: string;
}

export interface SessionWithMessages extends Session {
  messages: SessionMessage[];
}

export interface SendOptions {
  enableThinking?: boolean;
}

export async function createSession(title?: string): Promise<Session> {
  const response = await backendFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify(title ? { title } : {}),
  });
  if (!response.ok) {
    throw new Error(`Failed to create session: ${response.status}`);
  }
  return response.json() as Promise<Session>;
}

export async function listSessions(limit?: number): Promise<Session[]> {
  const params = limit ? `?limit=${limit}` : "";
  const response = await backendFetch(`/api/sessions${params}`);
  if (!response.ok) {
    throw new Error(`Failed to list sessions: ${response.status}`);
  }
  const data = (await response.json()) as { items: Session[] };
  return data.items;
}

export async function getSession(id: string): Promise<SessionWithMessages> {
  const response = await backendFetch(`/api/sessions/${id}`);
  if (!response.ok) {
    throw new Error(`Failed to get session: ${response.status}`);
  }
  return response.json() as Promise<SessionWithMessages>;
}

export async function deleteSession(id: string): Promise<void> {
  const response = await backendFetch(`/api/sessions/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(`Failed to delete session: ${response.status}`);
  }
}

export async function sendMessage(
  sessionId: string,
  prompt: string,
  options?: SendOptions,
): Promise<Response> {
  return backendFetch(`/api/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      prompt,
      enableThinking: options?.enableThinking,
    }),
  });
}

export async function abortSession(sessionId: string): Promise<boolean> {
  const response = await backendFetch(`/api/sessions/${sessionId}/abort`, {
    method: "POST",
  });
  if (!response.ok) {
    return false;
  }
  const data = (await response.json()) as { aborted: boolean };
  return data.aborted;
}
