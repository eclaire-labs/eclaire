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
