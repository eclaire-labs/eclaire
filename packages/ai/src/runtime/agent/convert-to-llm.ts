/**
 * Convert-to-LLM Boundary
 *
 * Transforms internal RuntimeMessage types to the wire-format AIMessage
 * used by dialect adapters. This is the single point where internal
 * message semantics are mapped to provider-facing format.
 */

import type {
  AIMessage,
  TextContentPart,
  ImageContentPart,
  ToolCallResult,
} from "../../types.js";
import type {
  RuntimeMessage,
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  AssistantContentBlock,
} from "../messages.js";

/**
 * Convert an array of runtime messages to AIMessage format for the LLM.
 * System message is handled separately (first in the array).
 */
export function convertToLlm(
  systemPrompt: string,
  messages: RuntimeMessage[],
): AIMessage[] {
  const result: AIMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of messages) {
    const converted = convertMessage(msg);
    result.push(...converted);
  }

  return result;
}

/**
 * Convert a single runtime message to one or more AIMessages.
 * A ToolResultMessage becomes a "tool" role message.
 * An AssistantMessage may produce one message.
 */
function convertMessage(msg: RuntimeMessage): AIMessage[] {
  switch (msg.role) {
    case "user":
      return [convertUserMessage(msg)];
    case "assistant":
      return [convertAssistantMessage(msg)];
    case "tool_result":
      return [convertToolResultMessage(msg)];
  }
}

function convertUserMessage(msg: UserMessage): AIMessage {
  if (typeof msg.content === "string") {
    return { role: "user", content: msg.content };
  }

  const parts: Array<TextContentPart | ImageContentPart> = msg.content.map(
    (block) => {
      if (block.type === "text") {
        return { type: "text" as const, text: block.text };
      }
      // image → image_url with data URI
      return {
        type: "image_url" as const,
        image_url: {
          url: `data:${block.mimeType};base64,${block.data}`,
        },
      };
    },
  );

  return { role: "user", content: parts };
}

function convertAssistantMessage(msg: AssistantMessage): AIMessage {
  // Extract text content
  const textParts = msg.content.filter(
    (b): b is Extract<AssistantContentBlock, { type: "text" }> =>
      b.type === "text",
  );
  const content = textParts.map((b) => b.text).join("");

  // Extract thinking/reasoning
  const thinkingParts = msg.content.filter(
    (b): b is Extract<AssistantContentBlock, { type: "thinking" }> =>
      b.type === "thinking",
  );
  const reasoning =
    thinkingParts.length > 0
      ? thinkingParts.map((b) => b.text).join("")
      : undefined;

  // Extract tool calls
  const toolCallBlocks = msg.content.filter(
    (b): b is Extract<AssistantContentBlock, { type: "tool_call" }> =>
      b.type === "tool_call",
  );
  const toolCalls: ToolCallResult[] | undefined =
    toolCallBlocks.length > 0
      ? toolCallBlocks.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }))
      : undefined;

  return {
    role: "assistant",
    content,
    reasoning,
    tool_calls: toolCalls,
  };
}

function convertToolResultMessage(msg: ToolResultMessage): AIMessage {
  // Combine all text content blocks into a single string for the model
  const textContent = msg.content
    .filter(
      (b): b is Extract<(typeof msg.content)[number], { type: "text" }> =>
        b.type === "text",
    )
    .map((b) => b.text)
    .join("\n");

  const content = msg.isError ? `Error: ${textContent}` : textContent;

  return {
    role: "tool",
    content,
    tool_call_id: msg.toolCallId,
    name: msg.toolName,
  };
}
