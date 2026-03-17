import { apiGet } from "@/lib/api-client";

export interface ModelSummary {
  id: string;
  name: string;
  provider: string;
  agentRuntimeKind: "native" | "external_harness";
  capabilities: {
    tools: boolean;
    streaming: boolean;
    contextWindow: number;
    reasoning: boolean;
    inputModalities: string[];
  };
}

export interface ModelsListResponse {
  items: ModelSummary[];
}

export async function listModels(): Promise<ModelsListResponse> {
  const response = await apiGet("/api/models");
  return response.json();
}
