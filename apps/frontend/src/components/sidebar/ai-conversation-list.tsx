import { formatDistanceToNow } from "date-fns";
import { MessageSquare } from "lucide-react";
import { useConversations } from "@/hooks/use-conversations";
import type { ConversationSummary } from "@/types/conversation";

interface AiConversationListProps {
  activeConversationId: string | null;
  onSelectConversation: (conversation: ConversationSummary) => void;
}

export function AiConversationList({
  activeConversationId,
  onSelectConversation,
}: AiConversationListProps) {
  const { groups, isLoading } = useConversations();

  if (isLoading) {
    return (
      <div className="px-3 py-4 space-y-2">
        <div className="h-8 rounded-md bg-muted animate-pulse" />
        <div className="h-8 rounded-md bg-muted animate-pulse" />
        <div className="h-8 rounded-md bg-muted animate-pulse" />
        <div className="h-8 rounded-md bg-muted animate-pulse" />
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
        <MessageSquare className="h-8 w-8 opacity-40" />
        <p className="text-sm">No conversations yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 py-1.5">
            <span className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
              {group.label}
            </span>
          </div>
          <ul className="space-y-0.5">
            {group.conversations.map((conv) => {
              const isActive = activeConversationId === conv.id;
              const timeAgo = formatDistanceToNow(
                new Date(conv.lastMessageAt ?? conv.createdAt),
                { addSuffix: false },
              );
              return (
                <li key={conv.id}>
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm text-left transition-colors ${
                      isActive
                        ? "font-medium"
                        : "text-muted-foreground hover:bg-[hsl(var(--hover-bg))]"
                    }`}
                    style={
                      isActive
                        ? {
                            backgroundColor: `hsl(var(--sidebar-active-bg) / var(--sidebar-active-bg-opacity))`,
                            color: `hsl(var(--sidebar-active-text))`,
                          }
                        : undefined
                    }
                  >
                    {conv.hasUnreadResponse && (
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    )}
                    <span className="truncate flex-1">
                      {conv.title || "Untitled"}
                    </span>
                    <span className="text-xs text-muted-foreground/60 shrink-0">
                      {timeAgo}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
