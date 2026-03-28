import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { AppRail } from "@/components/sidebar/app-rail";
import { AiSidebar } from "@/components/sidebar/ai-sidebar";
import { ContentSidebar } from "@/components/sidebar/content-sidebar";
import { SidebarSettingsButton } from "@/components/sidebar/sidebar-settings-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SidebarMode } from "@/hooks/use-sidebar-mode";
import type { AgentExecutionStatus } from "@/hooks/use-session-status";
import type { Agent } from "@/types/agent";
import type { ConversationSummary } from "@/types/conversation";

const SIDEBAR_WIDTH_EXPANDED = 192;
const SIDEBAR_WIDTH_COLLAPSED = 56;

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
  collapsed: boolean;
  onToggleCollapse: () => void;
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
  collapsed,
  onToggleCollapse,
}: SidebarShellProps) {
  return (
    <div
      style={{
        width: collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED,
      }}
      className="flex flex-col border-r bg-background flex-shrink-0 transition-[width] duration-200 ease-in-out overflow-hidden"
    >
      {/* Top: Mode toggle + collapse button */}
      <div className="px-2 pt-3 pb-1">
        <div
          className={`flex gap-1.5 ${collapsed ? "flex-col-reverse items-center" : "items-center"}`}
        >
          <div className={collapsed ? "w-full" : "flex-1 min-w-0"}>
            <AppRail
              mode={mode}
              onModeChange={onModeChange}
              collapsed={collapsed}
            />
          </div>
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleCollapse}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[hsl(var(--hover-bg))] hover:text-foreground"
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? (
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent
                side={collapsed ? "right" : "bottom"}
                className="text-xs"
              >
                {collapsed ? "Expand sidebar" : "Collapse sidebar"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Middle: Scrollable content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {mode === "content" ? (
          <ContentSidebar navigation={navigation} collapsed={collapsed} />
        ) : (
          <AiSidebar
            agents={agents}
            agentStatuses={agentStatuses}
            activeConversationId={activeConversationId}
            showAiChat={showAiChat}
            onNewChat={onNewChat}
            onSelectConversation={onSelectConversation}
            onSelectActivity={onSelectActivity}
            collapsed={collapsed}
          />
        )}
      </div>

      {/* Bottom: Fixed settings */}
      <div className="border-t p-2">
        <SidebarSettingsButton collapsed={collapsed} />
      </div>
    </div>
  );
}
