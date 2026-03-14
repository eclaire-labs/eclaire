import { DEFAULT_AGENT_ACTOR_ID } from "@eclaire/api-types";
import { History, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { listSessions } from "@/lib/api-sessions";
import type { ConversationSummary } from "@/types/conversation";

interface ConversationHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAllConversations: () => void;
  currentConversationId?: string;
  agentActorId?: string;
}

export const ConversationHistoryDialog = ({
  open,
  onOpenChange,
  onSelectConversation,
  onDeleteConversation,
  onDeleteAllConversations,
  currentConversationId,
  agentActorId,
}: ConversationHistoryDialogProps) => {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const loadConversations = async () => {
        setIsLoading(true);
        try {
          const response = await listSessions(
            50,
            0,
            agentActorId ?? DEFAULT_AGENT_ACTOR_ID,
          );
          setConversations(response.items);
        } catch (error) {
          console.error("Failed to load conversations:", error);
        } finally {
          setIsLoading(false);
        }
      };
      loadConversations();
    }
  }, [open, agentActorId]);

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
                    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role
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
  );
};
