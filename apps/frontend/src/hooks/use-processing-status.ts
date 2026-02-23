import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/frontend-api";
import {
  useProcessingEvents,
  useSSEConnectionStatus,
} from "@/providers/ProcessingEventsProvider";

export type AssetType =
  | "photos"
  | "documents"
  | "bookmarks"
  | "notes"
  | "tasks";
export type ProcessingStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "retry_pending"
  | "unknown";

export interface ProcessingStage {
  name: string;
  status: ProcessingStatus;
  progress: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface ProcessingStatusData {
  status: ProcessingStatus;
  stages: ProcessingStage[];
  currentStage?: string;
  overallProgress: number;
  error?: string;
  errorDetails?: Record<string, unknown>;
  retryCount: number;
  canRetry: boolean;
  estimatedCompletion?: string;
}

export interface ProcessingSummary {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retryPending: number;
  totalActive: number;
}

export interface ProcessingEvent {
  type:
    | "connected"
    | "ping"
    | "status_update"
    | "error"
    | "progress"
    | "stage_complete";
  assetType?: AssetType;
  assetId?: string;
  status?: ProcessingStatus;
  stage?: string;
  progress?: number;
  error?: string;
  timestamp: number;
  userId?: string;
}

/**
 * Hook to manage processing status for a specific asset
 */
export function useProcessingStatus(assetType: AssetType, assetId: string) {
  const _queryClient = useQueryClient();
  const { isConnected } = useSSEConnectionStatus();

  const queryKey = ["processing-status", assetType, assetId];

  // Query for processing status
  const {
    data: status,
    isLoading,
    error,
    refetch,
  } = useQuery<ProcessingStatusData>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch(
        `/api/processing-status/${assetType}/${assetId}`,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to fetch processing status: ${response.statusText}`,
        );
      }

      return response.json();
    },
    // Only poll as fallback when SSE is disconnected
    refetchInterval: (query) => {
      if (isConnected) return false; // No polling when SSE is connected

      // Fallback polling when SSE is disconnected
      const data = query.state.data;
      return data?.status === "processing" || data?.status === "pending"
        ? 30000 // Poll every 30s for active jobs when no SSE
        : false;
    },
    staleTime: 2000,
  });

  // Retry mutation
  const retryMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch(
        `/api/processing-status/${assetType}/${assetId}/retry`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to retry processing");
      }

      return response.json();
    },
    onSuccess: () => {
      toast.success("Processing retry initiated");
      refetch();
    },
    onError: (error) => {
      toast.error(`Failed to retry: ${error.message}`);
    },
  });

  // Real-time updates are handled by global processing events

  const retry = useCallback(() => {
    retryMutation.mutate();
  }, [retryMutation]);

  const refresh = useCallback(() => {
    refetch();
  }, [refetch]);

  return {
    status,
    isLoading,
    error,
    isConnected,
    retry,
    refresh,
    isRetrying: retryMutation.isPending,
  };
}

/**
 * Hook to get processing summary for the current user
 */
export function useProcessingSummary() {
  const { isConnected } = useSSEConnectionStatus();
  const queryKey = ["processing-summary"];

  const {
    data: summary,
    isLoading,
    error,
    refetch,
  } = useQuery<ProcessingSummary>({
    queryKey,
    queryFn: async () => {
      const response = await apiFetch("/api/processing-status/summary");

      if (!response.ok) {
        throw new Error(
          `Failed to fetch processing summary: ${response.statusText}`,
        );
      }

      return response.json();
    },
    // Only poll as fallback when SSE is disconnected
    refetchInterval: isConnected ? false : 120000, // Poll every 2 min when SSE disconnected
    staleTime: 5000,
  });

  return {
    summary,
    isLoading,
    error,
    refresh: refetch,
  };
}

/**
 * Hook for global processing events (for dashboard-wide updates)
 * Now uses the singleton ProcessingEventsProvider
 */
export {
  useProcessingEvents,
  useSSEConnectionStatus,
} from "@/providers/ProcessingEventsProvider";

/**
 * Hook to automatically refresh asset data when processing completes
 * This works with manual state management (non-React Query) components
 */
export function useAssetRefreshOnCompletion(
  assetType: AssetType,
  refreshCallback: () => void,
) {
  const { registerRefreshCallback } = useProcessingEvents();

  useEffect(() => {
    const cleanup = registerRefreshCallback(assetType, refreshCallback);
    return cleanup;
  }, [assetType, refreshCallback, registerRefreshCallback]);
}
