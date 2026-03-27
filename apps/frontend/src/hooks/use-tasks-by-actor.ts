import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api-client";

export interface ActorTaskSummary {
  actorId: string | null;
  displayName: string | null;
  kind: string;
  counts: Record<string, number>;
  total: number;
}

export function useTasksByActor() {
  return useQuery<{ actors: ActorTaskSummary[] }>({
    queryKey: ["tasks-by-actor"],
    queryFn: async () => {
      const res = await apiGet("/api/tasks/by-actor");
      return res.json();
    },
    staleTime: 30_000,
  });
}
