import type { SlashItem } from "@eclaire/core/slash";
import {
  CheckSquare,
  Edit2,
  History,
  Maximize2,
  Minimize2,
  Plus,
  X,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { ChatPanel } from "@/components/assistant/chat-panel";
import { ConversationHistoryDialog } from "@/components/assistant/conversation-history-dialog";
import type { ToolCall } from "@/components/assistant/tool-execution-tracker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, Message } from "@/types/message";

interface SlashPaletteConfig {
  open: boolean;
  items: SlashItem[];
  onSelect: (item: SlashItem) => void;
  onClose: () => void;
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
  handleSend: (textOverride?: string) => void;
  startNewConversation: () => void;
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
  streamingToolCalls?: ToolCall[];
  showThinkingTokens?: boolean;
  // Slash commands
  slashPalette?: SlashPaletteConfig;
}

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
  handleSend: (textOverride?: string) => void;
  startNewConversation: () => void;
  onFullScreenToggle?: () => void;
  fullScreen: boolean;
  onOpenChange: (open: boolean) => void;
  currentConversation: ConversationSummary | null;
  onEditConversationTitle: (newTitle: string) => void;
  onShowHistory: () => void;
  // Streaming props (always enabled)
  isStreaming?: boolean;
  streamingThought?: string;
  streamingText?: string;
  streamingToolCalls?: ToolCall[];
  showThinkingTokens?: boolean;
  // Slash commands
  slashPalette?: SlashPaletteConfig;
}

const AssistantContent = ({
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
  onFullScreenToggle,
  fullScreen,
  onOpenChange,
  currentConversation,
  onEditConversationTitle,
  onShowHistory,
  isStreaming = false,
  streamingThought,
  streamingText,
  streamingToolCalls = [],
  showThinkingTokens = true,
  slashPalette,
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
      <div className="flex items-center justify-between px-3 py-2.5 border-b bg-background/95 backdrop-blur-sm">
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
          slashPalette={slashPalette}
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
  slashPalette,
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
    currentConversation,
    onEditConversationTitle,
    onShowHistory,
    // Streaming props (always enabled)
    isStreaming,
    streamingThought,
    streamingText,
    streamingToolCalls,
    showThinkingTokens,
    // Slash commands
    slashPalette,
  };

  if (fullScreen) {
    return (
      <>
        <Dialog
          open={fullScreen}
          onOpenChange={(open) => !open && onOpenChange(false)}
        >
          <DialogContent
            className="max-w-[95vw] max-h-[95vh] h-[90vh] w-[90vw] p-0 flex flex-col overflow-hidden [&>button:last-child]:hidden"
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
