import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { apiFetch } from "@/lib/api-client";

interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

interface UseApiKeyResult {
  apiKey: string | null;
  isLoading: boolean;
  error: Error | null;
  generateNewKey: () => Promise<string | null>;
}

/**
 * Hook for fetching and managing a user's API key
 *
 * @returns API key state and management functions
 */
export function useApiKey(): UseApiKeyResult {
  const { data: session, isPending: authLoading } = useAuth();
  const queryClient = useQueryClient();

  // Fetch the API key from the backend
  const {
    data: apiKeyData,
    isLoading: isQueryLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["user-api-key"],
    queryFn: async (): Promise<ApiKeyData | null> => {
      const res = await apiFetch("/api/user/api-keys");
      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("Unauthorized");
        }
        throw new Error("Failed to fetch API key");
      }
      const data = await res.json();
      const items = data.items || [];
      return items[0] || null;
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

  // Mutation for generating a new API key
  const generateKeyMutation = useMutation({
    mutationFn: async (): Promise<ApiKeyData> => {
      const res = await apiFetch("/api/user/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "API Key" }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to generate API key");
      }
      return res.json();
    },
    onSuccess: (newApiKey) => {
      // Update the query cache with the new API key
      queryClient.setQueryData(["user-api-key"], newApiKey);
    },
  });

  const generateNewKey = async (): Promise<string | null> => {
    if (!session?.user) {
      throw new Error("You must be logged in to generate an API key");
    }

    try {
      const newApiKey = await generateKeyMutation.mutateAsync();
      return newApiKey.key;
    } catch (error) {
      console.error("Error generating API key:", error);
      return null;
    }
  };

  return {
    apiKey: apiKeyData?.key || null,
    isLoading: authLoading || isQueryLoading || generateKeyMutation.isPending,
    error: queryError || generateKeyMutation.error,
    generateNewKey,
  };
}
