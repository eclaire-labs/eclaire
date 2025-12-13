import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { generateMessageId } from "@eclaire/core";

const { messages } = schema;
import { createChildLogger } from "@/lib/logger";
import type { ToolCallSummary } from "@/schemas/prompt-responses";

const logger = createChildLogger("messages-service");

export interface CreateMessageParams {
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummary[];
  metadata?: any;
}

export interface MessageEntry {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  thinkingContent?: string | null;
  toolCalls?: ToolCallSummary[];
  createdAt: Date;
  metadata?: any;
}

/**
 * Create a new message in a conversation
 */
export async function createMessage(
  params: CreateMessageParams,
): Promise<MessageEntry> {
  logger.debug(
    { conversationId: params.conversationId, role: params.role },
    "Creating new message",
  );

  // Prepare metadata with tool calls if provided
  const metadata = {
    ...params.metadata,
    ...(params.toolCalls &&
      params.toolCalls.length > 0 && {
        toolCalls: params.toolCalls,
      }),
  };

  const [message] = await db
    .insert(messages)
    .values({
      id: generateMessageId(),
      conversationId: params.conversationId,
      role: params.role,
      content: params.content,
      thinkingContent: params.thinkingContent,
      metadata,
    })
    .returning();

  if (!message) {
    throw new Error("Failed to create message");
  }

  logger.debug(
    { messageId: message.id, conversationId: params.conversationId },
    "Created new message",
  );

  // Parse and return tool calls from metadata
  const toolCalls =
    message.metadata &&
    typeof message.metadata === "object" &&
    "toolCalls" in message.metadata
      ? (message.metadata.toolCalls as ToolCallSummary[] | undefined)
      : undefined;

  return {
    ...message,
    toolCalls,
  };
}

/**
 * Get messages for a conversation
 */
export async function getMessages(
  conversationId: string,
  limit: number = 100,
  offset: number = 0,
  order: "asc" | "desc" = "asc",
): Promise<MessageEntry[]> {
  logger.debug(
    { conversationId, limit, offset, order },
    "Getting messages for conversation",
  );

  const orderBy =
    order === "asc" ? asc(messages.createdAt) : desc(messages.createdAt);

  const conversationMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset);

  logger.debug(
    { conversationId, count: conversationMessages.length },
    "Retrieved messages for conversation",
  );

  // Parse tool calls from metadata for each message
  return conversationMessages.map((message) => ({
    ...message,
    toolCalls:
      message.metadata &&
      typeof message.metadata === "object" &&
      "toolCalls" in message.metadata
        ? (message.metadata.toolCalls as ToolCallSummary[] | undefined)
        : undefined,
  }));
}

/**
 * Get a specific message by ID
 */
export async function getMessage(
  messageId: string,
  conversationId: string,
): Promise<MessageEntry | null> {
  logger.debug({ messageId, conversationId }, "Getting message");

  const [message] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversationId),
      ),
    );

  if (!message) {
    logger.warn({ messageId, conversationId }, "Message not found");
    return null;
  }

  return {
    ...message,
    toolCalls:
      message.metadata &&
      typeof message.metadata === "object" &&
      "toolCalls" in message.metadata
        ? (message.metadata.toolCalls as ToolCallSummary[] | undefined)
        : undefined,
  };
}

/**
 * Get the latest message in a conversation
 */
export async function getLatestMessage(
  conversationId: string,
): Promise<MessageEntry | null> {
  logger.debug({ conversationId }, "Getting latest message");

  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);

  if (!message) {
    logger.debug({ conversationId }, "No messages found in conversation");
    return null;
  }

  return {
    ...message,
    toolCalls:
      message.metadata &&
      typeof message.metadata === "object" &&
      "toolCalls" in message.metadata
        ? (message.metadata.toolCalls as ToolCallSummary[] | undefined)
        : undefined,
  };
}

/**
 * Delete messages in a conversation (used when conversation is deleted)
 */
export async function deleteMessages(conversationId: string): Promise<number> {
  logger.info({ conversationId }, "Deleting messages for conversation");

  const result = await db
    .delete(messages)
    .where(eq(messages.conversationId, conversationId))
    .returning();

  logger.info(
    { conversationId, deletedCount: result.length },
    "Deleted messages for conversation",
  );

  return result.length;
}

/**
 * Count messages in a conversation
 */
export async function countMessages(conversationId: string): Promise<number> {
  logger.debug({ conversationId }, "Counting messages");

  const [result] = await db
    .select({ count: count(messages.id) })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  const messageCount = result?.count || 0;
  logger.debug({ conversationId, count: messageCount }, "Counted messages");

  return messageCount;
}

/**
 * Build AI message array from conversation history
 * Used by the prompt service to construct conversation context
 */
export async function buildAIMessageArray(
  conversationId: string,
  includeSystemPrompt: boolean = false,
  systemPrompt?: string,
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> {
  logger.debug(
    { conversationId, includeSystemPrompt },
    "Building AI message array",
  );

  const conversationMessages = await getMessages(conversationId);

  const aiMessages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];

  // Add system prompt if requested
  if (includeSystemPrompt && systemPrompt) {
    aiMessages.push({ role: "system", content: systemPrompt });
  }

  // Add conversation messages
  for (const message of conversationMessages) {
    aiMessages.push({
      role: message.role,
      content: message.content,
    });
  }

  logger.debug(
    { conversationId, messageCount: aiMessages.length },
    "Built AI message array",
  );

  return aiMessages;
}
