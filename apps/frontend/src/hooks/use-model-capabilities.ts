import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/frontend-api";

export interface ModelCapabilities {
  provider: string;
  modelShortName: string;
  modelFullName: string;
  modelUrl: string;
  capabilities: {
    stream: boolean;
    thinking: {
      mode: "always" | "sometimes" | "never";
    };
  };
  notes: string;
  enabled: boolean;
}

export interface UseModelCapabilitiesReturn {
  data: ModelCapabilities | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useModelCapabilities(): UseModelCapabilitiesReturn {
  const [data, setData] = useState<ModelCapabilities | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModelCapabilities = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiFetch("/api/model");

      if (!response.ok) {
        throw new Error(
          `Failed to fetch model capabilities: ${response.status}`,
        );
      }

      const modelData: ModelCapabilities = await response.json();
      setData(modelData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("Error fetching model capabilities:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModelCapabilities();
  }, [fetchModelCapabilities]);

  return {
    data,
    loading,
    error,
    refetch: fetchModelCapabilities,
  };
}
