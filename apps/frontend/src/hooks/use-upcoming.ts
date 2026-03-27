import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { Task } from "@/types/task";

export interface UpcomingItem {
  id: string;
  title: string;
  when: string;
  scheduleType: string;
  delegateMode: string;
  linkTo: string;
}

function taskToUpcomingItem(task: Task): UpcomingItem {
  const when = task.nextOccurrenceAt ?? task.dueAt ?? task.createdAt;
  return {
    id: task.id,
    title: task.title,
    when,
    scheduleType: task.scheduleType,
    delegateMode: task.delegateMode,
    linkTo: `/tasks/${task.id}`,
  };
}

export function useUpcoming(options?: { limit?: number; enabled?: boolean }) {
  const limit = options?.limit ?? 15;

  const query = useQuery<{ items: UpcomingItem[] }>({
    queryKey: ["upcoming", limit],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: String(limit),
        sortBy: "dueAt",
        sortDir: "asc",
        dueDateStart: new Date().toISOString(),
      });
      const res = await apiFetch(`/api/tasks?${params.toString()}`);
      if (!res.ok) return { items: [] };
      const data = await res.json();
      const tasks: Task[] = data.items ?? data ?? [];
      return { items: tasks.map(taskToUpcomingItem) };
    },
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000,
  });

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
