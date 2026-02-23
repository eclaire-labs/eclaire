import {
  CheckSquare,
  Edit2,
  History,
  Maximize2,
  Minimize2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { ChatPanel } from "@/components/assistant/chat-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type BackendMessage,
  type ConversationSummary,
  getConversations,
} from "@/lib/frontend-api";
import type { AssetReference, Message } from "@/types/message";

// Helper function to convert backend messages to frontend format
function _convertBackendMessage(msg: BackendMessage): Message {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    thinkingContent: msg.thinkingContent,
  };
}

interface GlobalAssistantProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullScreen?: boolean;
  onFullScreenToggle?: () => void;
  // Conversation state props
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.Ref<HTMLDivElement>;
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;
  input: string;
  inputRef: React.Ref<HTMLInputElement>;
  setInput: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  startNewConversation: () => void;
  isClient: boolean;
  currentConversation: ConversationSummary | null;
  onEditConversationTitle: (newTitle: string) => void;
  onShowHistory: () => void;
  showHistory: boolean;
  onSetShowHistory: (show: boolean) => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAllConversations: () => void;
  // Streaming state props (always enabled)
  isStreaming?: boolean;
  streamingThought?: string;
  streamingText?: string;
  streamingToolCalls?: any[];
  showThinkingTokens?: boolean;
}

// --- Helper Component: ConversationHistoryDialog ---
interface ConversationHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAllConversations: () => void;
  currentConversationId?: string;
}

const ConversationHistoryDialog = ({
  open,
  onOpenChange,
  onSelectConversation,
  onDeleteConversation,
  onDeleteAllConversations,
  currentConversationId,
}: ConversationHistoryDialogProps) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: loadConversations defined after hook
  useEffect(() => {
    if (open) {
      loadConversations();
    }
  }, [open]);

  const loadConversations = async () => {
    setIsLoading(true);
    try {
      const response = await getConversations(50, 0);
      setConversations(response.conversations);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await onDeleteConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await onDeleteAllConversations();
      setConversations([]);
    } catch (error) {
      console.error("Failed to delete all conversations:", error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Conversation History
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="flex space-x-2">
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce"></div>
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.2s]"></div>
                <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.4s]"></div>
              </div>
            </div>
          ) : conversations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No conversations yet
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-4">
                {conversations.map((conversation) => (
                  // biome-ignore lint/a11y/useSemanticElements: complex flex layout not suited for button element
                  <div
                    key={conversation.id}
                    role="button"
                    tabIndex={0}
                    className={`p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                      conversation.id === currentConversationId
                        ? "bg-muted border-primary"
                        : "hover:border-muted-foreground/20"
                    }`}
                    onClick={() => {
                      onSelectConversation(conversation);
                      onOpenChange(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectConversation(conversation);
                        onOpenChange(false);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-sm truncate">
                          {conversation.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          {conversation.messageCount} messages
                        </p>
                        {conversation.lastMessageAt && (
                          <p className="text-xs text-muted-foreground">
                            {new Date(
                              conversation.lastMessageAt,
                            ).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteConversation(conversation.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
        {conversations.length > 0 && (
          <div className="border-t pt-3 mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteAll}
              className="w-full text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Conversations
            </Button>
          </div>
        )}
      </DialogContent>
  </Dialog>
  )
};

// --- Helper Component: AssistantContent ---
interface AssistantContentProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: React.Ref<HTMLDivElement>;
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;
  input: string;
  inputRef: React.Ref<HTMLInputElement>;
  setInput: (value: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  startNewConversation: () => void;
  onFullScreenToggle?: () => void;
  fullScreen: boolean;
  onOpenChange: (open: boolean) => void;
  isClient: boolean;
  currentConversation: ConversationSummary | null;
  onEditConversationTitle: (newTitle: string) => void;
  onShowHistory: () => void;
  // Streaming props (always enabled)
  isStreaming?: boolean;
  streamingThought?: string;
  streamingText?: string;
  streamingToolCalls?: any[];
  showThinkingTokens?: boolean;
}

const AssistantContent = ({
  messages,
  isLoading,
  messagesEndRef,
  attachedAssets,
  setAttachedAssets,
  input,
  inputRef,
  setInput,
  handleKeyDown,
  handleSend,
  startNewConversation,
  onFullScreenToggle,
  fullScreen,
  onOpenChange,
  isClient,
  currentConversation,
  onEditConversationTitle,
  onShowHistory,
  isStreaming = false,
  streamingThought,
  streamingText,
  streamingToolCalls = [],
  showThinkingTokens = true,
}: AssistantContentProps) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const handleStartEditTitle = () => {
    setEditTitle(currentConversation?.title || "New Conversation");
    setIsEditingTitle(true);
  };

  const handleSaveTitle = () => {
    if (editTitle.trim() && editTitle !== currentConversation?.title) {
      onEditConversationTitle(editTitle.trim());
    }
    setIsEditingTitle(false);
  };

  const handleCancelEdit = () => {
    setIsEditingTitle(false);
    setEditTitle("");
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2.5 border-b">
        <div className="flex-1 min-w-0">
          {isEditingTitle ? (
            <div className="flex items-center gap-2">
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                  if (e.key === "Escape") handleCancelEdit();
                }}
                className="h-8 text-sm font-semibold"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSaveTitle}
                className="h-6 w-6"
              >
                <CheckSquare className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCancelEdit}
                className="h-6 w-6"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm truncate">
                {currentConversation?.title || "AI Assistant"}
              </h2>
              {currentConversation && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartEditTitle}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onShowHistory}
            className="h-8 w-8"
            aria-label="Conversation History"
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={startNewConversation}
            className="h-8 w-8"
            aria-label="New Conversation"
          >
            <Plus className="h-4 w-4" />
          </Button>
          {onFullScreenToggle && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onFullScreenToggle}
              className="h-8 w-8"
              aria-label={fullScreen ? "Exit Full Screen" : "Enter Full Screen"}
            >
              {fullScreen ? (
                <Minimize2 className="h-4 w-4" />
              ) : (
                <Maximize2 className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="h-8 w-8"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* This container must be constrained. `min-h-0` prevents the flex item
          from growing beyond the available space, which is crucial for the
          child's scrolling behavior to work. */}
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
          isClient={isClient}
          className="border-0 h-full"
        />
      </div>
    </div>
  );
};

// --- Main Component: GlobalAssistant ---
export function GlobalAssistant({
  open,
  onOpenChange,
  fullScreen = false,
  onFullScreenToggle,
  // Conversation state props
  messages,
  isLoading,
  messagesEndRef,
  attachedAssets,
  setAttachedAssets,
  input,
  inputRef,
  setInput,
  handleKeyDown,
  handleSend,
  startNewConversation,
  isClient,
  currentConversation,
  onEditConversationTitle,
  onShowHistory,
  showHistory,
  onSetShowHistory,
  onSelectConversation,
  onDeleteConversation,
  onDeleteAllConversations,
  // Streaming props (always enabled)
  isStreaming = false,
  streamingThought,
  streamingText,
  streamingToolCalls = [],
  showThinkingTokens = true,
}: GlobalAssistantProps) {
  if (!open) return null;

  const assistantContentProps = {
    messages,
    isLoading,
    messagesEndRef,
    attachedAssets,
    setAttachedAssets,
    input,
    inputRef,
    setInput,
    handleKeyDown,
    handleSend,
    startNewConversation,
    onFullScreenToggle,
    fullScreen,
    onOpenChange,
    isClient,
    currentConversation,
    onEditConversationTitle,
    onShowHistory,
    // Streaming props (always enabled)
    isStreaming,
    streamingThought,
    streamingText,
    streamingToolCalls,
    showThinkingTokens,
  };

  if (fullScreen) {
    return (
      <>
        <Dialog
          open={fullScreen}
          onOpenChange={(open) => !open && onOpenChange(false)}
        >
          <DialogContent
            className="max-w-[95vw] max-h-[95vh] h-[90vh] w-[90vw] p-0 flex flex-col overflow-hidden"
            onInteractOutside={(e) => e.preventDefault()}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader className="sr-only">
              <DialogTitle>AI Assistant - Full Screen</DialogTitle>
            </DialogHeader>
            <AssistantContent {...assistantContentProps} />
          </DialogContent>
        </Dialog>
        <ConversationHistoryDialog
          open={showHistory}
          onOpenChange={onSetShowHistory}
          onSelectConversation={onSelectConversation}
          onDeleteConversation={onDeleteConversation}
          onDeleteAllConversations={onDeleteAllConversations}
          currentConversationId={currentConversation?.id}
        />
      </>
    );
  }

  return (
    <>
      <AssistantContent {...assistantContentProps} />
      <ConversationHistoryDialog
        open={showHistory}
        onOpenChange={onSetShowHistory}
        onSelectConversation={onSelectConversation}
        onDeleteConversation={onDeleteConversation}
        onDeleteAllConversations={onDeleteAllConversations}
        currentConversationId={currentConversation?.id}
      />
    </>
  );
}
