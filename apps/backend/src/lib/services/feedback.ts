import { generateFeedbackId } from "@eclaire/core";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema, txManager } from "../../db/index.js";

const { feedback } = schema;

import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";

const logger = createChildLogger("services:feedback");

interface CreateFeedbackData {
  description: string;
  sentiment?: "positive" | "negative" | null;
}

interface FeedbackEntry {
  id: string;
  userId: string;
  description: string;
  sentiment: "positive" | "negative" | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Create a new feedback entry
 */
export async function createFeedback(
  data: CreateFeedbackData,
  userId: string,
): Promise<FeedbackEntry> {
  try {
    logger.info({ userId, data }, "Creating feedback entry");

    // Pre-generate ID before transaction
    const feedbackId = generateFeedbackId();

    // Execute transaction
    await txManager.withTransaction(async (tx) => {
      // Create feedback entry
      await tx.feedback.insert({
        id: feedbackId,
        userId: userId,
        description: data.description,
        sentiment: data.sentiment || null,
      });
    });

    // Record history AFTER transaction (not critical for atomicity)
    await recordHistory({
      action: "create",
      // biome-ignore lint/suspicious/noExplicitAny: feedback not yet in ItemType union
      itemType: "feedback" as any, // Cast since feedback is not in the union yet
      itemId: feedbackId,
      itemName: "Feedback submission",
      beforeData: null,
      afterData: {
        description: data.description,
        sentiment: data.sentiment,
      },
      actor: "user",
      userId: userId,
      metadata: { userId },
    });

    // Fetch the created feedback to return
    const newFeedback = await db.query.feedback.findFirst({
      where: eq(feedback.id, feedbackId),
    });

    if (!newFeedback) {
      throw new Error("Failed to retrieve created feedback entry");
    }

    logger.info(
      { id: newFeedback.id, userId },
      "Feedback entry created successfully",
    );

    return newFeedback;
  } catch (error) {
    logger.error(
      { err: error, userId, data },
      "Failed to create feedback entry",
    );
    throw error;
  }
}

/**
 * Get all feedback entries for a specific user
 */
export async function getUserFeedback(
  userId: string,
  limit = 50,
  offset = 0,
): Promise<FeedbackEntry[]> {
  try {
    logger.info({ userId, limit, offset }, "Getting user feedback");

    const feedbackEntries = await db
      .select()
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset);

    logger.info(
      { userId, count: feedbackEntries.length },
      "Retrieved user feedback",
    );

    return feedbackEntries;
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to get user feedback");
    throw error;
  }
}

/**
 * Get all feedback entries (admin function)
 */
export async function getAllFeedback(
  limit = 100,
  offset = 0,
): Promise<FeedbackEntry[]> {
  try {
    logger.info({ limit, offset }, "Getting all feedback");

    const feedbackEntries = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset);

    logger.info({ count: feedbackEntries.length }, "Retrieved all feedback");

    return feedbackEntries;
  } catch (error) {
    logger.error({ err: error }, "Failed to get all feedback");
    throw error;
  }
}

/**
 * Get feedback entry by ID
 */
export async function getFeedbackById(
  id: string,
): Promise<FeedbackEntry | null> {
  try {
    logger.info({ id }, "Getting feedback by ID");

    const [feedbackEntry] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.id, id))
      .limit(1);

    if (!feedbackEntry) {
      logger.info({ id }, "Feedback not found");
      return null;
    }

    logger.info({ id }, "Retrieved feedback by ID");
    return feedbackEntry;
  } catch (error) {
    logger.error({ err: error, id }, "Failed to get feedback by ID");
    throw error;
  }
}

/**
 * Count total feedback entries for a user
 */
export async function countUserFeedback(userId: string): Promise<number> {
  try {
    const result = await db
      .select({ count: sql`count(*)` })
      .from(feedback)
      .where(eq(feedback.userId, userId));

    return Number(result[0]?.count ?? 0);
  } catch (error) {
    logger.error({ err: error, userId }, "Failed to count user feedback");
    throw error;
  }
}
