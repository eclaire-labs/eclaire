// components/assistant/chat-panel.tsx

import type { SlashItem } from "@eclaire/core/slash";
import { useEffect, useRef } from "react";
import type { ToolCall } from "@/components/assistant/tool-execution-tracker";
import { Card } from "@/components/ui/card";
import { useStreamingPlayback } from "@/hooks/use-streaming-playback";
import { useAssistantPreferences } from "@/providers/AssistantPreferencesProvider";
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
  handleSend: (textOverride?: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;

  // Asset attachment
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;

  // Streaming state
  isStreaming?: boolean;
  streamingThought?: string;
  streamingText?: string;
  streamingToolCalls?: ToolCall[];
  showThinkingTokens?: boolean;
  onApproveToolCall?: (toolCallId: string) => void;
  onDenyToolCall?: (toolCallId: string) => void;

  // Slash palette
  slashPalette?: {
    open: boolean;
    items: SlashItem[];
    onSelect: (item: SlashItem) => void;
    onClose: () => void;
  };

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
  onApproveToolCall,
  onDenyToolCall,
  slashPalette,
  className,
}: ChatPanelProps) {
  const [preferences] = useAssistantPreferences();
  const autoPlayback = useStreamingPlayback();
  const prevStreamingRef = useRef(false);
  // Refs to avoid re-triggering the auto-play effect on every render
  const messagesRef = useRef(messages);
  const preferencesRef = useRef(preferences);
  const autoPlaybackRef = useRef(autoPlayback);
  messagesRef.current = messages;
  preferencesRef.current = preferences;
  autoPlaybackRef.current = autoPlayback;

  const handleSubmit = (content: string) => {
    handleSend(content);
  };

  // Auto-play TTS when assistant response completes in voice mode.
  useEffect(() => {
    if (
      prevStreamingRef.current &&
      !isStreaming &&
      preferencesRef.current.autoPlayTTS &&
      messagesRef.current.length > 0
    ) {
      const lastMsg = messagesRef.current[messagesRef.current.length - 1];
      if (lastMsg?.role === "assistant" && !lastMsg.isError) {
        autoPlaybackRef.current.play(lastMsg.content);
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming]);

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
          sessionId={currentConversation?.id}
          onApproveToolCall={onApproveToolCall}
          onDenyToolCall={onDenyToolCall}
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
          onStopAutoPlay={autoPlayback.stop}
          slashPalette={slashPalette}
        />
      </div>
    </Card>
  );
}

export default ChatPanel;
