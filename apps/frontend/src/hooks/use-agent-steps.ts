import { useQuery } from "@tanstack/react-query";
import { getAgentSteps } from "@/lib/api-sessions";

/**
 * Lazily fetch agent execution steps for a specific message.
 * Only fires when `enabled` is true (i.e., when the user expands the activity view).
 */
export function useAgentSteps(
  sessionId: string | undefined,
  messageId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["agent-steps", sessionId, messageId],
    // biome-ignore lint/style/noNonNullAssertion: guarded by enabled check below
    queryFn: () => getAgentSteps(sessionId!, messageId!),
    enabled: enabled && !!sessionId && !!messageId,
    staleTime: 60_000, // Steps don't change after execution
  });
}
