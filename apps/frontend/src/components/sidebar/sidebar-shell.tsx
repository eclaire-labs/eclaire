import { AppRail } from "@/components/sidebar/app-rail";
import { AiSidebar } from "@/components/sidebar/ai-sidebar";
import { ContentSidebar } from "@/components/sidebar/content-sidebar";
import type { SidebarMode } from "@/hooks/use-sidebar-mode";
import type { AgentExecutionStatus } from "@/hooks/use-session-status";
import type { Agent } from "@/types/agent";
import type { ConversationSummary } from "@/types/conversation";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  separator?: boolean;
  isDialog?: boolean;
}

interface SidebarShellProps {
  mode: SidebarMode;
  onModeChange: (mode: SidebarMode) => void;
  navigation: NavItem[];
  agents: Agent[];
  agentStatuses: Map<string, AgentExecutionStatus>;
  activeConversationId: string | null;
  showAiChat: boolean;
  onNewChat: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onSelectActivity: (sessionId: string) => void;
}

export function SidebarShell({
  mode,
  onModeChange,
  navigation,
  agents,
  agentStatuses,
  activeConversationId,
  showAiChat,
  onNewChat,
  onSelectConversation,
  onSelectActivity,
}: SidebarShellProps) {
  return (
    <div className="flex w-48 flex-col border-r bg-background flex-shrink-0">
      {/* Mode toggle bar */}
      <div className="flex items-center justify-between px-3 pt-3 pb-1">
        <AppRail mode={mode} onModeChange={onModeChange} />
      </div>

      {/* Contextual sidebar content */}
      <div className="flex-1 overflow-y-auto">
        {mode === "content" ? (
          <ContentSidebar navigation={navigation} />
        ) : (
          <AiSidebar
            agents={agents}
            agentStatuses={agentStatuses}
            activeConversationId={activeConversationId}
            showAiChat={showAiChat}
            onNewChat={onNewChat}
            onSelectConversation={onSelectConversation}
            onSelectActivity={onSelectActivity}
          />
        )}
      </div>
    </div>
  );
}
