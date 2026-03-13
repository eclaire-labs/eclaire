import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api-client";
import type { Agent, AgentCatalog } from "@/types/agent";

export interface AgentListResponse {
  items: Agent[];
}

export interface AgentPayload {
  name: string;
  description?: string | null;
  systemPrompt: string;
  toolNames?: string[];
  skillNames?: string[];
}

export async function listAgents(): Promise<AgentListResponse> {
  const response = await apiGet("/api/agents");
  return response.json();
}

export async function getAgent(id: string): Promise<Agent> {
  const response = await apiGet(`/api/agents/${id}`);
  return response.json();
}

export async function getAgentCatalog(): Promise<AgentCatalog> {
  const response = await apiGet("/api/agents/catalog");
  return response.json();
}

export async function createAgent(payload: AgentPayload): Promise<Agent> {
  const response = await apiPost("/api/agents", payload);
  return response.json();
}

export async function updateAgent(
  id: string,
  payload: Partial<AgentPayload>,
): Promise<Agent> {
  const response = await apiPut(`/api/agents/${id}`, payload);
  return response.json();
}

export async function deleteAgent(id: string): Promise<void> {
  await apiDelete(`/api/agents/${id}`);
}
