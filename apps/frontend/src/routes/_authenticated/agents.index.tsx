import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/agents/")({
  beforeLoad: () => {
    throw redirect({
      to: "/agents/$agentId",
      params: { agentId: DEFAULT_AGENT_ACTOR_ID },
    });
  },
});
