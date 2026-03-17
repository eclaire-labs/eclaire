import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

/**
 * Lazily fetches text content (extracted markdown) from a content URL.
 * Only fetches when `enabled` is true, so callers can defer loading
 * until the user activates a "Content" tab.
 */
export function useContentFetch(contentUrl: string | null, enabled: boolean) {
  const { data, isLoading, error } = useQuery<string>({
    queryKey: ["content", contentUrl],
    queryFn: async () => {
      const response = await apiFetch(contentUrl as string);
      return response.text();
    },
    enabled: enabled && !!contentUrl,
    staleTime: 10 * 60 * 1000, // 10 minutes — extracted content rarely changes
  });

  return {
    content: data ?? null,
    isLoading,
    error: error as Error | null,
  };
}
