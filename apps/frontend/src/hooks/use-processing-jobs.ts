import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useProcessingEvents } from "@/hooks/use-processing-status";
import { apiFetch } from "@/lib/api-client";

export interface ProcessingJob {
  id: string;
  assetType: "photos" | "documents" | "bookmarks" | "notes";
  assetId: string;
  status: "pending" | "processing" | "completed" | "failed" | "retry_pending";
  stages: Array<{
    name: string;
    status: string;
    progress: number;
    startedAt?: number;
    completedAt?: number;
    error?: string;
  }>;
  currentStage?: string;
  overallProgress: number;
  errorMessage?: string;
  retryCount: number;
  canRetry: boolean;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface AssetDetails {
  title?: string;
  name?: string;
  url?: string;
  originalFilename?: string;
  description?: string;
}

/**
 * Hook for the processing jobs monitoring dashboard: lists all jobs and
 * exposes a retry/re-run action.
 */
export function useProcessingJobs() {
  // Get SSE connection status for real-time updates
  const { isConnected } = useProcessingEvents();

  const {
    data: jobs,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["processing-jobs"],
    queryFn: async () => {
      const response = await apiFetch("/api/processing-status/jobs?limit=9999");
      if (!response.ok) {
        throw new Error("Failed to fetch processing jobs");
      }
      return response.json();
    },
    staleTime: 0, // Always refetch on mount — this is a monitoring dashboard
    // Only poll as fallback when SSE is disconnected
    refetchInterval: isConnected ? false : 60000, // Poll every minute when SSE disconnected
  });

  const retryJob = async (
    assetType: string,
    assetId: string,
    force: boolean = false,
  ) => {
    try {
      const response = await apiFetch(
        `/api/processing-status/${assetType}/${assetId}/retry`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force }),
        },
      );

      if (response.ok) {
        refetch();
      } else {
        const errorData = await response.json();
        console.error("Failed to retry job:", errorData.error);
      }
    } catch (error) {
      console.error("Failed to retry job:", error);
    }
  };

  return { jobs, isLoading, refetch, retryJob };
}

/**
 * Fetch the underlying asset (photo/document/bookmark/note) for a processing
 * job, e.g. to display its title in the job details dialog.
 */
export function useAssetDetails(
  assetType: ProcessingJob["assetType"],
  assetId: string,
) {
  const [assetDetails, setAssetDetails] = useState<AssetDetails | null>(null);
  const [isLoadingAsset, setIsLoadingAsset] = useState(false);

  useEffect(() => {
    const fetchAssetDetails = async () => {
      setIsLoadingAsset(true);
      try {
        const response = await apiFetch(`/api/${assetType}/${assetId}`);
        if (response.ok) {
          const data = await response.json();
          setAssetDetails(data);
        }
      } catch (error) {
        console.error("Failed to fetch asset details:", error);
      } finally {
        setIsLoadingAsset(false);
      }
    };

    fetchAssetDetails();
  }, [assetType, assetId]);

  return { assetDetails, isLoadingAsset };
}
