import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { useAuth } from "@/hooks/use-auth";
import {
  createActorApiKey,
  createServiceActor,
  deleteActorApiKey,
  deleteServiceActor,
  listActorApiKeys,
  listActorCredentialScopes,
  listActors,
  updateActorApiKey,
  type AccessLevelInfo,
  type ActorApiKey,
  type ActorSummary,
  type AdminAccessLevel,
  type ApiKeyScopeCatalogItem,
  type CreateActorApiKeyPayload,
  type DataAccessLevel,
  type UpdateActorApiKeyPayload,
} from "@/lib/api-actors";

export interface ActorApiKeyGroup {
  actor: ActorSummary;
  apiKeys: ActorApiKey[];
}

interface UseApiKeysResult {
  actorGroups: ActorApiKeyGroup[];
  scopeCatalog: ApiKeyScopeCatalogItem[];
  dataAccessLevels: Record<DataAccessLevel, AccessLevelInfo>;
  adminAccessLevels: Record<AdminAccessLevel, AccessLevelInfo>;
  isLoading: boolean;
  error: Error | null;
  createApiKey: (
    actorId: string,
    payload: CreateActorApiKeyPayload,
  ) => Promise<ActorApiKey | null>;
  updateApiKey: (
    actorId: string,
    keyId: string,
    payload: UpdateActorApiKeyPayload,
  ) => Promise<boolean>;
  deleteApiKey: (actorId: string, keyId: string) => Promise<boolean>;
  createExternalSystem: (displayName: string) => Promise<ActorSummary | null>;
  deleteExternalSystem: (actorId: string) => Promise<boolean>;
}

const MANAGEABLE_KINDS = new Set<ActorSummary["kind"]>([
  "human",
  "agent",
  "service",
]);

export function useApiKeys(): UseApiKeysResult {
  const { data: session, isPending: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading: isQueryLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["actor-api-keys"],
    queryFn: async (): Promise<{
      actorGroups: ActorApiKeyGroup[];
      scopeCatalog: ApiKeyScopeCatalogItem[];
      dataAccessLevels: Record<DataAccessLevel, AccessLevelInfo>;
      adminAccessLevels: Record<AdminAccessLevel, AccessLevelInfo>;
    }> => {
      const [
        { items: actors },
        { items: scopeCatalog, dataAccessLevels, adminAccessLevels },
      ] = await Promise.all([listActors(), listActorCredentialScopes()]);

      const manageableActors = actors.filter(
        (actor) =>
          MANAGEABLE_KINDS.has(actor.kind) &&
          actor.id !== DEFAULT_AGENT_ACTOR_ID,
      );

      const actorGroups = await Promise.all(
        manageableActors.map(async (actor) => {
          const { items } = await listActorApiKeys(actor.id);
          return {
            actor,
            apiKeys: items ?? [],
          };
        }),
      );

      return { actorGroups, scopeCatalog, dataAccessLevels, adminAccessLevels };
    },
    enabled: !!session?.user && !authLoading,
    retry: (failureCount, error) => {
      if (error.message === "Unauthorized") {
        return false;
      }
      return failureCount < 3;
    },
  });

  const invalidateActorKeys = () =>
    queryClient.invalidateQueries({ queryKey: ["actor-api-keys"] });

  const createKeyMutation = useMutation({
    mutationFn: ({
      actorId,
      payload,
    }: {
      actorId: string;
      payload: CreateActorApiKeyPayload;
    }) => createActorApiKey(actorId, payload),
    onSuccess: invalidateActorKeys,
  });

  const updateKeyMutation = useMutation({
    mutationFn: ({
      actorId,
      keyId,
      payload,
    }: {
      actorId: string;
      keyId: string;
      payload: UpdateActorApiKeyPayload;
    }) => updateActorApiKey(actorId, keyId, payload),
    onSuccess: invalidateActorKeys,
  });

  const deleteKeyMutation = useMutation({
    mutationFn: ({ actorId, keyId }: { actorId: string; keyId: string }) =>
      deleteActorApiKey(actorId, keyId),
    onSuccess: invalidateActorKeys,
  });

  const createExternalSystemMutation = useMutation({
    mutationFn: (displayName: string) => createServiceActor(displayName),
    onSuccess: invalidateActorKeys,
  });

  const deleteExternalSystemMutation = useMutation({
    mutationFn: (actorId: string) => deleteServiceActor(actorId),
    onSuccess: invalidateActorKeys,
  });

  return {
    actorGroups: data?.actorGroups ?? [],
    scopeCatalog: data?.scopeCatalog ?? [],
    dataAccessLevels: data?.dataAccessLevels ?? {
      read: { label: "Read only", description: "" },
      read_write: { label: "Read & write", description: "" },
    },
    adminAccessLevels: data?.adminAccessLevels ?? {
      none: { label: "None", description: "" },
      read: { label: "Read only", description: "" },
      read_write: { label: "Read & write", description: "" },
    },
    isLoading:
      authLoading ||
      isQueryLoading ||
      createKeyMutation.isPending ||
      updateKeyMutation.isPending ||
      deleteKeyMutation.isPending ||
      createExternalSystemMutation.isPending ||
      deleteExternalSystemMutation.isPending,
    error:
      queryError ||
      createKeyMutation.error ||
      updateKeyMutation.error ||
      deleteKeyMutation.error ||
      createExternalSystemMutation.error ||
      deleteExternalSystemMutation.error,
    createApiKey: async (actorId, payload) => {
      try {
        return await createKeyMutation.mutateAsync({ actorId, payload });
      } catch (error) {
        console.error("Error creating API key:", error);
        return null;
      }
    },
    updateApiKey: async (actorId, keyId, payload) => {
      try {
        await updateKeyMutation.mutateAsync({ actorId, keyId, payload });
        return true;
      } catch (error) {
        console.error("Error updating API key:", error);
        return false;
      }
    },
    deleteApiKey: async (actorId, keyId) => {
      try {
        await deleteKeyMutation.mutateAsync({ actorId, keyId });
        return true;
      } catch (error) {
        console.error("Error deleting API key:", error);
        return false;
      }
    },
    createExternalSystem: async (displayName) => {
      try {
        return await createExternalSystemMutation.mutateAsync(displayName);
      } catch (error) {
        console.error("Error creating external system actor:", error);
        return null;
      }
    },
    deleteExternalSystem: async (actorId) => {
      try {
        await deleteExternalSystemMutation.mutateAsync(actorId);
        return true;
      } catch (error) {
        console.error("Error deleting external system actor:", error);
        return false;
      }
    },
  };
}
