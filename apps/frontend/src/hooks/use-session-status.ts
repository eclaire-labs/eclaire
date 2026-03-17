import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getSessionStatuses } from "@/lib/api-sessions";

export type AgentExecutionStatus = "running" | "completed" | "error";

/**
 * React Query hook to fetch session execution statuses.
 * Returns sessions that are running, errored, or have unread responses.
 * Automatically refreshed via SSE events (session_running/completed/error)
 * with a 30s polling fallback.
 */
export function useSessionStatuses() {
  return useQuery({
    queryKey: ["session-status"],
    queryFn: () => getSessionStatuses(),
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}

/**
 * Derived hook: aggregate session statuses per agent for sidebar indicators.
 *
 * Priority: running > error > completed (hasUnread).
 * Returns a Map<agentActorId, AgentExecutionStatus>.
 */
export function useAgentExecutionStatus(): Map<string, AgentExecutionStatus> {
  const { data } = useSessionStatuses();

  return useMemo(() => {
    const statusMap = new Map<string, AgentExecutionStatus>();

    if (!data?.items) return statusMap;

    for (const session of data.items) {
      const current = statusMap.get(session.agentActorId);

      // Determine this session's display status
      let sessionStatus: AgentExecutionStatus | null = null;
      if (session.executionStatus === "running") {
        sessionStatus = "running";
      } else if (session.executionStatus === "error") {
        sessionStatus = "error";
      } else if (session.hasUnreadResponse) {
        sessionStatus = "completed";
      }

      if (!sessionStatus) continue;

      // Apply priority: running > error > completed
      if (!current) {
        statusMap.set(session.agentActorId, sessionStatus);
      } else if (sessionStatus === "running") {
        statusMap.set(session.agentActorId, "running");
      } else if (sessionStatus === "error" && current !== "running") {
        statusMap.set(session.agentActorId, "error");
      }
      // 'completed' doesn't override anything
    }

    return statusMap;
  }, [data]);
}
