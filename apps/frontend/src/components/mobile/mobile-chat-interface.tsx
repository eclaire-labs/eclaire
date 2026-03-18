import type { SlashItem } from "@eclaire/core/slash";
import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { Bot, Edit2, History, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/assistant/chat-panel";
import type { ToolCall } from "@/components/assistant/tool-execution-tracker";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listSessions } from "@/lib/api-sessions";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, Message } from "@/types/message";

interface MobileChatInterfaceProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;
  input: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  setInput: (input: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  startNewConversation: () => void;
  currentConversation: ConversationSummary | null;
  onEditConversationTitle: (title: string) => void;
  onSelectConversation?: (conversation: ConversationSummary) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAllConversations: () => void;
  isStreaming: boolean;
  streamingThought: string;
  streamingText: string;
  streamingToolCalls: ToolCall[];
  showThinkingTokens: boolean;
  slashPalette?: {
    open: boolean;
    items: SlashItem[];
    onSelect: (item: SlashItem) => void;
    onClose: () => void;
  };
}

export function MobileChatInterface({
  messages,
  isLoading,
  messagesEndRef: _messagesEndRef,
  attachedAssets,
  setAttachedAssets,
  input,
  inputRef: _inputRef,
  setInput,
  handleKeyDown,
  handleSend,
  startNewConversation,
  currentConversation,
  onEditConversationTitle,
  onSelectConversation,
  onDeleteConversation,
  onDeleteAllConversations: _onDeleteAllConversations,
  isStreaming,
  streamingThought,
  streamingText,
  streamingToolCalls,
  showThinkingTokens,
  slashPalette,
}: MobileChatInterfaceProps) {
  const [showHistory, setShowHistory] = useState(false);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  // Load conversations when history is opened
  useEffect(() => {
    if (showHistory) {
      setIsLoadingConversations(true);
      listSessions(50, 0, DEFAULT_AGENT_ACTOR_ID)
        .then((response) => {
          setConversations(response.items);
        })
        .catch((error) => {
          console.error("Failed to load conversations:", error);
        })
        .finally(() => {
          setIsLoadingConversations(false);
        });
    }
  }, [showHistory]);

  const handleSelectConversation = async (
    conversation: ConversationSummary,
  ) => {
    setShowHistory(false);
    if (onSelectConversation) {
      onSelectConversation(conversation);
    }
  };

  const handleStartEditing = () => {
    setEditTitle(currentConversation?.title || "");
    setEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && currentConversation) {
      onEditConversationTitle(editTitle.trim());
    }
    setEditingTitle(false);
  };

  const handleDeleteCurrentConversation = () => {
    if (currentConversation) {
      onDeleteConversation(currentConversation.id);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Mobile Chat Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              <Bot className="h-4 w-4" />
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={handleSaveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSaveTitle();
                  } else if (e.key === "Escape") {
                    setEditingTitle(false);
                  }
                }}
                className="h-7 text-sm"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="font-medium text-sm truncate">
                  {currentConversation?.title || "New Chat"}
                </h1>
                {currentConversation && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleStartEditing}
                    className="h-6 w-6 p-0"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={startNewConversation}
            className="h-8 w-8 p-0"
          >
            <Plus className="h-4 w-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="h-8 w-8 p-0"
          >
            <History className="h-4 w-4" />
          </Button>

          {currentConversation && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDeleteCurrentConversation}
              className="h-8 w-8 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* History Sidebar */}
      {showHistory && (
        <div className="border-b bg-muted/30">
          <div className="p-3">
            <h2 className="text-sm font-medium mb-2">Recent Conversations</h2>
            <ScrollArea className="h-32">
              {isLoadingConversations ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : conversations.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No conversations yet
                </div>
              ) : (
                <div className="space-y-1">
                  {conversations.map((conversation) => (
                    <button
                      type="button"
                      key={conversation.id}
                      onClick={() => handleSelectConversation(conversation)}
                      className="w-full text-left p-2 text-sm rounded hover:bg-muted/50 truncate"
                    >
                      {conversation.title}
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Chat Panel - Full Height */}
      <div className="flex-1 min-h-0">
        <ChatPanel
          messages={messages}
          isLoading={isLoading}
          currentConversation={currentConversation}
          input={input}
          setInput={setInput}
          handleSend={handleSend}
          handleKeyDown={handleKeyDown}
          attachedAssets={attachedAssets}
          setAttachedAssets={setAttachedAssets}
          isStreaming={isStreaming}
          streamingThought={streamingThought}
          streamingText={streamingText}
          streamingToolCalls={streamingToolCalls}
          showThinkingTokens={showThinkingTokens}
          slashPalette={slashPalette}
        />
      </div>
    </div>
  );
}
