import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

export interface AgentRun {
  id: string;
  taskId: string;
  userId: string;
  requestedByActorId: string | null;
  executorActorId: string | null;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  prompt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  output: string | null;
  error: string | null;
  resultSummary: string | null;
  createdAt: string;
}

export function useAgentRuns(
  taskId: string | undefined,
  options?: { enabled?: boolean; limit?: number },
) {
  const limit = options?.limit ?? 20;

  const query = useQuery<{ runs: AgentRun[] }>({
    queryKey: ["agent-runs", taskId, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      const res = await apiFetch(
        `/api/tasks/${taskId}/agent-runs?${params.toString()}`,
      );
      return res.json();
    },
    enabled: !!taskId && (options?.enabled ?? true),
  });

  return {
    runs: query.data?.runs ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
