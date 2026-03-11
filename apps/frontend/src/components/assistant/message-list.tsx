// components/assistant/message-list.tsx

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AIAvatar } from "@/components/assistant/ai-avatar";
import { StreamingMessage } from "@/components/assistant/streaming-message";
import { ThinkingIndicator } from "@/components/assistant/thinking-indicator";
import {
  type ToolCall,
  ToolExecutionTracker,
} from "@/components/assistant/tool-execution-tracker";
import { Button } from "@/components/ui/button";
import type { Message } from "@/types/message";
import { MessageItem } from "./message-item";
import { TypingIndicator } from "./typing-indicator";

// Helper function to clean streaming text for display
function getCleanStreamingText(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.includes('"type"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.type === "text_response" && parsed.response) {
        return parsed.response;
      }
      if (trimmed.includes('"type"') || trimmed.includes("text_response")) {
        return "";
      }
    } catch (_e) {
      if (trimmed.includes('"type"') || trimmed.includes("text_response")) {
        return "";
      }
    }
  }

  return text;
}

interface MessageListProps {
  messages: Message[];
  isLoading: boolean;
  isStreaming?: boolean;
  streamingThought?: string;
  streamingText?: string;
  streamingToolCalls?: ToolCall[];
  showThinkingTokens?: boolean;
  onSuggestedPrompt?: (prompt: string) => void;
}

export function MessageList({
  messages,
  isLoading,
  isStreaming = false,
  streamingThought,
  streamingText,
  streamingToolCalls = [],
  showThinkingTokens = true,
  onSuggestedPrompt,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Scroll to bottom when messages change or streaming updates
  // biome-ignore lint/correctness/useExhaustiveDependencies: these deps intentionally trigger scroll on content changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming, streamingText]);

  // Observe whether the bottom sentinel is visible
  useEffect(() => {
    const endEl = messagesEndRef.current;
    if (!endEl) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowScrollButton(!entry?.isIntersecting);
      },
      { threshold: 0.1 },
    );

    observer.observe(endEl);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Empty / welcome state
  const isEmptyState = messages.length === 0 && !isLoading && !isStreaming;

  if (isEmptyState) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <AIAvatar size="lg" className="mb-4" />
        <h3 className="text-lg font-semibold mb-1">AI Assistant</h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xs">
          Ask me anything about your documents, bookmarks, tasks, or notes.
        </p>
        {onSuggestedPrompt && (
          <div className="grid gap-2 w-full max-w-xs">
            <button
              type="button"
              className="text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => onSuggestedPrompt("Summarize my recent bookmarks")}
            >
              Summarize my recent bookmarks
            </button>
            <button
              type="button"
              className="text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => onSuggestedPrompt("What tasks are due this week?")}
            >
              What tasks are due this week?
            </button>
            <button
              type="button"
              className="text-left text-sm px-3 py-2 rounded-lg border hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => onSuggestedPrompt("Find my most recent notes")}
            >
              Find my most recent notes
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative p-4 space-y-4">
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          showThinkingTokens={showThinkingTokens}
        />
      ))}

      {/* Loading/Streaming indicators */}
      {(isLoading || isStreaming) && (
        <div className="flex justify-start">
          <div className="flex gap-2 max-w-[90%]">
            <AIAvatar size="md" className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="space-y-3">
                {/* Thinking indicator */}
                {streamingThought && showThinkingTokens && (
                  <ThinkingIndicator
                    content={streamingThought}
                    isActive={isStreaming}
                    className="mb-3"
                  />
                )}

                {/* Tool execution tracker */}
                {streamingToolCalls.length > 0 && (
                  <ToolExecutionTracker
                    toolCalls={streamingToolCalls}
                    className="mb-3"
                  />
                )}

                {/* Streaming text */}
                {streamingText && (
                  <div className="rounded-lg px-4 py-2.5 bg-muted">
                    <StreamingMessage
                      content={getCleanStreamingText(streamingText)}
                      isComplete={!isStreaming}
                      enableTypewriter={true}
                      showCursor={isStreaming}
                    />
                  </div>
                )}

                {/* Basic loading indicator */}
                {((isStreaming &&
                  !streamingThought &&
                  !streamingText &&
                  streamingToolCalls.length === 0) ||
                  (isLoading && !streamingThought)) && (
                  <div className="flex items-center gap-2 rounded-lg px-4 py-2.5 bg-muted">
                    <TypingIndicator />
                    <span className="text-sm text-muted-foreground">
                      {isStreaming ? "Thinking..." : "Processing..."}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />

      {/* Scroll-to-bottom button */}
      {showScrollButton && (
        <div className="sticky bottom-2 flex justify-center pointer-events-none">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full shadow-md pointer-events-auto h-8 w-8"
            onClick={scrollToBottom}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default MessageList;
