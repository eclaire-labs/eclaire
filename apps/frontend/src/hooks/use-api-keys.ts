
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/frontend-api";

interface ApiKeyData {
  id: string;
  displayKey: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface CreateApiKeyResponse {
  id: string;
  key: string; // Full key only returned on creation
  displayKey: string;
  name: string;
  createdAt: string;
  lastUsedAt: null;
}

interface UseApiKeysResult {
  apiKeys: ApiKeyData[];
  isLoading: boolean;
  error: Error | null;
  createApiKey: (name?: string) => Promise<CreateApiKeyResponse | null>;
  deleteApiKey: (id: string) => Promise<boolean>;
  updateApiKey: (id: string, name: string) => Promise<boolean>;
}

/**
 * Hook for managing multiple user API keys
 */
export function useApiKeys(): UseApiKeysResult {
  const { data: session, isPending: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all API keys from the backend
  const {
    data: apiKeysData,
    isLoading: isQueryLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["user-api-keys"],
    queryFn: async (): Promise<ApiKeyData[]> => {
      const res = await apiFetch("/api/user/api-keys");
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Unauthorized");
        }
        throw new Error("Failed to fetch API keys");
      }
      const data = await res.json();
      return data.apiKeys || [];
    },
    enabled: !!session?.user && !authLoading,
    retry: (failureCount, error) => {
      // Don't retry on 401 errors
      if (error.message === "Unauthorized") {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Mutation for creating a new API key
  const createKeyMutation = useMutation({
    mutationFn: async (name?: string): Promise<CreateApiKeyResponse> => {
      const res = await apiFetch("/api/user/api-keys", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create API key");
      }
      const data = await res.json();
      return data.apiKey;
    },
    onSuccess: () => {
      // Refresh the API keys list
      queryClient.invalidateQueries({ queryKey: ["user-api-keys"] });
    },
  });

  // Mutation for deleting an API key
  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await apiFetch(`/api/user/api-keys/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to delete API key");
      }
    },
    onSuccess: () => {
      // Refresh the API keys list
      queryClient.invalidateQueries({ queryKey: ["user-api-keys"] });
    },
  });

  // Mutation for updating an API key name
  const updateKeyMutation = useMutation({
    mutationFn: async ({
      id,
      name,
    }: {
      id: string;
      name: string;
    }): Promise<void> => {
      const res = await apiFetch(`/api/user/api-keys/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to update API key");
      }
    },
    onSuccess: () => {
      // Refresh the API keys list
      queryClient.invalidateQueries({ queryKey: ["user-api-keys"] });
    },
  });

  const createApiKey = async (
    name?: string,
  ): Promise<CreateApiKeyResponse | null> => {
    if (!session?.user) {
      throw new Error("You must be logged in to create an API key");
    }

    try {
      const newApiKey = await createKeyMutation.mutateAsync(name);
      return newApiKey;
    } catch (error) {
      console.error("Error creating API key:", error);
      return null;
    }
  };

  const deleteApiKey = async (id: string): Promise<boolean> => {
    try {
      await deleteKeyMutation.mutateAsync(id);
      return true;
    } catch (error) {
      console.error("Error deleting API key:", error);
      return false;
    }
  };

  const updateApiKey = async (id: string, name: string): Promise<boolean> => {
    try {
      await updateKeyMutation.mutateAsync({ id, name });
      return true;
    } catch (error) {
      console.error("Error updating API key:", error);
      return false;
    }
  };

  return {
    apiKeys: apiKeysData || [],
    isLoading:
      authLoading ||
      isQueryLoading ||
      createKeyMutation.isPending ||
      deleteKeyMutation.isPending ||
      updateKeyMutation.isPending,
    error:
      queryError ||
      createKeyMutation.error ||
      deleteKeyMutation.error ||
      updateKeyMutation.error,
    createApiKey,
    deleteApiKey,
    updateApiKey,
  };
}
