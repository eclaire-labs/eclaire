import type { BackendMessage } from "@/types/conversation";
import type { Message } from "@/types/message";

export function convertBackendMessage(msg: BackendMessage): Message {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    thinkingContent: msg.thinkingContent,
    toolCalls: msg.toolCalls,
  };
}
