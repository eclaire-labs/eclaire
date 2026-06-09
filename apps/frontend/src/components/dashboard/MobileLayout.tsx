import type { SlashItem } from "@eclaire/core/slash";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { MobileChatView } from "@/components/mobile/mobile-chat-view";
import { MobileFoldersView } from "@/components/mobile/mobile-folders-view";
import { MobileLayout } from "@/components/mobile/mobile-layout";
import type { MobileTab } from "@/components/mobile/mobile-tab-bar";
import { MobileNavigationProvider } from "@/contexts/mobile-navigation-context";
import type { AssistantChat } from "@/hooks/use-assistant-chat";
import {
  getMobileTabFromPathname,
  getRouteForMobileTab,
} from "@/lib/mobile-navigation";
import type { ConversationSummary } from "@/types/conversation";

interface DashboardMobileLayoutProps {
  children: ReactNode;
  chat: AssistantChat;
  showThinkingTokens: boolean;
  /** Send/keydown wrappers that route through slash-command interception. */
  handleSend: (textOverride?: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  startNewConversation: () => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onEditConversationTitle: (title: string) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAllConversations: () => void;
  slashPalette?: {
    open: boolean;
    items: SlashItem[];
    onSelect: (item: SlashItem) => void;
    onClose: () => void;
  };
}

/**
 * Mobile shell for the dashboard: tab bar navigation plus the per-tab
 * content (chat view, folders sheet, or the routed page content).
 */
export function DashboardMobileLayout({
  children,
  chat,
  showThinkingTokens,
  handleSend,
  handleKeyDown,
  startNewConversation,
  onSelectConversation,
  onEditConversationTitle,
  onDeleteConversation,
  onDeleteAllConversations,
  slashPalette,
}: DashboardMobileLayoutProps) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();

  const [currentMobileTab, setCurrentMobileTab] = useState<MobileTab>("chat");
  const [foldersSheetOpen, setFoldersSheetOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  // Update mobile tab based on current pathname
  useEffect(() => {
    setCurrentMobileTab(getMobileTabFromPathname(pathname));
  }, [pathname]);

  const handleMobileTabChange = (tab: MobileTab) => {
    setCurrentMobileTab(tab);

    // Handle navigation for tabs that have routes
    const route = getRouteForMobileTab(tab);
    if (route && pathname !== route) {
      navigate({ to: route });
    }

    // Handle tab-specific state changes
    if (tab === "folders") {
      setFoldersSheetOpen(true);
    } else {
      setFoldersSheetOpen(false);
    }

    // Chat tab doesn't need special state since it's handled by the content render
  };

  // Render different content based on active mobile tab
  const renderMobileContent = () => {
    switch (currentMobileTab) {
      case "chat":
        return (
          <MobileChatView
            messages={chat.messages}
            isLoading={chat.isLoadingConversation}
            messagesEndRef={chat.messagesEndRef}
            attachedAssets={chat.attachedAssets}
            setAttachedAssets={chat.setAttachedAssets}
            input={chat.input}
            inputRef={chat.inputRef}
            setInput={chat.setInput}
            handleKeyDown={handleKeyDown}
            handleSend={handleSend}
            startNewConversation={startNewConversation}
            currentConversation={chat.currentConversation}
            onEditConversationTitle={onEditConversationTitle}
            onSelectConversation={onSelectConversation}
            onDeleteConversation={onDeleteConversation}
            onDeleteAllConversations={onDeleteAllConversations}
            isStreaming={chat.isStreaming}
            streamingThought={chat.streamingThought}
            streamingText={chat.streamingText}
            streamingToolCalls={chat.streamingToolCalls}
            onApproveToolCall={chat.handleApproveToolCall}
            onDenyToolCall={chat.handleDenyToolCall}
            showThinkingTokens={showThinkingTokens}
            slashPalette={slashPalette}
          />
        );
      case "folders":
        return (
          <>
            <main className="p-4">{children}</main>
            <MobileFoldersView
              open={foldersSheetOpen}
              onClose={() => {
                setFoldersSheetOpen(false);
                setCurrentMobileTab("chat");
              }}
            />
          </>
        );
      default:
        // home, settings, or any other tab shows regular content
        return <main className="p-4">{children}</main>;
    }
  };

  return (
    <MobileNavigationProvider
      value={{
        currentMobileTab,
        setCurrentMobileTab,
        foldersSheetOpen,
        setFoldersSheetOpen,
        chatOpen,
        setChatOpen,
      }}
    >
      <MobileLayout
        activeTab={currentMobileTab}
        onTabChange={handleMobileTabChange}
        onChatToggle={() => {
          setCurrentMobileTab("chat");
        }}
        onFoldersToggle={() => {
          setCurrentMobileTab("folders");
          setFoldersSheetOpen(true);
        }}
      >
        {renderMobileContent()}
      </MobileLayout>
    </MobileNavigationProvider>
  );
}
