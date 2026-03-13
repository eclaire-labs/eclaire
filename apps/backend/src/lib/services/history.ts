// lib/services/history.ts
import type {
  HistoryAction,
  HistoryActor,
  HistoryItemType,
} from "@eclaire/core/types";
import { db, schema } from "../../db/index.js";
import { humanCaller } from "./types.js";
import { createChildLogger } from "../logger.js";

const { history } = schema;

const logger = createChildLogger("services:history");

export type { HistoryAction, HistoryActor, HistoryItemType };

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
  actorId?: string; // The specific user/agent who performed the action
  authorizedByActorId?: string | null;
  grantId?: string | null;
  userId?: string; // The resource owner (whose data was affected)
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
  actorId,
  authorizedByActorId,
  grantId,
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
      actorId: actorId || null,
      authorizedByActorId: authorizedByActorId || null,
      grantId: grantId || null,
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
        actorId,
        authorizedByActorId,
        grantId,
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
  const caller = humanCaller(userId);
  return recordHistory({
    action: success ? "user.login" : "user.login",
    itemType: "user_session",
    itemId: sessionId,
    itemName: success ? "Successful login" : "Failed login attempt",
    actor: caller.actor,
    actorId: caller.actorId,
    userId: caller.ownerUserId,
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
  const caller = humanCaller(userId);
  return recordHistory({
    action: "user.logout",
    itemType: "user_session",
    itemId: sessionId,
    itemName: "User logout",
    actor: caller.actor,
    actorId: caller.actorId,
    userId: caller.ownerUserId,
    metadata,
  });
}
