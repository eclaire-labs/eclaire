import { generateConversationId } from "@eclaire/core";
import { and, count, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db/index.js";

const { conversations, messages } = schema;

import type { ToolCallSummary } from "../../schemas/prompt-responses.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("conversations-service");

export interface CreateConversationParams {
  userId: string;
  title: string;
}

export interface UpdateConversationParams {
  title?: string;
}

export interface ConversationWithMessages {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  messageCount: number;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    thinkingContent?: string | null;
    toolCalls?: ToolCallSummary[];
    createdAt: Date;
    metadata?: any;
  }>;
}

export interface ConversationSummary {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  messageCount: number;
}

/**
 * Create a new conversation for a user
 */
export async function createConversation(
  params: CreateConversationParams,
): Promise<ConversationSummary> {
  logger.info({ userId: params.userId }, "Creating new conversation");

  const [conversation] = await db
    .insert(conversations)
    .values({
      id: generateConversationId(),
      userId: params.userId,
      title: params.title,
    })
    .returning();

  if (!conversation) {
    throw new Error("Failed to create conversation");
  }

  logger.info(
    { conversationId: conversation.id, userId: params.userId },
    "Created new conversation",
  );

  return conversation;
}

/**
 * Get a conversation by ID with user authorization
 */
export async function getConversation(
  conversationId: string,
  userId: string,
): Promise<ConversationSummary | null> {
  logger.debug({ conversationId, userId }, "Getting conversation");

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    );

  if (!conversation) {
    logger.warn({ conversationId, userId }, "Conversation not found");
    return null;
  }

  return conversation;
}

/**
 * Get a conversation with all its messages
 */
export async function getConversationWithMessages(
  conversationId: string,
  userId: string,
): Promise<ConversationWithMessages | null> {
  logger.debug(
    { conversationId, userId },
    "Getting conversation with messages",
  );

  const conversation = await getConversation(conversationId, userId);
  if (!conversation) {
    return null;
  }

  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  logger.debug(
    { conversationId, userId, messageCount: conversationMessages.length },
    "Retrieved conversation with messages",
  );

  return {
    ...conversation,
    messages: conversationMessages.map((message) => ({
      ...message,
      toolCalls:
        message.metadata &&
        typeof message.metadata === "object" &&
        "toolCalls" in message.metadata
          ? (message.metadata.toolCalls as ToolCallSummary[] | undefined)
          : undefined,
    })),
  };
}

/**
 * List conversations for a user
 */
export async function listConversations(
  userId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<ConversationSummary[]> {
  logger.debug({ userId, limit, offset }, "Listing conversations");

  const userConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  logger.debug(
    { userId, count: userConversations.length },
    "Retrieved conversations list",
  );

  return userConversations;
}

/**
 * Update a conversation
 */
export async function updateConversation(
  conversationId: string,
  userId: string,
  updates: UpdateConversationParams,
): Promise<ConversationSummary | null> {
  logger.info({ conversationId, userId, updates }, "Updating conversation");

  const [updatedConversation] = await db
    .update(conversations)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .returning();

  if (!updatedConversation) {
    logger.warn(
      { conversationId, userId },
      "Conversation not found for update",
    );
    return null;
  }

  logger.info({ conversationId, userId }, "Updated conversation");
  return updatedConversation;
}

/**
 * Delete a conversation (hard delete)
 */
export async function deleteConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  logger.info({ conversationId, userId }, "Deleting conversation");

  const [deletedConversation] = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .returning();

  if (!deletedConversation) {
    logger.warn(
      { conversationId, userId },
      "Conversation not found for deletion",
    );
    return false;
  }

  logger.info({ conversationId, userId }, "Deleted conversation");
  return true;
}

/**
 * Update conversation's last message timestamp and message count
 */
export async function updateConversationActivity(
  conversationId: string,
  userId: string,
): Promise<void> {
  logger.debug({ conversationId, userId }, "Updating conversation activity");

  // Get current message count
  const [messageCount] = await db
    .select({ count: count(messages.id) })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  await db
    .update(conversations)
    .set({
      lastMessageAt: new Date(),
      messageCount: messageCount?.count || 0,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    );

  logger.debug({ conversationId, userId }, "Updated conversation activity");
}

/**
 * Generate a conversation title from the first user message
 */
export function generateConversationTitle(firstMessage: string): string {
  // Remove extra whitespace and limit to reasonable length
  const cleanMessage = firstMessage.trim().replace(/\s+/g, " ");

  // If message is short, use it as-is
  if (cleanMessage.length <= 50) {
    return cleanMessage;
  }

  // Find a good breaking point (sentence end, question mark, etc.)
  const breakPoints = [". ", "? ", "! "];
  for (const breakPoint of breakPoints) {
    const index = cleanMessage.indexOf(breakPoint);
    if (index > 20 && index < 50) {
      return cleanMessage.substring(0, index + 1);
    }
  }

  // If no good break point, truncate at word boundary
  const truncated = cleanMessage.substring(0, 47);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 20) {
    return `${truncated.substring(0, lastSpace)}...`;
  }

  return `${truncated}...`;
}
