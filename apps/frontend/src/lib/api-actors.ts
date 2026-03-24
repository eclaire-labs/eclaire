import { apiDelete, apiFetch, apiGet, apiPost } from "@/lib/api-client";

export type ActorKind = "human" | "agent" | "system" | "service";

export interface ActorSummary {
  id: string;
  kind: ActorKind;
  displayName: string | null;
}

export interface ActorListResponse {
  items: ActorSummary[];
}

export interface ApiKeyScopeCatalogItem {
  scope: string;
  label: string;
  description: string;
}

export type DataAccessLevel = "read" | "read_write";
export type AdminAccessLevel = "none" | "read" | "read_write";

export interface AccessLevelInfo {
  label: string;
  description: string;
}

export interface ActorApiKey {
  id: string;
  actor: ActorSummary;
  grantId: string;
  displayKey: string;
  name: string;
  scopes: string[];
  dataAccess: DataAccessLevel | null;
  adminAccess: AdminAccessLevel | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  key?: string;
}

export interface ActorApiKeyListResponse {
  items: ActorApiKey[];
}

export interface CreateActorApiKeyPayload {
  name?: string;
  dataAccess: DataAccessLevel;
  adminAccess: AdminAccessLevel;
}

export interface UpdateActorApiKeyPayload {
  name?: string;
  dataAccess?: DataAccessLevel;
  adminAccess?: AdminAccessLevel;
}

export async function listActors(): Promise<ActorListResponse> {
  const response = await apiGet("/api/actors");
  return response.json();
}

export async function listActorCredentialScopes(): Promise<{
  items: ApiKeyScopeCatalogItem[];
  dataAccessLevels: Record<DataAccessLevel, AccessLevelInfo>;
  adminAccessLevels: Record<AdminAccessLevel, AccessLevelInfo>;
}> {
  const response = await apiGet("/api/actors/credential-scopes");
  return response.json();
}

export async function listActorApiKeys(
  actorId: string,
): Promise<ActorApiKeyListResponse> {
  const response = await apiGet(`/api/actors/${actorId}/api-keys`);
  return response.json();
}

export async function createActorApiKey(
  actorId: string,
  payload: CreateActorApiKeyPayload,
): Promise<ActorApiKey> {
  const response = await apiPost(`/api/actors/${actorId}/api-keys`, payload);
  return response.json();
}

export async function updateActorApiKey(
  actorId: string,
  keyId: string,
  payload: UpdateActorApiKeyPayload,
): Promise<ActorApiKey> {
  const response = await apiFetch(`/api/actors/${actorId}/api-keys/${keyId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return response.json();
}

export async function deleteActorApiKey(
  actorId: string,
  keyId: string,
): Promise<void> {
  await apiDelete(`/api/actors/${actorId}/api-keys/${keyId}`);
}

export async function createServiceActor(
  displayName: string,
): Promise<ActorSummary> {
  const response = await apiPost("/api/actors/services", { displayName });
  return response.json();
}

export async function deleteServiceActor(actorId: string): Promise<void> {
  await apiDelete(`/api/actors/services/${actorId}`);
}
