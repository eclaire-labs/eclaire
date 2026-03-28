import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { useSSEConnectionStatus } from "@/providers/ProcessingEventsProvider";

export function useDueNowCount() {
  const { isConnected } = useSSEConnectionStatus();

  const query = useQuery({
    queryKey: ["due-now-count"],
    queryFn: async () => {
      const response = await apiFetch("/api/all?dueStatus=due_now&limit=100");
      if (!response.ok) return 0;
      const data = await response.json();
      return data.items.length as number;
    },
    refetchInterval: isConnected ? false : 5 * 60 * 1000,
    staleTime: 30_000,
  });

  return { count: query.data ?? 0, isLoading: query.isLoading };
}
