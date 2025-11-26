import { desc, eq, sql } from "drizzle-orm";
import { db, txManager, schema } from "@/db";
import { generateFeedbackId } from "@/lib/id-generator";

const { feedback } = schema;
import { createChildLogger } from "../logger";
import { recordHistory } from "./history";

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
    logger.info("Creating feedback entry", { userId, data });

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

    logger.info("Feedback entry created successfully", {
      id: newFeedback.id,
      userId,
    });

    return newFeedback;
  } catch (error) {
    logger.error("Failed to create feedback entry", { error, userId, data });
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
    logger.info("Getting user feedback", { userId, limit, offset });

    const feedbackEntries = await db
      .select()
      .from(feedback)
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset);

    logger.info("Retrieved user feedback", {
      userId,
      count: feedbackEntries.length,
    });

    return feedbackEntries;
  } catch (error) {
    logger.error("Failed to get user feedback", { error, userId });
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
    logger.info("Getting all feedback", { limit, offset });

    const feedbackEntries = await db
      .select()
      .from(feedback)
      .orderBy(desc(feedback.createdAt))
      .limit(limit)
      .offset(offset);

    logger.info("Retrieved all feedback", { count: feedbackEntries.length });

    return feedbackEntries;
  } catch (error) {
    logger.error("Failed to get all feedback", { error });
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
    logger.info("Getting feedback by ID", { id });

    const [feedbackEntry] = await db
      .select()
      .from(feedback)
      .where(eq(feedback.id, id))
      .limit(1);

    if (!feedbackEntry) {
      logger.info("Feedback not found", { id });
      return null;
    }

    logger.info("Retrieved feedback by ID", { id });
    return feedbackEntry;
  } catch (error) {
    logger.error("Failed to get feedback by ID", { error, id });
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
    logger.error("Failed to count user feedback", { error, userId });
    throw error;
  }
}
