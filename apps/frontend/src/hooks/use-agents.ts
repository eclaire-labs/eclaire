/**
 * Agent list + capability catalog queries.
 *
 * Mutation sites (agent create/update/delete) should call
 * `queryClient.invalidateQueries({ queryKey: ["agents"] })` so every
 * consumer (sidebar rail, settings, slash commands) refreshes together.
 */

import { useQuery } from "@tanstack/react-query";

import { getAgentCatalog, listAgents } from "@/lib/api-agents";
import type { Agent, AgentCatalog } from "@/types/agent";

/** All agents available to the current user. */
export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: ["agents"],
    queryFn: async () => {
      const response = await listAgents();
      return response.items;
    },
  });
}

/** The tools/skills catalog used by the agent configuration UI. */
export function useAgentCatalog() {
  return useQuery<AgentCatalog>({
    queryKey: ["agent-catalog"],
    queryFn: getAgentCatalog,
  });
}
