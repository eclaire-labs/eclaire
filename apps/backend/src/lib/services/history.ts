// lib/services/history.ts
import { db, schema } from "../../db/index.js";
import { createChildLogger } from "../logger.js";

const { history } = schema;

const logger = createChildLogger("services:history");

export type HistoryAction =
  | "create"
  | "update"
  | "delete"
  | "api_call" // Existing generic API call
  | "ai_prompt_image_response" // New: AI specifically returned an image
  | "ai_prompt_text_response" // New: AI specifically returned text
  | "ai_prompt_error" // New: Error during AI processing of a prompt
  | "api_content_upload" // New: Content uploaded without a prompt
  | "api_error_general" // New: General error in the API route
  | "user.login" // New: User successful login
  | "user.logout" // New: User explicit logout
  | "conversation_created" // New: Conversation created
  | "conversation_updated" // New: Conversation updated
  | "conversation_deleted" // New: Conversation deleted
  // Streaming-specific actions
  | "ai_prompt_streaming_response" // New: AI streaming response
  | "ai_prompt_streaming_error" // New: Error during AI streaming
  | "api_streaming_content_upload" // New: Content uploaded to streaming endpoint
  | "api_error_streaming_general" // New: General streaming API error
  // Channel and notification actions
  | "telegram_message_processed" // New: Telegram message processed
  | "send_notification"; // New: Notification sent to channels

export type HistoryItemType =
  | "task"
  | "note"
  | "bookmark"
  | "document"
  | "photo"
  | "api" // Existing generic API item
  | "prompt" // New: For text responses from AI prompts
  | "api_error" // New: For logging API errors
  | "content_submission" // New: For content uploaded without a prompt
  | "user_session" // New: For authentication and session events
  | "conversation" // New: For conversation operations
  | "task_comment" // New: For task comment operations
  | "channel" // New: For channel operations
  | "notification" // New: For notification operations
  | "telegram_chat"; // New: For Telegram chat operations

export type HistoryActor = "user" | "assistant" | "system";

export interface RecordHistoryParams {
  action: HistoryAction;
  itemType: HistoryItemType;
  itemId: string;
  itemName?: string; // Made optional to match schema
  // biome-ignore lint/suspicious/noExplicitAny: JSON blob for audit trail
  beforeData?: Record<string, any> | null; // More specific type for JSON objects
  // biome-ignore lint/suspicious/noExplicitAny: JSON blob for audit trail
  afterData?: Record<string, any> | null; // More specific type for JSON objects
  actor: HistoryActor;
  userId?: string; // To associate history with a user
  // biome-ignore lint/suspicious/noExplicitAny: JSON blob for audit trail
  metadata?: Record<string, any> | null; // Additional metadata for events
  // biome-ignore lint/suspicious/noExplicitAny: optional transaction parameter
  tx?: any; // Optional transaction parameter
}

export async function recordHistory({
  action,
  itemType,
  itemId,
  itemName,
  beforeData,
  afterData,
  actor,
  userId,
  metadata,
  tx,
}: RecordHistoryParams) {
  try {
    // Use the provided transaction or fall back to the global db instance
    const dbOrTx = tx || db;

    await dbOrTx.insert(history).values({
      // id is handled by .$defaultFn in schema
      action,
      itemType,
      itemId,
      itemName: itemName || null,
      beforeData: beforeData || null, // No JSON.stringify needed - Drizzle handles it
      afterData: afterData || null, // No JSON.stringify needed - Drizzle handles it
      actor,
      userId: userId || null,
      metadata: metadata || null, // No JSON.stringify needed - Drizzle handles it
      // timestamp is handled by .$defaultFn in schema
    });
  } catch (error) {
    logger.error(
      {
        action,
        itemType,
        itemId,
        itemName,
        actor,
        userId,
        metadata,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to record history",
    );
  }
}

export interface GetHistoryParams {
  userId: string;
  action?: HistoryAction;
  itemType?: HistoryItemType;
  actor?: HistoryActor;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export async function getHistory(userId?: string) {
  // Basic function maintained for compatibility
  try {
    const historyItems = await db.query.history.findMany({
      where: userId
        ? (history, { eq }) => eq(history.userId, userId)
        : undefined,
      orderBy: (history, { desc }) => [desc(history.timestamp)],
      limit: 100, // Add a limit for performance
    });

    // No need to parse JSON - Drizzle handles it with mode: "json"
    return historyItems;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to get history",
    );
    return [];
  }
}

export async function findHistory(params: GetHistoryParams) {
  // Enhanced function with filtering and pagination
  try {
    const {
      userId,
      action,
      itemType,
      actor,
      startDate,
      endDate,
      limit = 50,
      offset = 0,
    } = params;

    const historyItems = await db.query.history.findMany({
      where: (history, { eq, and, gte, lte }) => {
        const conditions = [eq(history.userId, userId)];

        if (action) {
          conditions.push(eq(history.action, action));
        }
        if (itemType) {
          conditions.push(eq(history.itemType, itemType));
        }
        if (actor) {
          conditions.push(eq(history.actor, actor));
        }
        if (startDate) {
          conditions.push(gte(history.timestamp, startDate));
        }
        if (endDate) {
          conditions.push(lte(history.timestamp, endDate));
        }

        return and(...conditions);
      },
      orderBy: (history, { desc }) => [desc(history.timestamp)],
      limit: limit,
      offset: offset,
    });

    // No need to parse JSON - Drizzle handles it with mode: "json"
    return historyItems;
  } catch (error) {
    logger.error(
      {
        params,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to find history",
    );
    return [];
  }
}

export async function countHistory(
  params: Omit<GetHistoryParams, "limit" | "offset">,
) {
  // Count function for pagination
  try {
    const { userId, action, itemType, actor, startDate, endDate } = params;

    const result = await db.query.history.findMany({
      where: (history, { eq, and, gte, lte }) => {
        const conditions = [eq(history.userId, userId)];

        if (action) {
          conditions.push(eq(history.action, action));
        }
        if (itemType) {
          conditions.push(eq(history.itemType, itemType));
        }
        if (actor) {
          conditions.push(eq(history.actor, actor));
        }
        if (startDate) {
          conditions.push(gte(history.timestamp, startDate));
        }
        if (endDate) {
          conditions.push(lte(history.timestamp, endDate));
        }

        return and(...conditions);
      },
    });

    return result.length;
  } catch (error) {
    logger.error(
      {
        params,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Failed to count history",
    );
    return 0;
  }
}

// Authentication-specific history recording functions

export interface AuthenticationMetadata {
  ipAddress?: string;
  userAgent?: string;
  authMethod?: string;
  sessionDuration?: number;
  failureReason?: string;
}

export async function recordLoginHistory({
  userId,
  sessionId,
  metadata,
  success = true,
}: {
  userId: string;
  sessionId: string;
  metadata: AuthenticationMetadata;
  success?: boolean;
}) {
  return recordHistory({
    action: success ? "user.login" : "user.login",
    itemType: "user_session",
    itemId: sessionId,
    itemName: success ? "Successful login" : "Failed login attempt",
    actor: "user",
    userId: userId,
    metadata: {
      ...metadata,
      success,
    },
  });
}

export async function recordLogoutHistory({
  userId,
  sessionId,
  metadata,
}: {
  userId: string;
  sessionId: string;
  metadata: AuthenticationMetadata;
}) {
  return recordHistory({
    action: "user.logout",
    itemType: "user_session",
    itemId: sessionId,
    itemName: "User logout",
    actor: "user",
    userId: userId,
    metadata,
  });
}
