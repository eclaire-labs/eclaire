import { verifyPassword } from "better-auth/crypto";
import { and, count, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  assetProcessingJobs,
  bookmarks,
  documents,
  history,
  notes,
  photos,
  tasks,
  users,
} from "@/db/schema";
import { createChildLogger } from "../logger";
import { LocalObjectStorage, objectStorage } from "../storage";

// Import individual deletion services
import { deleteBookmark } from "./bookmarks";
import { deleteDocument } from "./documents";
import { deleteNoteEntry } from "./notes";
import { deletePhoto } from "./photos";
import { deleteTask } from "./tasks";

const logger = createChildLogger("services:user-data");

/**
 * Bulk delete all user data but keep the account intact
 * This function efficiently removes all user assets and data
 * @param userId - The ID of the user whose data should be deleted
 * @param password - The user's password for confirmation
 */
export async function deleteAllUserData(
  userId: string,
  password: string,
): Promise<void> {
  try {
    logger.info(`Starting bulk data deletion for user: ${userId}`);

    // 1. Verify password first
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Get the password hash from accounts table (Better Auth stores it there)
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, userId),
      columns: { passwordHash: true },
    });

    if (!account?.passwordHash) {
      throw new Error("Invalid password");
    }

    const isValidPassword = await verifyPassword({
      password,
      hash: account.passwordHash,
    });

    if (!isValidPassword) {
      throw new Error("Invalid password");
    }

    // 2. Get all user assets for bulk deletion
    const [
      userBookmarks,
      userDocuments,
      userPhotos,
      userNotes,
      userTasks,
      userHistory,
      userAssetJobs,
    ] = await Promise.all([
      db
        .select({ id: bookmarks.id })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId)),
      db
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.userId, userId)),
      db
        .select({ id: photos.id })
        .from(photos)
        .where(eq(photos.userId, userId)),
      db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId)),
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, userId)),
      db
        .select({ id: history.id })
        .from(history)
        .where(eq(history.userId, userId)),
      db
        .select({ id: assetProcessingJobs.id })
        .from(assetProcessingJobs)
        .where(eq(assetProcessingJobs.userId, userId)),
    ]);

    const totalAssets =
      userBookmarks.length +
      userDocuments.length +
      userPhotos.length +
      userNotes.length +
      userTasks.length;
    const totalSystemData = userHistory.length + userAssetJobs.length;
    logger.info(
      `Found ${totalAssets} assets and ${totalSystemData} system records to delete for user ${userId}`,
      {
        bookmarks: userBookmarks.length,
        documents: userDocuments.length,
        photos: userPhotos.length,
        notes: userNotes.length,
        tasks: userTasks.length,
        history: userHistory.length,
        assetProcessingJobs: userAssetJobs.length,
      },
    );

    // 3. Delete all assets in parallel batches for efficiency
    const BATCH_SIZE = 10; // Process in batches to avoid overwhelming the system

    // Helper function to process deletions in batches
    const deleteBatch = async <T extends { id: string }>(
      items: T[],
      deleteFunction: (
        id: string,
        userId: string,
        deleteStorage?: boolean,
      ) => Promise<any>,
      assetType: string,
    ) => {
      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batch.map(async (item) => {
            try {
              await deleteFunction(item.id, userId, true); // Always delete storage
            } catch (error) {
              logger.warn(`Failed to delete ${assetType} ${item.id}:`, error);
              // Continue with other deletions even if one fails
            }
          }),
        );
        logger.info(
          `Deleted batch of ${batch.length} ${assetType} (${i + batch.length}/${items.length})`,
        );
      }
    };

    // Delete all asset types SEQUENTIALLY to avoid transaction conflicts
    logger.info("Deleting bookmarks...");
    await deleteBatch(userBookmarks, deleteBookmark, "bookmarks");

    logger.info("Deleting documents...");
    await deleteBatch(userDocuments, deleteDocument, "documents");

    logger.info("Deleting photos...");
    await deleteBatch(userPhotos, deletePhoto, "photos");

    logger.info("Deleting notes...");
    await deleteBatch(userNotes, deleteNoteEntry, "notes");

    logger.info("Deleting tasks...");
    await deleteBatch(userTasks, deleteTask, "tasks");

    // 4. Delete system data (history and processing jobs)
    logger.info(`Deleting system data for user ${userId}`);

    // Delete history records
    await db.delete(history).where(eq(history.userId, userId));
    logger.info(`Deleted history records for user ${userId}`);

    // Delete asset processing jobs (unified table for all asset types)
    await db
      .delete(assetProcessingJobs)
      .where(eq(assetProcessingJobs.userId, userId));
    logger.info(`Deleted asset processing jobs for user ${userId}`);

    logger.info(`Completed system data deletion for user ${userId}`);

    // 5. Clean up any remaining storage at the user level
    try {
      await objectStorage.deleteAsset(userId, "", ""); // This should delete the entire user folder
      logger.info(`Cleaned up user storage folder for ${userId}`);
    } catch (storageError) {
      logger.warn(
        `Failed to clean user storage folder for ${userId}:`,
        storageError,
      );
      // Don't fail the entire operation if storage cleanup fails
    }

    // 5. Reset user statistics/counts if you track them
    // This could include resetting API call counts, etc.
    // await resetUserStatistics(userId);

    logger.info(
      `Successfully completed bulk data deletion for user: ${userId}`,
    );
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error during bulk data deletion",
    );
    throw error;
  }
}

/**
 * Get a summary of user data that would be deleted
 * Useful for showing confirmation details to the user
 * @param userId - The ID of the user
 * @returns Object with counts of each asset type
 */
export async function getUserDataSummary(userId: string) {
  try {
    const [
      bookmarksCount,
      documentsCount,
      photosCount,
      notesCount,
      tasksCount,
      historyCount,
      assetJobsCount,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId)),
      db
        .select({ count: count() })
        .from(documents)
        .where(eq(documents.userId, userId)),
      db
        .select({ count: count() })
        .from(photos)
        .where(eq(photos.userId, userId)),
      db.select({ count: count() }).from(notes).where(eq(notes.userId, userId)),
      db.select({ count: count() }).from(tasks).where(eq(tasks.userId, userId)),
      db
        .select({ count: count() })
        .from(history)
        .where(eq(history.userId, userId)),
      db
        .select({ count: count() })
        .from(assetProcessingJobs)
        .where(eq(assetProcessingJobs.userId, userId)),
    ]);

    const assetsTotal =
      (bookmarksCount[0]?.count || 0) +
      (documentsCount[0]?.count || 0) +
      (photosCount[0]?.count || 0) +
      (notesCount[0]?.count || 0) +
      (tasksCount[0]?.count || 0);
    const systemTotal =
      (historyCount[0]?.count || 0) + (assetJobsCount[0]?.count || 0);

    return {
      // User assets
      bookmarks: bookmarksCount[0]?.count || 0,
      documents: documentsCount[0]?.count || 0,
      photos: photosCount[0]?.count || 0,
      notes: notesCount[0]?.count || 0,
      tasks: tasksCount[0]?.count || 0,
      assetsTotal,

      // System data
      history: historyCount[0]?.count || 0,
      assetProcessingJobs: assetJobsCount[0]?.count || 0,
      systemTotal,

      // Grand total
      total: assetsTotal + systemTotal,
    };
  } catch (error) {
    logger.error("Error getting user data summary:", error);
    throw new Error("Failed to get user data summary");
  }
}

/**
 * Get dashboard statistics combining database counts and storage sizes
 * @param userId - The ID of the user
 * @returns Object with comprehensive dashboard stats
 */
export async function getDashboardStatistics(userId: string) {
  try {
    // Get database counts
    const [
      bookmarksCount,
      documentsCount,
      photosCount,
      notesCount,
      tasksCount,
    ] = await Promise.all([
      db
        .select({ count: count() })
        .from(bookmarks)
        .where(eq(bookmarks.userId, userId)),
      db
        .select({ count: count() })
        .from(documents)
        .where(eq(documents.userId, userId)),
      db
        .select({ count: count() })
        .from(photos)
        .where(eq(photos.userId, userId)),
      db.select({ count: count() }).from(notes).where(eq(notes.userId, userId)),
      db.select({ count: count() }).from(tasks).where(eq(tasks.userId, userId)),
    ]);

    // Get storage statistics
    const storageStats = await objectStorage.getUserStorageStats(userId);

    // Combine the data
    const stats = {
      assets: {
        bookmarks: {
          count: bookmarksCount[0]?.count || 0,
          storageSize: storageStats.bookmarks.size,
          storageSizeFormatted:
            storageStats.bookmarks.size > 0
              ? LocalObjectStorage.formatBytes(storageStats.bookmarks.size)
              : "0 B",
        },
        documents: {
          count: documentsCount[0]?.count || 0,
          storageSize: storageStats.documents.size,
          storageSizeFormatted:
            storageStats.documents.size > 0
              ? LocalObjectStorage.formatBytes(storageStats.documents.size)
              : "0 B",
        },
        photos: {
          count: photosCount[0]?.count || 0,
          storageSize: storageStats.photos.size,
          storageSizeFormatted:
            storageStats.photos.size > 0
              ? LocalObjectStorage.formatBytes(storageStats.photos.size)
              : "0 B",
        },
        notes: {
          count: notesCount[0]?.count || 0,
          storageSize: storageStats.notes.size,
          storageSizeFormatted:
            storageStats.notes.size > 0
              ? LocalObjectStorage.formatBytes(storageStats.notes.size)
              : "0 B",
        },
        tasks: {
          count: tasksCount[0]?.count || 0,
          storageSize: storageStats.tasks.size,
          storageSizeFormatted:
            storageStats.tasks.size > 0
              ? LocalObjectStorage.formatBytes(storageStats.tasks.size)
              : "0 B",
        },
        total: {
          count:
            (bookmarksCount[0]?.count || 0) +
            (documentsCount[0]?.count || 0) +
            (photosCount[0]?.count || 0) +
            (notesCount[0]?.count || 0) +
            (tasksCount[0]?.count || 0),
          storageSize: storageStats.total.size,
          storageSizeFormatted:
            storageStats.total.size > 0
              ? LocalObjectStorage.formatBytes(storageStats.total.size)
              : "0 B",
        },
      },
    };

    return stats;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting dashboard statistics",
    );
    throw new Error("Failed to get dashboard statistics");
  }
}

/**
 * Get activity timeline data for the specified number of days
 * @param userId - The ID of the user
 * @param days - Number of days to look back (default: 30)
 * @returns Array of daily activity counts by asset type
 */
export async function getActivityTimeline(userId: string, days: number = 30) {
  try {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - days);

    // Get daily creation counts for each asset type
    const [
      bookmarkActivity,
      documentActivity,
      photoActivity,
      noteActivity,
      taskActivity,
    ] = await Promise.all([
      db
        .select({
          date: sql<string>`DATE(${bookmarks.createdAt})`.as("date"),
          count: count(),
        })
        .from(bookmarks)
        .where(
          and(eq(bookmarks.userId, userId), gte(bookmarks.createdAt, daysAgo)),
        )
        .groupBy(sql`DATE(${bookmarks.createdAt})`)
        .orderBy(sql`DATE(${bookmarks.createdAt})`),

      db
        .select({
          date: sql<string>`DATE(${documents.createdAt})`.as("date"),
          count: count(),
        })
        .from(documents)
        .where(
          and(eq(documents.userId, userId), gte(documents.createdAt, daysAgo)),
        )
        .groupBy(sql`DATE(${documents.createdAt})`)
        .orderBy(sql`DATE(${documents.createdAt})`),

      db
        .select({
          date: sql<string>`DATE(${photos.createdAt})`.as("date"),
          count: count(),
        })
        .from(photos)
        .where(and(eq(photos.userId, userId), gte(photos.createdAt, daysAgo)))
        .groupBy(sql`DATE(${photos.createdAt})`)
        .orderBy(sql`DATE(${photos.createdAt})`),

      db
        .select({
          date: sql<string>`DATE(${notes.createdAt})`.as("date"),
          count: count(),
        })
        .from(notes)
        .where(and(eq(notes.userId, userId), gte(notes.createdAt, daysAgo)))
        .groupBy(sql`DATE(${notes.createdAt})`)
        .orderBy(sql`DATE(${notes.createdAt})`),

      db
        .select({
          date: sql<string>`DATE(${tasks.createdAt})`.as("date"),
          count: count(),
        })
        .from(tasks)
        .where(and(eq(tasks.userId, userId), gte(tasks.createdAt, daysAgo)))
        .groupBy(sql`DATE(${tasks.createdAt})`)
        .orderBy(sql`DATE(${tasks.createdAt})`),
    ]);

    // Create a map of all dates for the specified number of days
    const activityMap = new Map<string, any>();
    for (let i = 0; i < days; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      if (dateStr) {
        activityMap.set(dateStr, {
        date: dateStr,
        bookmarks: 0,
        documents: 0,
        photos: 0,
        notes: 0,
        tasks: 0,
        total: 0,
      });
      }
    }

    // Populate with actual data
    bookmarkActivity.forEach((item) => {
      const entry = activityMap.get(item.date);
      if (entry) entry.bookmarks = item.count;
    });

    documentActivity.forEach((item) => {
      const entry = activityMap.get(item.date);
      if (entry) entry.documents = item.count;
    });

    photoActivity.forEach((item) => {
      const entry = activityMap.get(item.date);
      if (entry) entry.photos = item.count;
    });

    noteActivity.forEach((item) => {
      const entry = activityMap.get(item.date);
      if (entry) entry.notes = item.count;
    });

    taskActivity.forEach((item) => {
      const entry = activityMap.get(item.date);
      if (entry) entry.tasks = item.count;
    });

    // Calculate totals and return sorted by date
    const result = Array.from(activityMap.values())
      .map((entry) => ({
        ...entry,
        total:
          entry.bookmarks +
          entry.documents +
          entry.photos +
          entry.notes +
          entry.tasks,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return result;
  } catch (error) {
    logger.error("Error getting activity timeline:", error);
    throw new Error("Failed to get activity timeline");
  }
}

/**
 * Get items that are due soon or overdue
 * @param userId - The ID of the user
 * @returns Object with overdue, due today, and due this week items
 */
export async function getDueItems(userId: string) {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Get overdue items
    const [overdueBookmarks, overdueTasks] = await Promise.all([
      db
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          dueDate: bookmarks.dueDate,
          type: sql<string>`'bookmark'`.as("type"),
        })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            isNotNull(bookmarks.dueDate),
            lte(bookmarks.dueDate, today),
          ),
        )
        .orderBy(bookmarks.dueDate),

      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          type: sql<string>`'task'`.as("type"),
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            isNotNull(tasks.dueDate),
            lte(tasks.dueDate, today),
          ),
        )
        .orderBy(tasks.dueDate),
    ]);

    // Get due today items
    const [dueTodayBookmarks, dueTodayTasks] = await Promise.all([
      db
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          dueDate: bookmarks.dueDate,
          type: sql<string>`'bookmark'`.as("type"),
        })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            isNotNull(bookmarks.dueDate),
            gte(bookmarks.dueDate, today),
            lte(bookmarks.dueDate, tomorrow),
          ),
        )
        .orderBy(bookmarks.dueDate),

      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          type: sql<string>`'task'`.as("type"),
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, tomorrow),
          ),
        )
        .orderBy(tasks.dueDate),
    ]);

    // Get due this week items
    const [dueWeekBookmarks, dueWeekTasks] = await Promise.all([
      db
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          dueDate: bookmarks.dueDate,
          type: sql<string>`'bookmark'`.as("type"),
        })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            isNotNull(bookmarks.dueDate),
            gte(bookmarks.dueDate, tomorrow),
            lte(bookmarks.dueDate, nextWeek),
          ),
        )
        .orderBy(bookmarks.dueDate),

      db
        .select({
          id: tasks.id,
          title: tasks.title,
          dueDate: tasks.dueDate,
          type: sql<string>`'task'`.as("type"),
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, tomorrow),
            lte(tasks.dueDate, nextWeek),
          ),
        )
        .orderBy(tasks.dueDate),
    ]);

    return {
      overdue: [...overdueBookmarks, ...overdueTasks],
      dueToday: [...dueTodayBookmarks, ...dueTodayTasks],
      dueThisWeek: [...dueWeekBookmarks, ...dueWeekTasks],
    };
  } catch (error) {
    logger.error("Error getting due items:", error);
    throw new Error("Failed to get due items");
  }
}

/**
 * Get quick stats for dashboard widgets
 * @param userId - The ID of the user
 * @returns Object with various quick statistics
 */
export async function getQuickStats(userId: string) {
  try {
    const [
      pinnedBookmarks,
      pinnedDocuments,
      pinnedPhotos,
      pinnedNotes,
      pendingBookmarks,
      pendingDocuments,
      pendingPhotos,
      flaggedBookmarks,
      flaggedDocuments,
      flaggedPhotos,
      processingJobs,
    ] = await Promise.all([
      // Pinned items
      db
        .select({ count: count() })
        .from(bookmarks)
        .where(and(eq(bookmarks.userId, userId), eq(bookmarks.isPinned, true))),
      db
        .select({ count: count() })
        .from(documents)
        .where(and(eq(documents.userId, userId), eq(documents.isPinned, true))),
      db
        .select({ count: count() })
        .from(photos)
        .where(and(eq(photos.userId, userId), eq(photos.isPinned, true))),
      db
        .select({ count: count() })
        .from(notes)
        .where(and(eq(notes.userId, userId), eq(notes.isPinned, true))),

      // Pending review items
      db
        .select({ count: count() })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.userId, userId),
            eq(bookmarks.reviewStatus, "pending"),
          ),
        ),
      db
        .select({ count: count() })
        .from(documents)
        .where(
          and(
            eq(documents.userId, userId),
            eq(documents.reviewStatus, "pending"),
          ),
        ),
      db
        .select({ count: count() })
        .from(photos)
        .where(
          and(eq(photos.userId, userId), eq(photos.reviewStatus, "pending")),
        ),

      // Flagged items
      db
        .select({ count: count() })
        .from(bookmarks)
        .where(
          and(eq(bookmarks.userId, userId), isNotNull(bookmarks.flagColor)),
        ),
      db
        .select({ count: count() })
        .from(documents)
        .where(
          and(eq(documents.userId, userId), isNotNull(documents.flagColor)),
        ),
      db
        .select({ count: count() })
        .from(photos)
        .where(and(eq(photos.userId, userId), isNotNull(photos.flagColor))),

      // Processing jobs
      db
        .select({ count: count() })
        .from(assetProcessingJobs)
        .where(eq(assetProcessingJobs.userId, userId)),
    ]);

    return {
      pinned: {
        total:
          (pinnedBookmarks[0]?.count || 0) +
          (pinnedDocuments[0]?.count || 0) +
          (pinnedPhotos[0]?.count || 0) +
          (pinnedNotes[0]?.count || 0),
        bookmarks: pinnedBookmarks[0]?.count || 0,
        documents: pinnedDocuments[0]?.count || 0,
        photos: pinnedPhotos[0]?.count || 0,
        notes: pinnedNotes[0]?.count || 0,
      },
      pendingReview: {
        total:
          (pendingBookmarks[0]?.count || 0) +
          (pendingDocuments[0]?.count || 0) +
          (pendingPhotos[0]?.count || 0),
        bookmarks: pendingBookmarks[0]?.count || 0,
        documents: pendingDocuments[0]?.count || 0,
        photos: pendingPhotos[0]?.count || 0,
      },
      flagged: {
        total:
          (flaggedBookmarks[0]?.count || 0) +
          (flaggedDocuments[0]?.count || 0) +
          (flaggedPhotos[0]?.count || 0),
        bookmarks: flaggedBookmarks[0]?.count || 0,
        documents: flaggedDocuments[0]?.count || 0,
        photos: flaggedPhotos[0]?.count || 0,
      },
      processing: processingJobs[0]?.count || 0,
    };
  } catch (error) {
    logger.error("Error getting quick stats:", error);
    throw new Error("Failed to get quick stats");
  }
}
