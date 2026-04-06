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

export async function createSession(
  title?: string,
  agentActorId?: string,
): Promise<Session> {
  const body: Record<string, string> = {};
  if (title) body.title = title;
  if (agentActorId) body.agentActorId = agentActorId;
  const response = await backendFetch("/api/sessions", {
    method: "POST",
    body: JSON.stringify(body),
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

// ============================================================================
// Agent API
// ============================================================================

export interface AgentSummary {
  id: string;
  name: string;
  description: string | null;
  skillNames: string[];
}

export async function listAgents(): Promise<AgentSummary[]> {
  const response = await backendFetch("/api/agents");
  if (!response.ok) {
    throw new Error(`Failed to list agents: ${response.status}`);
  }
  const data = (await response.json()) as { items: AgentSummary[] };
  return data.items;
}

// ============================================================================
// Admin API — Provider Presets, Model Import, Catalog Discovery
// ============================================================================

export interface AdminProviderPreset {
  id: string;
  name: string;
  description: string;
  isCloud: boolean;
  supportsCatalogDiscovery: boolean;
  defaultPort?: number;
  defaultEngine?: { name: string; gpuLayers?: number };
  config: {
    dialect: string;
    baseUrl: string;
    headers?: Record<string, string>;
    auth: { type: string; requiresApiKey: boolean; envVar?: string };
  };
}

export interface InspectUrlCandidate {
  suggestedModelId: string;
  name: string;
  providerModel: string;
  capabilities: {
    modalities?: { input?: string[]; output?: string[] };
    streaming?: boolean;
    tools?: boolean;
    jsonSchema?: boolean;
    structuredOutputs?: boolean;
    reasoning?: { supported?: boolean };
    contextWindow?: number;
  };
  source: { url?: string; format?: string };
  quantizations?: Array<{
    id: string;
    filename: string;
    sizeBytes: number;
  }>;
  architecture?: {
    layers: number;
    kvHeads: number;
    headDim?: number;
    maxPositionEmbeddings?: number;
    slidingWindow?: number;
    slidingWindowPattern?: number;
  };
  visionSizeBytes?: number;
}

export interface InspectUrlResult {
  sourceType: "huggingface" | "openrouter";
  candidate: InspectUrlCandidate;
}

export interface ImportModelsResult {
  created: string[];
  skipped: string[];
  defaults: Record<string, string>;
}

/**
 * Fetch provider presets from the backend.
 * Returns null if the backend is unreachable.
 */
export async function fetchProviderPresets(): Promise<
  AdminProviderPreset[] | null
> {
  try {
    const response = await backendFetch("/api/admin/provider-presets");
    if (!response.ok) return null;
    const data = (await response.json()) as { items: AdminProviderPreset[] };
    return data.items;
  } catch {
    return null;
  }
}

/**
 * Inspect a HuggingFace or OpenRouter URL via the backend.
 */
export async function inspectModelUrl(url: string): Promise<InspectUrlResult> {
  const response = await backendFetch("/api/admin/models/inspect-url", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error || `Inspection failed: ${response.status}`);
  }
  return response.json() as Promise<InspectUrlResult>;
}

// ============================================================================
// Onboarding API
// ============================================================================

export interface OnboardingState {
  status: "not_started" | "in_progress" | "completed";
  currentStep: string;
  completedSteps: string[];
  selectedPreset: string | null;
  userCount: number;
  adminExists: boolean;
  completedAt: string | null;
  completedByUserId: string | null;
}

export interface SetupPreset {
  id: string;
  name: string;
  description: string;
  audience: string;
  isCloud: boolean;
  requiresApiKey: boolean;
  providers: Array<{
    presetId: string;
    idSuffix?: string;
    portOverride?: number;
    nameOverride?: string;
  }>;
}

export interface HealthCheckResult {
  db: { ok: boolean; error?: string };
  docling: { ok: boolean; error?: string };
  providers: Array<{ id: string; name: string; ok: boolean; error?: string }>;
  modelSelections: { backend: string | null; workers: string | null };
}

export interface StepAdvanceResult {
  ok: boolean;
  state: OnboardingState;
  warning?: string;
  error?: string;
}

export async function fetchOnboardingState(): Promise<OnboardingState | null> {
  try {
    const response = await backendFetch("/api/onboarding/state");
    if (!response.ok) return null;
    return response.json() as Promise<OnboardingState>;
  } catch {
    return null;
  }
}

export async function fetchSetupPresets(): Promise<SetupPreset[] | null> {
  try {
    const response = await backendFetch("/api/onboarding/presets");
    if (!response.ok) return null;
    const data = (await response.json()) as { items: SetupPreset[] };
    return data.items;
  } catch {
    return null;
  }
}

export async function advanceOnboardingStep(
  step: string,
  data?: Record<string, unknown>,
): Promise<StepAdvanceResult> {
  const response = await backendFetch(`/api/onboarding/step/${step}`, {
    method: "POST",
    body: JSON.stringify(data ?? {}),
  });
  return response.json() as Promise<StepAdvanceResult>;
}

export async function runOnboardingHealthCheck(): Promise<HealthCheckResult> {
  const response = await backendFetch("/api/onboarding/health-check", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json() as Promise<HealthCheckResult>;
}

export async function completeOnboardingViaApi(): Promise<OnboardingState> {
  const response = await backendFetch("/api/onboarding/complete", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to complete onboarding: ${response.status}`);
  }
  return response.json() as Promise<OnboardingState>;
}

export async function resetOnboardingViaApi(): Promise<OnboardingState> {
  const response = await backendFetch("/api/onboarding/reset", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to reset onboarding: ${response.status}`);
  }
  return response.json() as Promise<OnboardingState>;
}

/**
 * Import models via the backend API.
 */
export async function importModelsViaApi(
  models: Array<{
    id: string;
    name: string;
    provider: string;
    providerModel: string;
    capabilities: Record<string, unknown>;
    source?: Record<string, unknown>;
  }>,
  setDefaults?: { backend?: string; workers?: string },
): Promise<ImportModelsResult> {
  const response = await backendFetch("/api/admin/models/import", {
    method: "POST",
    body: JSON.stringify({ models, setDefaults }),
  });
  if (!response.ok) {
    const data = (await response.json()) as { error?: string };
    throw new Error(data.error || `Import failed: ${response.status}`);
  }
  return response.json() as Promise<ImportModelsResult>;
}
