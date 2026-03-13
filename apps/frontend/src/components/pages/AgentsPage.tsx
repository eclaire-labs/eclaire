import { getRouteApi } from "@tanstack/react-router";
import AssistantSettings from "@/components/settings/AssistantSettings";

const routeApi = getRouteApi("/_authenticated/agents/$agentId");

export default function AgentsPage() {
  const { agentId } = routeApi.useParams();

  return <AssistantSettings selectedAgentId={agentId} />;
}
