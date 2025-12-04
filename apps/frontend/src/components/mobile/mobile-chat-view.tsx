
import type { RefObject } from "react";
import type { ToolCall } from "@/components/ui/tool-execution-tracker";
import type { ConversationSummary } from "@/lib/frontend-api";
import type { AssetReference, Message } from "@/types/message";
import { MobileChatInterface } from "./mobile-chat-interface";

interface MobileChatViewProps {
  messages: Message[];
  isLoading: boolean;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  attachedAssets: AssetReference[];
  setAttachedAssets: React.Dispatch<React.SetStateAction<AssetReference[]>>;
  input: string;
  inputRef: RefObject<HTMLInputElement | null>;
  setInput: (input: string) => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  handleSend: () => void;
  startNewConversation: () => void;
  isClient: boolean;
  currentConversation: ConversationSummary | null;
  onEditConversationTitle: (title: string) => void;
  onSelectConversation: (conversation: ConversationSummary) => void;
  onDeleteConversation: (id: string) => void;
  onDeleteAllConversations: () => void;
  isStreaming: boolean;
  streamingThought: string;
  streamingText: string;
  streamingToolCalls: ToolCall[];
  showThinkingTokens: boolean;
}

export function MobileChatView(props: MobileChatViewProps) {
  return (
    <div className="h-full w-full">
      <MobileChatInterface {...props} />
    </div>
  );
}
