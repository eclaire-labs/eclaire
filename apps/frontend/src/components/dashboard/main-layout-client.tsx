import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  AudioWaveform,
  BookMarked,
  Clock,
  FileText,
  Flag,
  History,
  Home,
  ImageIcon,
  Inbox,
  ListTodo,
  Notebook,
  Pin,
  Search,
  Upload,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AssistantOverlay } from "@/components/assistant/assistant-overlay";
import { ChatPanel } from "@/components/assistant/chat-panel";
import { GlobalAssistant } from "@/components/assistant/global-assistant";
import { DashboardMobileLayout } from "@/components/dashboard/MobileLayout";
import { TopBar } from "@/components/dashboard/top-bar";
import { SidebarShell } from "@/components/sidebar/sidebar-shell";
import { useAgents } from "@/hooks/use-agents";
import { useAssistantChat } from "@/hooks/use-assistant-chat";
import { useInboxCount } from "@/hooks/use-inbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePanelResize } from "@/hooks/use-panel-resize";
import { useAgentExecutionStatus } from "@/hooks/use-session-status";
import {
  useSidebarCollapsed,
  useSidebarCollapseShortcut,
} from "@/hooks/use-sidebar-collapsed";
import {
  useSidebarMode,
  useSidebarModeShortcut,
} from "@/hooks/use-sidebar-mode";
import { useSlashCommands } from "@/hooks/use-slash-commands";
import { deleteSession, listSessions, updateSession } from "@/lib/api-sessions";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, Message } from "@/types/message";

// Base navigation items — inbox badge is injected dynamically
const baseNavigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Processing", href: "/processing", icon: Activity },
  { name: "Upload", href: "/upload", icon: Upload, separator: true },
  { name: "All", href: "/all", icon: Search, separator: true },
  { name: "Pending", href: "/all/pending", icon: Clock },
  { name: "Due Now", href: "/all/due-now", icon: AlertTriangle },
  { name: "Pinned", href: "/all/pinned", icon: Pin },
  { name: "Flagged", href: "/all/flagged", icon: Flag },
  { name: "Inbox", href: "/inbox", icon: Inbox, separator: true },
  { name: "Tasks", href: "/tasks", icon: ListTodo },
  { name: "Notes", href: "/notes", icon: Notebook },
  { name: "Bookmarks", href: "/bookmarks", icon: BookMarked },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Photos", href: "/photos", icon: ImageIcon },
  { name: "Media", href: "/media", icon: AudioWaveform },
  { name: "History", href: "/history", icon: History },
];

function buildWelcomeMessage(): Message {
  return {
    id: Date.now().toString(),
    role: "assistant",
    content: "Hello! I'm your AI assistant. How can I help you today?",
    timestamp: new Date(),
  };
}

interface MainLayoutClientProps {
  children: ReactNode;
}

export function MainLayoutClient({ children }: MainLayoutClientProps) {
  const location = useLocation();
  const { pathname } = location;
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { data: inboxCount } = useInboxCount();
  const navigation = useMemo(
    () =>
      baseNavigation.map((item) =>
        item.href === "/inbox"
          ? { ...item, badge: inboxCount?.totalCount }
          : item,
      ),
    [inboxCount?.totalCount],
  );
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantFullScreen, setAssistantFullScreen] = useState(false);
  const [preAttachedAssets, setPreAttachedAssets] = useState<AssetReference[]>(
    [],
  );
  const {
    width: assistantWidth,
    setWidth: setAssistantWidth,
    isResizing,
    handleMouseDown,
  } = usePanelResize();

  // Sidebar mode & collapse
  const [sidebarMode, setSidebarMode] = useSidebarMode();
  useSidebarModeShortcut(sidebarMode, setSidebarMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  useSidebarCollapseShortcut(sidebarCollapsed, setSidebarCollapsed);
  const [showAiChat, setShowAiChat] = useState(false);

  // Clear AI chat view when user navigates via links (e.g. clicking an agent)
  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname;
      setShowAiChat(false);
    }
  }, [pathname]);

  // Assistant preferences
  const [assistantPreferences] = useAssistantPreferences();

  const { data: agentRailItems = [] } = useAgents();
  const [assistantAgentId, setAssistantAgentId] = useState<string>(
    DEFAULT_AGENT_ACTOR_ID,
  );
  const agentStatuses = useAgentExecutionStatus();
  const [showHistory, setShowHistory] = useState(false);

  // Shared assistant chat core (messages, streaming, tool approvals, ...)
  const chat = useAssistantChat({
    agentActorId: assistantAgentId,
    buildWelcomeMessage,
    enrichContentLinks: true,
    clearAttachmentsOnLoad: true,
  });
  const {
    messages,
    setMessages,
    input,
    setInput,
    attachedAssets,
    setAttachedAssets,
    currentConversation,
    setCurrentConversation,
    isLoadingConversation,
    isStreaming,
    streamingThought,
    streamingText,
    streamingToolCalls,
    messagesEndRef,
    inputRef,
    handleSend,
    handleApproveToolCall,
    handleDenyToolCall,
    loadConversation,
    resetConversation,
    stopStreaming,
  } = chat;

  useEffect(() => {
    if (assistantOpen && !currentConversation) {
      if (preAttachedAssets && preAttachedAssets.length > 0) {
        setAttachedAssets(preAttachedAssets);
        const welcomeMessage: Message = {
          id: "welcome",
          role: "assistant",
          content: `Hello! I can see you've attached ${preAttachedAssets.length > 1 ? `${preAttachedAssets.length} items` : `"${preAttachedAssets[0]?.title ?? preAttachedAssets[0]?.id ?? "item"}"`} to our conversation. How can I help you with ${preAttachedAssets.length > 1 ? "them" : "it"} today?`,
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      } else {
        const welcomeMessage: Message = {
          id: "welcome",
          role: "assistant",
          content: "Hello! I'm your AI assistant. How can I help you today?",
          timestamp: new Date(),
        };
        setMessages([welcomeMessage]);
      }
    }
  }, [
    preAttachedAssets,
    assistantOpen,
    currentConversation,
    setAttachedAssets,
    setMessages,
  ]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesEndRef]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  // Function to open assistant with pre-attached assets
  const openAssistantWithAssets = (assets: AssetReference[]) => {
    setPreAttachedAssets(assets);
    setAssistantOpen(true);
  };

  const startNewConversation = () => {
    stopStreaming();
    resetConversation();
  };

  // Sidebar AI mode handlers — open chat in main content area
  const handleNewChatFromSidebar = () => {
    startNewConversation();
    setShowAiChat(true);
  };

  const handleSelectConversationFromSidebar = (conv: ConversationSummary) => {
    loadConversation(conv);
    setShowAiChat(true);
  };

  const handleSelectActivityFromSidebar = (sessionId: string) => {
    const conv: ConversationSummary = {
      id: sessionId,
      userId: "",
      agentActorId: "",
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastMessageAt: null,
      messageCount: 0,
    };
    loadConversation(conv);
    setShowAiChat(true);
  };

  // Dismiss AI chat when switching to content mode
  const handleSidebarModeChange = (mode: "content" | "ai") => {
    setSidebarMode(mode);
    if (mode === "content") {
      setShowAiChat(false);
    }
  };

  // Function to toggle full-screen mode
  const toggleAssistantFullScreen = () => {
    if (!assistantOpen) {
      setAssistantOpen(true);
      setAssistantFullScreen(true);
    } else if (assistantFullScreen) {
      // When exiting fullscreen, return to panel mode
      setAssistantFullScreen(false);
    } else {
      // When entering fullscreen from panel mode
      setAssistantFullScreen(true);
    }
  };

  // Function to close assistant completely from fullscreen mode
  const closeAssistantFromFullScreen = () => {
    setAssistantOpen(false);
    setAssistantFullScreen(false);
    setPreAttachedAssets([]);
  };

  const handleSelectConversation = (conversation: ConversationSummary) => {
    loadConversation(conversation);
  };

  const handleEditConversationTitle = async (newTitle: string) => {
    if (!currentConversation) return;
    try {
      const updatedSession = await updateSession(currentConversation.id, {
        title: newTitle,
      });
      setCurrentConversation(updatedSession);
    } catch (error) {
      console.error("Failed to update conversation title:", error);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteSession(id);
      if (currentConversation?.id === id) {
        startNewConversation();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
      throw error;
    }
  };

  const handleDeleteAllConversations = async () => {
    try {
      const response = await listSessions(1000, 0, assistantAgentId);
      await Promise.all(response.items.map((c) => deleteSession(c.id)));
      startNewConversation();
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
      throw error;
    }
  };

  const handleKeyDownBase = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Agent dropdown options for the assistant panel
  const dropdownAgents = useMemo(
    () => agentRailItems.map((a) => ({ id: a.id, name: a.name, kind: a.kind })),
    [agentRailItems],
  );

  // Slash commands
  const slashAgents = useMemo(
    () =>
      agentRailItems.map((a) => ({
        id: a.id,
        name: a.name,
        skillNames: a.skillNames,
      })),
    [agentRailItems],
  );

  // Use refs for callbacks to keep slashActions stable across renders
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const startNewConversationRef = useRef(startNewConversation);
  startNewConversationRef.current = startNewConversation;

  const handleAgentSwitch = useCallback((agentId: string) => {
    setAssistantAgentId(agentId);
    startNewConversationRef.current();
  }, []);

  const slashActions = useMemo(
    () => ({
      onNewConversation: () => startNewConversationRef.current(),
      onClearConversation: () => startNewConversationRef.current(),
      onShowHistory: () => setShowHistory(true),
      onToggleThinking: () => {},
      onShowModel: () => {},
      onShowHelp: () => {},
      onSwitchAgent: (agentId: string) => {
        setAssistantAgentId(agentId);
        startNewConversationRef.current();
      },
      onSendMessage: (text: string) => handleSendRef.current(text),
    }),
    [],
  );

  const slash = useSlashCommands({
    assistantAgentId,
    agents: slashAgents,
    input,
    setInput,
    actions: slashActions,
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slash.interceptKeyDown(e)) return;
    handleKeyDownBase(e);
  };

  const handleSendWithSlash = (textOverride?: string) => {
    const text = textOverride || input;
    if (slash.interceptSend(text)) return;
    handleSend(textOverride);
  };

  const slashPaletteConfig = slash.palette.open
    ? {
        open: true as const,
        items: slash.palette.items,
        onSelect: slash.handleSelect,
        onClose: slash.closePalette,
      }
    : undefined;

  // Make this function available globally
  if (typeof window !== "undefined") {
    (window as any).openAssistantWithAssets = openAssistantWithAssets;
  }

  // Conditional rendering for mobile vs desktop
  if (isMobile) {
    return (
      <DashboardMobileLayout
        chat={chat}
        showThinkingTokens={assistantPreferences.showThinkingTokens}
        handleSend={handleSendWithSlash}
        handleKeyDown={handleKeyDown}
        startNewConversation={startNewConversation}
        onSelectConversation={handleSelectConversation}
        onEditConversationTitle={handleEditConversationTitle}
        onDeleteConversation={handleDeleteConversation}
        onDeleteAllConversations={handleDeleteAllConversations}
        slashPalette={slashPaletteConfig}
      >
        {children}
      </DashboardMobileLayout>
    );
  }

  // Desktop layout (original)
  return (
    <div className="flex flex-col h-screen">
      {/* Top Bar */}
      <div className="sticky top-0 z-50">
        <TopBar
          onAssistantToggle={() => setAssistantOpen(!assistantOpen)}
          assistantOpen={assistantOpen}
          onAssistantFullScreenToggle={toggleAssistantFullScreen}
          assistantFullScreen={assistantFullScreen}
        />
      </div>

      {/* Main Content (3-column layout) */}
      <div className="flex flex-1 overflow-hidden main-layout-container">
        {/* Left Sidebar (Rail + Contextual Panel) */}
        <SidebarShell
          mode={sidebarMode}
          onModeChange={handleSidebarModeChange}
          navigation={navigation}
          agents={agentRailItems}
          agentStatuses={agentStatuses}
          activeConversationId={currentConversation?.id ?? null}
          showAiChat={showAiChat}
          onNewChat={handleNewChatFromSidebar}
          onSelectConversation={handleSelectConversationFromSidebar}
          onSelectActivity={handleSelectActivityFromSidebar}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Middle Content */}
        {showAiChat ? (
          <div className="flex-1 flex flex-col min-h-0">
            <ChatPanel
              messages={messages}
              isLoading={isLoadingConversation}
              currentConversation={currentConversation}
              input={input}
              setInput={setInput}
              handleSend={handleSendWithSlash}
              handleKeyDown={handleKeyDown}
              attachedAssets={attachedAssets}
              setAttachedAssets={setAttachedAssets}
              isStreaming={isStreaming}
              streamingThought={streamingThought}
              streamingText={streamingText}
              streamingToolCalls={streamingToolCalls}
              onApproveToolCall={handleApproveToolCall}
              onDenyToolCall={handleDenyToolCall}
              showThinkingTokens={assistantPreferences.showThinkingTokens}
              slashPalette={slashPaletteConfig}
              className="h-full"
            />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <main className="p-6">{children}</main>
          </div>
        )}

        {/* Right Sidebar (Assistant) - conditionally rendered only when not in full-screen */}
        {assistantOpen && !assistantFullScreen && (
          <div
            className="border-l bg-background overflow-y-auto flex-shrink-0 relative"
            style={{ width: assistantWidth }}
          >
            {/* Resize Handle - spans full height with higher z-index */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize assistant panel"
              tabIndex={0}
              className={`absolute left-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/20 ${
                isResizing ? "bg-primary/40" : ""
              } transition-colors z-50`}
              onMouseDown={handleMouseDown}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft") {
                  setAssistantWidth((w) => Math.min(w + 20, 800));
                } else if (e.key === "ArrowRight") {
                  setAssistantWidth((w) => Math.max(w - 20, 300));
                }
              }}
              style={{ marginLeft: "-4px" }}
            />
            <GlobalAssistant
              open={assistantOpen}
              onOpenChange={(open) => {
                setAssistantOpen(open);
                if (!open) {
                  // Clear pre-attached assets when closing
                  setPreAttachedAssets([]);
                  // Also exit full-screen mode when closing
                  setAssistantFullScreen(false);
                }
              }}
              fullScreen={assistantFullScreen}
              onFullScreenToggle={toggleAssistantFullScreen}
              agents={dropdownAgents}
              currentAgentId={assistantAgentId}
              onSwitchAgent={handleAgentSwitch}
              // Pass all conversation state
              messages={messages}
              isLoading={isLoadingConversation}
              messagesEndRef={messagesEndRef}
              attachedAssets={attachedAssets}
              setAttachedAssets={setAttachedAssets}
              input={input}
              inputRef={inputRef}
              setInput={setInput}
              handleKeyDown={handleKeyDown}
              handleSend={handleSendWithSlash}
              startNewConversation={startNewConversation}
              currentConversation={currentConversation}
              onEditConversationTitle={handleEditConversationTitle}
              onShowHistory={() => setShowHistory(true)}
              showHistory={showHistory}
              onSetShowHistory={setShowHistory}
              onSelectConversation={handleSelectConversation}
              onDeleteConversation={handleDeleteConversation}
              onDeleteAllConversations={handleDeleteAllConversations}
              // Streaming props (always enabled)
              isStreaming={isStreaming}
              streamingThought={streamingThought}
              streamingText={streamingText}
              streamingToolCalls={streamingToolCalls}
              onApproveToolCall={handleApproveToolCall}
              onDenyToolCall={handleDenyToolCall}
              showThinkingTokens={assistantPreferences.showThinkingTokens}
              slashPalette={slashPaletteConfig}
            />
          </div>
        )}
      </div>

      {/* Full-Screen Assistant - rendered outside main layout */}
      {assistantOpen && assistantFullScreen && (
        <GlobalAssistant
          open={assistantOpen}
          onOpenChange={closeAssistantFromFullScreen}
          fullScreen={assistantFullScreen}
          onFullScreenToggle={toggleAssistantFullScreen}
          agents={dropdownAgents}
          currentAgentId={assistantAgentId}
          onSwitchAgent={handleAgentSwitch}
          // Pass all conversation state
          messages={messages}
          isLoading={isLoadingConversation}
          messagesEndRef={messagesEndRef}
          attachedAssets={attachedAssets}
          setAttachedAssets={setAttachedAssets}
          input={input}
          inputRef={inputRef}
          setInput={setInput}
          handleKeyDown={handleKeyDown}
          handleSend={handleSendWithSlash}
          startNewConversation={startNewConversation}
          currentConversation={currentConversation}
          onEditConversationTitle={handleEditConversationTitle}
          onShowHistory={() => setShowHistory(true)}
          showHistory={showHistory}
          onSetShowHistory={setShowHistory}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onDeleteAllConversations={handleDeleteAllConversations}
          // Streaming props (always enabled)
          isStreaming={isStreaming}
          streamingThought={streamingThought}
          streamingText={streamingText}
          streamingToolCalls={streamingToolCalls}
          showThinkingTokens={assistantPreferences.showThinkingTokens}
          slashPalette={slashPaletteConfig}
        />
      )}

      {/* Assistant Overlay - shown when assistant is not visible and overlay is enabled */}
      {!assistantOpen && assistantPreferences.showAssistantOverlay && (
        <AssistantOverlay
          onFullScreenChat={() => {
            setAssistantOpen(true);
            setAssistantFullScreen(true);
          }}
          onWindowedChat={() => {
            setAssistantOpen(true);
            setAssistantFullScreen(false);
          }}
          onAssignTask={() => {
            // Navigate to tasks page with parameter to open dialog
            navigate({ to: "/tasks", search: { openDialog: "ai" } });
          }}
        />
      )}
    </div>
  );
}
