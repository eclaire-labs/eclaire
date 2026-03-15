import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TaskExecution } from "@/types/task";

interface ExecutionsPage {
  items: TaskExecution[];
  nextCursor: string | null;
  hasMore: boolean;
}

export function useTaskExecutions(
  taskId: string | undefined,
  options?: { enabled?: boolean; limit?: number },
) {
  const limit = options?.limit ?? 10;

  const query = useInfiniteQuery<ExecutionsPage>({
    queryKey: ["task-executions", taskId],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (pageParam) params.set("cursor", pageParam as string);
      const res = await apiFetch(
        `/api/tasks/${taskId}/executions?${params.toString()}`,
      );
      return res.json();
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextCursor : undefined,
    enabled: !!taskId && (options?.enabled ?? true),
  });

  const executions = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );

  return {
    executions,
    isLoading: query.isLoading,
    error: query.error,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
