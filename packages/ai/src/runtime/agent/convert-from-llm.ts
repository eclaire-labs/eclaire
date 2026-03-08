/**
 * Convert-from-LLM Boundary
 *
 * Transforms wire-format AIMessage types back to internal RuntimeMessage types.
 * This is the inverse of convertToLlm() and is used to load conversation history
 * from the database into the RuntimeAgent.
 */

import type {
  AIMessage,
  ImageContentPart,
  TextContentPart,
  ToolCallResult,
} from "../../types.js";
import type {
  AssistantContentBlock,
  AssistantMessage,
  RuntimeMessage,
  ToolResultMessage,
  UserContentBlock,
  UserMessage,
} from "../messages.js";

/**
 * Convert an array of AIMessages back to RuntimeMessage format.
 * System messages are filtered out (RuntimeAgent handles system prompt separately).
 */
export function convertFromLlm(messages: AIMessage[]): RuntimeMessage[] {
  const result: RuntimeMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    const converted = convertMessage(msg);
    if (converted) {
      result.push(converted);
    }
  }

  return result;
}

function convertMessage(msg: AIMessage): RuntimeMessage | null {
  switch (msg.role) {
    case "user":
      return convertUserMessage(msg);
    case "assistant":
      return convertAssistantMessage(msg);
    case "tool":
      return convertToolMessage(msg);
    default:
      return null;
  }
}

function convertUserMessage(msg: AIMessage): UserMessage {
  if (typeof msg.content === "string") {
    return { role: "user", content: msg.content, timestamp: 0 };
  }

  if (Array.isArray(msg.content)) {
    const blocks: UserContentBlock[] = (
      msg.content as Array<TextContentPart | ImageContentPart>
    ).map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
      }
      // image_url → ImageBlock: extract base64 data and mimeType from data URI
      const url = part.image_url.url;
      const dataUriMatch = url.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUriMatch) {
        return {
          type: "image" as const,
          mimeType: dataUriMatch[1]!,
          data: dataUriMatch[2]!,
        };
      }
      // Fallback for non-data URIs — store URL as data with a generic mime type
      return {
        type: "image" as const,
        mimeType: "image/png",
        data: url,
      };
    });

    return { role: "user", content: blocks, timestamp: 0 };
  }

  // Fallback: treat as string
  return { role: "user", content: String(msg.content ?? ""), timestamp: 0 };
}

function convertAssistantMessage(msg: AIMessage): AssistantMessage {
  const contentBlocks: AssistantContentBlock[] = [];

  // Thinking/reasoning
  if (msg.reasoning) {
    contentBlocks.push({ type: "thinking", text: msg.reasoning });
  }

  // Text content
  const text = typeof msg.content === "string" ? msg.content : "";
  if (text) {
    contentBlocks.push({ type: "text", text });
  }

  // Tool calls
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls as ToolCallResult[]) {
      let args: Record<string, unknown>;
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {
        args = {};
      }
      contentBlocks.push({
        type: "tool_call",
        id: tc.id,
        name: tc.function.name,
        arguments: args,
      });
    }
  }

  return {
    role: "assistant",
    content: contentBlocks,
  };
}

function convertToolMessage(msg: AIMessage): ToolResultMessage {
  const text = typeof msg.content === "string" ? msg.content : "";

  // Detect error results — mirrors the "Error: " prefix convention in convertToLlm
  const isError = text.startsWith("Error: ");
  const cleanText = isError ? text.slice(7) : text;

  return {
    role: "tool_result",
    toolCallId: msg.tool_call_id ?? "",
    toolName: msg.name ?? "",
    content: [{ type: "text", text: cleanText }],
    isError: isError || undefined,
  };
}
