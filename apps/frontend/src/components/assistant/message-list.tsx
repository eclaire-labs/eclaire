// components/assistant/message-list.tsx
"use client";

import { Bot } from "lucide-react";
import { useEffect, useRef } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { StreamingMessage } from "@/components/ui/streaming-message";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { ToolExecutionTracker } from "@/components/ui/tool-execution-tracker";
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
    } catch (e) {
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
  streamingToolCalls?: any[];
  showThinkingTokens?: boolean;
  isClient?: boolean;
}

export function MessageList({
  messages,
  isLoading,
  isStreaming = false,
  streamingThought,
  streamingText,
  streamingToolCalls = [],
  showThinkingTokens = true,
  isClient = true,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the bottom when messages or streaming state changes
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [
    messages,
    isLoading,
    isStreaming,
    streamingText,
    streamingThought,
    streamingToolCalls,
  ]);

  // The ScrollArea component is removed. The parent now handles scrolling.
  return (
    <div className="p-4 space-y-6">
      {messages.map((msg) => (
        <MessageItem
          key={msg.id}
          message={msg}
          isClient={isClient}
          showThinkingTokens={showThinkingTokens}
        />
      ))}

      {/* Loading/Streaming indicators */}
      {(isLoading || isStreaming) && (
        <div className="flex justify-start">
          <div className="flex gap-2 max-w-[90%]">
            <Avatar className="h-8 w-8 flex-shrink-0">
              <AvatarFallback>
                <Bot className="h-4 w-4" />
              </AvatarFallback>
            </Avatar>
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
                  <div className="rounded-lg p-2.5 bg-muted">
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
                  <div className="flex items-center gap-2 rounded-lg p-3 bg-muted">
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
    </div>
  );
}

export default MessageList;
