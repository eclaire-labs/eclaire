// components/assistant/chat-panel.tsx
"use client";

import { Card } from "@/components/ui/card";
import type { ConversationSummary } from "@/types/conversation";
import type { AssetReference, Message } from "@/types/message";
import { MessageInput } from "./message-input";
import { MessageList } from "./message-list";

interface ChatPanelProps {
  // Core state
  messages: Message[];
  isLoading: boolean;
  currentConversation: ConversationSummary | null;

  // Input handling
  input: string;
  setInput: (value: string) => void;
  handleSend: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;

  // Asset attachment
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;

  // Streaming state
  isStreaming?: boolean;
  streamingThought?: string;
  streamingText?: string;
  streamingToolCalls?: any[];
  showThinkingTokens?: boolean;

  // Client state
  isClient: boolean;

  // Layout control
  className?: string;
}

export function ChatPanel({
  messages,
  isLoading,
  currentConversation,
  input,
  setInput,
  handleSend,
  handleKeyDown,
  attachedAssets,
  setAttachedAssets,
  isStreaming = false,
  streamingThought,
  streamingText,
  streamingToolCalls = [],
  showThinkingTokens = true,
  isClient,
  className,
}: ChatPanelProps) {
  const handleSubmit = (content: string) => {
    // The actual sending logic is handled by the parent component
    // through the handleSend prop, so we just need to trigger it
    handleSend();
  };

  return (
    // The Card is the main flex container, taking full height and handling overflow.
    <Card className={`flex h-full flex-col overflow-hidden ${className}`}>
      {/* The message list area. `flex-1` makes it grow, and `overflow-y-auto`
          enables scrolling when content is too long. */}
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent hover:scrollbar-thumb-gray-400">
        <MessageList
          messages={messages}
          isLoading={isLoading || isStreaming}
          isStreaming={isStreaming}
          streamingThought={streamingThought}
          streamingText={streamingText}
          streamingToolCalls={streamingToolCalls}
          showThinkingTokens={showThinkingTokens}
          isClient={isClient}
        />
      </div>

      {/* The input area is a direct child of the flex container,
          so it remains at the bottom. A border provides visual separation. */}
      <div className="border-t">
        <MessageInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          isLoading={isLoading || isStreaming}
          attachedAssets={attachedAssets}
          setAttachedAssets={setAttachedAssets}
        />
      </div>
    </Card>
  );
}

export default ChatPanel;
