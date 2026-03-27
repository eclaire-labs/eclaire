import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TaskOccurrence } from "@/types/task";

interface OccurrencesPage {
  items: TaskOccurrence[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useTaskOccurrences(
  taskId: string | undefined,
  options?: { enabled?: boolean; limit?: number },
) {
  const limit = options?.limit ?? 10;

  const query = useInfiniteQuery<OccurrencesPage>({
    queryKey: ["task-occurrences", taskId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await apiFetch(
        `/api/tasks/${taskId}/occurrences?${params.toString()}`,
      );
      if (!res.ok) throw new Error("Failed to fetch occurrences");
      return res.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!taskId && (options?.enabled ?? true),
  });

  const occurrences = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  return {
    occurrences,
    isLoading: query.isLoading,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
