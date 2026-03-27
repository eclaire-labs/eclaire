import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface UpcomingItem {
  id: string;
  sourceType: "task" | "scheduled_action" | "task_series";
  title: string;
  when: string;
  kind?: string;
  executionMode?: string;
  status?: string;
  linkTo: string;
}

export function useUpcoming(options?: { limit?: number; enabled?: boolean }) {
  const limit = options?.limit ?? 15;

  const query = useQuery<{ items: UpcomingItem[] }>({
    queryKey: ["upcoming", limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      const res = await apiFetch(`/api/upcoming?${params.toString()}`);
      return res.json();
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000, // refresh every minute
  });

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
