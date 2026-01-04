/**
 * Conversation Adapter
 *
 * Handles loading and saving conversation messages for the agent.
 */

import type { AIMessage } from "@eclaire/ai";
import type { AgentResult } from "@eclaire/ai";
import type { ToolCallSummaryOutput } from "@eclaire/ai";
import {
  type ConversationWithMessages,
  createConversation,
  generateConversationTitle,
  getConversationWithMessages,
  updateConversationActivity,
} from "../services/conversations.js";
import { buildAIMessageArray, createMessage } from "../services/messages.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("conversation-adapter");

export class ConversationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConversationNotFoundError";
  }
}

/**
 * Load conversation with messages
 */
export async function loadConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationWithMessages> {
  const conversation = await getConversationWithMessages(conversationId, userId);

  if (!conversation) {
    throw new ConversationNotFoundError("Conversation not found");
  }

  return conversation;
}

/**
 * Load conversation messages in AI message format
 */
export async function loadConversationMessages(
  conversationId: string,
  userId: string,
  systemPrompt?: string,
): Promise<AIMessage[]> {
  const conversation = await getConversationWithMessages(conversationId, userId);

  if (!conversation) {
    throw new ConversationNotFoundError("Conversation not found");
  }

  return buildAIMessageArray(
    conversation.id,
    !!systemPrompt,
    systemPrompt,
  );
}

export interface SaveConversationOptions {
  conversationId?: string;
  userId: string;
  prompt: string;
  result: AgentResult;
  requestId?: string;
}

/**
 * Save conversation messages after agent execution.
 * Creates a new conversation if needed.
 */
export async function saveConversationMessages(
  options: SaveConversationOptions,
): Promise<string | undefined> {
  const { conversationId, userId, prompt, result, requestId } = options;

  // If no conversation context and we have a result, create new conversation
  if (!conversationId) {
    // Don't create conversations for simple responses without tool calls
    if (result.toolCallSummaries.length === 0) {
      return undefined;
    }

    const title = generateConversationTitle(prompt);
    const newConversation = await createConversation({
      userId,
      title,
    });

    // Add user message
    await createMessage({
      conversationId: newConversation.id,
      role: "user",
      content: prompt,
      metadata: { requestId },
    });

    // Add assistant response
    await createMessage({
      conversationId: newConversation.id,
      role: "assistant",
      content: result.text,
      thinkingContent: result.thinking,
      toolCalls: result.toolCallSummaries.length > 0 ? result.toolCallSummaries : undefined,
      metadata: { requestId },
    });

    await updateConversationActivity(newConversation.id, userId);

    logger.info(
      { conversationId: newConversation.id, userId },
      "Created new conversation",
    );

    return newConversation.id;
  }

  // Add to existing conversation
  await createMessage({
    conversationId,
    role: "user",
    content: prompt,
    metadata: { requestId },
  });

  await createMessage({
    conversationId,
    role: "assistant",
    content: result.text,
    thinkingContent: result.thinking,
    toolCalls: result.toolCallSummaries.length > 0 ? result.toolCallSummaries : undefined,
    metadata: { requestId },
  });

  await updateConversationActivity(conversationId, userId);

  logger.info(
    { conversationId, userId },
    "Saved messages to existing conversation",
  );

  return conversationId;
}
