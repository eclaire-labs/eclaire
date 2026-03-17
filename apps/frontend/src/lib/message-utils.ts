import type { BackendMessage } from "@/types/conversation";
import type { AgentExecutionSummary, Message } from "@/types/message";

function extractExecutionSummary(
  metadata?: Record<string, unknown>,
): AgentExecutionSummary | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const stepCount = metadata.stepCount;
  if (typeof stepCount !== "number" || stepCount === 0) return undefined;

  return {
    stepCount,
    totalToolCalls:
      typeof metadata.totalToolCalls === "number" ? metadata.totalToolCalls : 0,
    totalDurationMs:
      typeof metadata.totalDurationMs === "number"
        ? metadata.totalDurationMs
        : undefined,
  };
}

export function convertBackendMessage(msg: BackendMessage): Message {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: new Date(msg.createdAt),
    thinkingContent: msg.thinkingContent,
    toolCalls: msg.toolCalls,
    executionSummary: extractExecutionSummary(msg.metadata),
  };
}
