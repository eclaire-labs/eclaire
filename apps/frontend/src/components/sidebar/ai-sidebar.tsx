import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { Bot, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";
import { AgentStatusDot } from "@/components/assistant/agent-status-dot";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AiActivityFeed } from "@/components/sidebar/ai-activity-feed";
import { AiConversationList } from "@/components/sidebar/ai-conversation-list";
import type { AgentExecutionStatus } from "@/hooks/use-session-status";
import type { Agent } from "@/types/agent";
import type { ConversationSummary } from "@/types/conversation";

type SidebarTab = "chat";

interface AiSidebarProps {
  agents: Agent[];
  agentStatuses: Map<string, AgentExecutionStatus>;
  activeConversationId: string | null;
  showAiChat: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onSelectActivity: (sessionId: string) => void;
  collapsed: boolean;
}

export function AiSidebar({
  agents,
  agentStatuses,
  activeConversationId,
  showAiChat,
  onNewChat,
  onSelectConversation,
  onSelectActivity,
  collapsed,
}: AiSidebarProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [_activeTab, _setActiveTab] = useState<SidebarTab>("chat");

  const activeAgentId =
    !showAiChat && pathname.startsWith("/agents/")
      ? pathname.split("/")[2] || DEFAULT_AGENT_ACTOR_ID
      : null;

  const handleAgentClick = (e: React.MouseEvent, agentId: string) => {
    e.preventDefault();
    navigate({ to: "/agents/$agentId", params: { agentId } });
  };

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <div className="flex flex-col h-full">
          {/* New Chat - icon only */}
          <div className="p-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="default"
                  size="icon"
                  className="w-full"
                  onClick={onNewChat}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                New Chat
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Conversations - icon list */}
          <div className="flex-1 overflow-y-auto">
            <AiConversationList
              activeConversationId={showAiChat ? activeConversationId : null}
              onSelectConversation={onSelectConversation}
              collapsed
            />

            {/* Agents - avatars only */}
            {agents.length > 0 && (
              <div className="mt-2">
                <div className="h-px bg-border my-2 mx-2" />
                <ul className="space-y-1 px-2">
                  {agents.map((agent) => {
                    const agentStatus = agentStatuses.get(agent.id);
                    const isActive = activeAgentId === agent.id;
                    return (
                      <li key={agent.id}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`/agents/${agent.id}`}
                              onClick={(e) => handleAgentClick(e, agent.id)}
                              className={`flex items-center justify-center rounded-md p-1.5 ${
                                isActive
                                  ? "font-medium"
                                  : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]"
                              }`}
                              style={
                                isActive
                                  ? {
                                      backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
                                      color: `hsl(var(--sidebar-active-text))`,
                                    }
                                  : undefined
                              }
                            >
                              <span className="relative flex h-6 w-6 items-center justify-center rounded-full border bg-background text-[11px] font-semibold">
                                {agent.name.slice(0, 1).toUpperCase()}
                                {agentStatus && (
                                  <AgentStatusDot status={agentStatus} />
                                )}
                              </span>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="text-xs">
                            {agent.name}
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Toggle */}
      <div className="p-3 pb-1">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <MessageSquare className="h-3.5 w-3.5" />
          Chat
        </div>
      </div>

      {/* New Chat */}
      <div className="p-3 pb-2">
        <Button
          variant="default"
          className="w-full justify-start gap-2"
          onClick={onNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto px-0">
        <AiConversationList
          activeConversationId={showAiChat ? activeConversationId : null}
          onSelectConversation={onSelectConversation}
          collapsed={false}
        />

        {/* Agents */}
        <div className="mt-3">
          <div className="h-px bg-border my-2" />
          <div className="flex items-center justify-between px-3 py-1.5">
            <Link
              to="/agents/$agentId"
              params={{ agentId: DEFAULT_AGENT_ACTOR_ID }}
              className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              <Bot className="h-3.5 w-3.5" />
              Agents
            </Link>
            <Link
              to="/agents/$agentId"
              params={{ agentId: "new" }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-[hsl(var(--hover-bg))] hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </Link>
          </div>
          <div className="space-y-1">
            {agents.map((agent) => {
              const agentStatus = agentStatuses.get(agent.id);
              const isActive = activeAgentId === agent.id;
              return (
                <a
                  key={agent.id}
                  href={`/agents/${agent.id}`}
                  onClick={(e) => handleAgentClick(e, agent.id)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                    isActive
                      ? "font-medium"
                      : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]"
                  }`}
                  style={
                    isActive
                      ? {
                          backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
                          color: `hsl(var(--sidebar-active-text))`,
                        }
                      : undefined
                  }
                >
                  <span className="relative flex h-6 w-6 items-center justify-center rounded-full border bg-background text-[11px] font-semibold">
                    {agent.name.slice(0, 1).toUpperCase()}
                    {agentStatus && <AgentStatusDot status={agentStatus} />}
                  </span>
                  <span className="truncate">{agent.name}</span>
                </a>
              );
            })}
          </div>
        </div>

        {/* Activity Feed */}
        <AiActivityFeed agents={agents} onSelectActivity={onSelectActivity} />
      </div>
    </div>
  );
}
