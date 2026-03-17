// components/chat/message-item.tsx

import { User } from "lucide-react";
import { AgentActivityView } from "@/components/assistant/agent-activity-view";
import { AIAvatar } from "@/components/assistant/ai-avatar";
import { AudioPlaybackButton } from "@/components/assistant/audio-playback-button";
import { MarkdownDisplay } from "@/components/markdown-display";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/message";
import { convertToToolCall } from "@/types/message";
import { ThinkingAccordion } from "./thinking-accordion";

interface MessageItemProps {
  message: Message;
  showThinkingTokens?: boolean;
  sessionId?: string;
}

export function MessageItem({
  message,
  showThinkingTokens = true,
  sessionId,
}: MessageItemProps) {
  const isUser = message.role === "user";
  const { data: auth } = useAuth();

  return (
    <div
      className={cn(
        "flex items-start gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser && <AIAvatar size="md" />}

      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-lg px-4 py-2.5",
          isUser
            ? "bg-primary text-primary-foreground"
            : message.isError
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : "bg-muted",
        )}
      >
        {/* Show thinking content for assistant messages if available and enabled */}
        {!isUser && message.thinkingContent && showThinkingTokens && (
          <div className="mb-3">
            <ThinkingAccordion content={message.thinkingContent} />
          </div>
        )}

        {/* Show agent activity for assistant messages if available */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3">
            <AgentActivityView
              sessionId={sessionId}
              messageId={message.id}
              executionSummary={message.executionSummary}
              toolCalls={message.toolCalls.map((summary, index) =>
                convertToToolCall(summary, index),
              )}
            />
          </div>
        )}

        {/* Message content */}
        {!isUser && !message.isError ? (
          <MarkdownDisplay
            content={message.content}
            className="text-sm prose-sm"
          />
        ) : (
          <p className="text-sm break-words overflow-wrap-anywhere whitespace-pre-wrap">
            {message.content}
          </p>
        )}

        {/* Image content */}
        {message.imageUrl && (
          <div className="mt-2">
            <img
              src={message.imageUrl}
              alt="AI generated content"
              className="max-w-full h-auto rounded-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}

        {/* Timestamp + audio playback */}
        <div className="flex items-center gap-1 mt-1">
          <p
            className={cn(
              "text-[10px]",
              isUser
                ? "text-primary-foreground/60"
                : "text-muted-foreground/60",
            )}
          >
            {message.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          {!isUser && !message.isError && (
            <AudioPlaybackButton text={message.content} />
          )}
        </div>
      </div>

      {isUser &&
        (auth?.user ? (
          <UserAvatar
            user={{
              email: auth.user.email,
              displayName:
                (auth.user as { displayName?: string }).displayName ??
                auth.user.name ??
                null,
              fullName:
                (auth.user as { fullName?: string }).fullName ??
                auth.user.name ??
                null,
              avatarUrl:
                (auth.user as { avatarUrl?: string }).avatarUrl ??
                auth.user.image ??
                null,
              id: auth.user.id,
            }}
            size="md"
          />
        ) : (
          <Avatar className="h-8 w-8">
            <AvatarFallback>
              <User className="h-5 w-5" />
            </AvatarFallback>
          </Avatar>
        ))}
    </div>
  );
}
