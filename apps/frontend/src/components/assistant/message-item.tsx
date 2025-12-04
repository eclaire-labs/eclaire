// components/chat/message-item.tsx

import { User } from "lucide-react";
import { MarkdownDisplay } from "@/components/markdown-display";
import { AIAvatar } from "@/components/ui/ai-avatar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ToolExecutionTracker } from "@/components/ui/tool-execution-tracker";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/message";
import { convertToToolCall } from "@/types/message";
import { ThinkingAccordion } from "./thinking-accordion";

interface MessageItemProps {
  message: Message;
  isClient?: boolean;
  showThinkingTokens?: boolean;
}

export function MessageItem({
  message,
  isClient = true,
  showThinkingTokens = true,
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
          "max-w-[80%] space-y-2 rounded-lg px-4 py-3",
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

        {/* Show tool calls for assistant messages if available */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-3">
            <ToolExecutionTracker
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
              alt="AI generated image"
              className="max-w-full h-auto rounded-md"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}

        {/* Timestamp - only on client to prevent hydration mismatch */}
        {isClient && (
          <p className="text-xs mt-1 opacity-70">
            {message.timestamp.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        )}
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
