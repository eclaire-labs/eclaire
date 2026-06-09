import type { SlashItem } from "@eclaire/core/slash";
import { History, MessageSquare, Plus } from "lucide-react";

import { ChatPanel } from "@/components/assistant/chat-panel";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AssistantChat } from "@/hooks/use-assistant-chat";

interface AgentChatPaneProps {
  chat: AssistantChat;
  sessionCount: number;
  showThinkingTokens: boolean;
  /** Send/keydown wrappers that route through slash-command interception. */
  handleSend: (textOverride?: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  onShowHistory: () => void;
  onNewChat: () => void;
  slashPalette?: {
    open: boolean;
    items: SlashItem[];
    onSelect: (item: SlashItem) => void;
    onClose: () => void;
  };
}

export function AgentChatPane({
  chat,
  sessionCount,
  showThinkingTokens,
  handleSend,
  handleKeyDown,
  onShowHistory,
  onNewChat,
  slashPalette,
}: AgentChatPaneProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Agent Chat
          </CardTitle>
          <CardDescription>
            Each chat stays pinned to this agent's current identity and
            capabilities.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {sessionCount > 0 && (
            <Button variant="outline" size="sm" onClick={onShowHistory}>
              <History className="mr-2 h-4 w-4" />
              History ({sessionCount})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onNewChat}>
            <Plus className="mr-2 h-4 w-4" />
            New Chat
          </Button>
        </div>
      </CardHeader>
      <CardContent className="h-[640px]">
        <ChatPanel
          messages={chat.messages}
          isLoading={chat.isLoadingConversation}
          currentConversation={chat.currentConversation}
          input={chat.input}
          setInput={chat.setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          attachedAssets={chat.attachedAssets}
          setAttachedAssets={chat.setAttachedAssets}
          isStreaming={chat.isStreaming}
          streamingThought={chat.streamingThought}
          streamingText={chat.streamingText}
          streamingToolCalls={chat.streamingToolCalls}
          onApproveToolCall={chat.handleApproveToolCall}
          onDenyToolCall={chat.handleDenyToolCall}
          showThinkingTokens={showThinkingTokens}
          slashPalette={slashPalette}
          className="h-full"
        />
        <div ref={chat.messagesEndRef} />
        <div ref={chat.inputRef} />
      </CardContent>
    </Card>
  );
}
