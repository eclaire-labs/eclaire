import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/frontend-api";
import type { PhotoAnalysisData } from "@/types/photo-analysis";

interface UsePhotoAnalysisOptions {
  enabled?: boolean;
}

export function usePhotoAnalysis(
  photoId: string,
  options: UsePhotoAnalysisOptions = {},
) {
  const { enabled = true } = options;

  return useQuery({
    queryKey: ["photo-analysis", photoId],
    queryFn: async (): Promise<PhotoAnalysisData> => {
      const response = await apiFetch(
        `/api/photos/${photoId}/analysis?view=inline`,
      );

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("AI analysis not found or not yet generated");
        }
        throw new Error("Failed to fetch photo analysis");
      }

      return response.json();
    },
    enabled: enabled && !!photoId,
    staleTime: 5 * 60 * 1000, // 5 minutes - analysis data doesn't change often
    gcTime: 10 * 60 * 1000, // 10 minutes
    retry: (failureCount, error) => {
      // Don't retry if analysis doesn't exist yet
      if (
        error instanceof Error &&
        error.message.includes("not found or not yet generated")
      ) {
        return false;
      }
      return failureCount < 3;
    },
  });
}
