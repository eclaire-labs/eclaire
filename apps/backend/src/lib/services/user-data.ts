import { verifyPassword } from "better-auth/crypto";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { db, dbType, txManager, schema, queueJobs } from "../../db/index.js";
import { createChildLogger } from "../logger.js";

const {
  accounts,
  bookmarks,
  bookmarksTags,
  documents,
  documentsTags,
  history,
  notes,
  notesTags,
  photos,
  photosTags,
  tasks,
  tasksTags,
  users,
} = schema;
import { getStorage, userPrefix, categoryPrefix } from "../storage/index.js";

// Individual delete services are no longer needed for bulk deletion
// We use bulk transactions instead for better performance and SQLite safety

const logger = createChildLogger("services:user-data");

/**
 * Helper to build cross-database condition for querying queue jobs by userId
 * Handles both SQLite (json_extract) and PostgreSQL (->>) JSON syntax
 */
function queueJobsByUserIdCondition(userId: string) {
  return dbType === "sqlite"
    ? sql`json_extract(${queueJobs.metadata}, '$.userId') = ${userId}`
    : sql`${queueJobs.metadata}->>'userId' = ${userId}`;
}

/**
 * Delete all queue jobs for a user by userId in metadata
 * Handles both SQLite and PostgreSQL JSON syntax
 * @param userId - The ID of the user whose queue jobs should be deleted
 */
export async function deleteQueueJobsByUserId(userId: string): Promise<void> {
  await db.delete(queueJobs).where(queueJobsByUserIdCondition(userId));
}

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
    logger.info({ userId }, "Starting bulk data deletion for user");

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

    // 2. Get all user asset IDs for bulk deletion (needed for storage cleanup)
    const [
      userBookmarks,
      userDocuments,
      userPhotos,
      userNotes,
      userTasks,
    ] = await Promise.all([
      db.select({ id: bookmarks.id }).from(bookmarks).where(eq(bookmarks.userId, userId)),
      db.select({ id: documents.id }).from(documents).where(eq(documents.userId, userId)),
      db.select({ id: photos.id }).from(photos).where(eq(photos.userId, userId)),
      db.select({ id: notes.id }).from(notes).where(eq(notes.userId, userId)),
      db.select({ id: tasks.id }).from(tasks).where(eq(tasks.userId, userId)),
    ]);

    const totalAssets =
      userBookmarks.length +
      userDocuments.length +
      userPhotos.length +
      userNotes.length +
      userTasks.length;

    logger.info(
      {
        userId,
        totalAssets,
        bookmarks: userBookmarks.length,
        documents: userDocuments.length,
        photos: userPhotos.length,
        notes: userNotes.length,
        tasks: userTasks.length,
      },
      "Found assets to delete",
    );

    // 3. Delete all database records using bulk transactions per asset type
    // This approach is much faster and avoids SQLite "database is locked" issues

    // Delete bookmarks (one atomic transaction)
    if (userBookmarks.length > 0) {
      const bookmarkIds = userBookmarks.map((b) => b.id);
      await txManager.withTransaction(async (tx) => {
        await tx.bookmarksTags.delete(inArray(bookmarksTags.bookmarkId, bookmarkIds));
        await tx.bookmarks.delete(eq(bookmarks.userId, userId));
      });
      // Delete queue jobs outside transaction (non-critical)
      const bookmarkKeys = bookmarkIds.map((id) => `bookmarks:${id}`);
      await db.delete(queueJobs).where(inArray(queueJobs.key, bookmarkKeys));
      logger.info({ userId, count: userBookmarks.length }, "Deleted all bookmarks");
    }

    // Delete documents (one atomic transaction)
    if (userDocuments.length > 0) {
      const documentIds = userDocuments.map((d) => d.id);
      await txManager.withTransaction(async (tx) => {
        await tx.documentsTags.delete(inArray(documentsTags.documentId, documentIds));
        await tx.documents.delete(eq(documents.userId, userId));
      });
      // Delete queue jobs outside transaction (non-critical)
      const documentKeys = documentIds.map((id) => `documents:${id}`);
      await db.delete(queueJobs).where(inArray(queueJobs.key, documentKeys));
      logger.info({ userId, count: userDocuments.length }, "Deleted all documents");
    }

    // Delete photos (one atomic transaction)
    if (userPhotos.length > 0) {
      const photoIds = userPhotos.map((p) => p.id);
      await txManager.withTransaction(async (tx) => {
        await tx.photosTags.delete(inArray(photosTags.photoId, photoIds));
        await tx.photos.delete(eq(photos.userId, userId));
      });
      // Delete queue jobs outside transaction (non-critical)
      const photoKeys = photoIds.map((id) => `photos:${id}`);
      await db.delete(queueJobs).where(inArray(queueJobs.key, photoKeys));
      logger.info({ userId, count: userPhotos.length }, "Deleted all photos");
    }

    // Delete notes (one atomic transaction)
    if (userNotes.length > 0) {
      const noteIds = userNotes.map((n) => n.id);
      await txManager.withTransaction(async (tx) => {
        await tx.notesTags.delete(inArray(notesTags.noteId, noteIds));
        await tx.notes.delete(eq(notes.userId, userId));
      });
      // Delete queue jobs outside transaction (non-critical)
      const noteKeys = noteIds.map((id) => `notes:${id}`);
      await db.delete(queueJobs).where(inArray(queueJobs.key, noteKeys));
      logger.info({ userId, count: userNotes.length }, "Deleted all notes");
    }

    // Delete tasks (one atomic transaction)
    if (userTasks.length > 0) {
      const taskIds = userTasks.map((t) => t.id);
      await txManager.withTransaction(async (tx) => {
        await tx.tasksTags.delete(inArray(tasksTags.taskId, taskIds));
        await tx.tasks.delete(eq(tasks.userId, userId));
      });
      // Delete queue jobs outside transaction (non-critical)
      const taskKeys = taskIds.map((id) => `tasks:${id}`);
      await db.delete(queueJobs).where(inArray(queueJobs.key, taskKeys));
      logger.info({ userId, count: userTasks.length }, "Deleted all tasks");
    }

    // 4. Delete system data (history)
    await txManager.withTransaction(async (tx) => {
      await tx.history.delete(eq(history.userId, userId));
    });
    // Clean up any orphaned queue jobs (outside transaction, non-critical)
    await deleteQueueJobsByUserId(userId);
    logger.info({ userId }, "Deleted history and system data");

    // 5. Clean up storage (outside transactions - can be parallel)
    // Delete the entire user folder at once for efficiency
    try {
      const storage = getStorage();
      await storage.deletePrefix(userPrefix(userId));
      logger.info({ userId }, "Cleaned up user storage folder");
    } catch (storageError) {
      logger.warn({ err: storageError, userId }, "Failed to clean user storage folder");
      // Don't fail the entire operation if storage cleanup fails
    }

    logger.info({ userId }, "Successfully completed bulk data deletion for user");
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
      queueJobsCount,
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
        .from(queueJobs)
        .where(queueJobsByUserIdCondition(userId)),
    ]);

    const assetsTotal =
      (bookmarksCount[0]?.count || 0) +
      (documentsCount[0]?.count || 0) +
      (photosCount[0]?.count || 0) +
      (notesCount[0]?.count || 0) +
      (tasksCount[0]?.count || 0);
    const systemTotal =
      (historyCount[0]?.count || 0) + (queueJobsCount[0]?.count || 0);

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
      queueJobs: queueJobsCount[0]?.count || 0,
      systemTotal,

      // Grand total
      total: assetsTotal + systemTotal,
    };
  } catch (error) {
    logger.error({ err: error }, "Error getting user data summary");
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

    // Get storage statistics using the new storage API
    const storage = getStorage();
    const [bookmarksStorage, documentsStorage, photosStorage, notesStorage, tasksStorage] = await Promise.all([
      storage.stats(categoryPrefix(userId, "bookmarks")),
      storage.stats(categoryPrefix(userId, "documents")),
      storage.stats(categoryPrefix(userId, "photos")),
      storage.stats(categoryPrefix(userId, "notes")),
      storage.stats(categoryPrefix(userId, "tasks")),
    ]);

    // Helper function to format bytes
    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return "0 B";
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
    };

    // Combine the data
    const stats = {
      assets: {
        bookmarks: {
          count: bookmarksCount[0]?.count || 0,
          storageSize: bookmarksStorage.size,
          storageSizeFormatted:
            bookmarksStorage.size > 0 ? formatBytes(bookmarksStorage.size) : "0 B",
        },
        documents: {
          count: documentsCount[0]?.count || 0,
          storageSize: documentsStorage.size,
          storageSizeFormatted:
            documentsStorage.size > 0 ? formatBytes(documentsStorage.size) : "0 B",
        },
        photos: {
          count: photosCount[0]?.count || 0,
          storageSize: photosStorage.size,
          storageSizeFormatted:
            photosStorage.size > 0 ? formatBytes(photosStorage.size) : "0 B",
        },
        notes: {
          count: notesCount[0]?.count || 0,
          storageSize: notesStorage.size,
          storageSizeFormatted:
            notesStorage.size > 0 ? formatBytes(notesStorage.size) : "0 B",
        },
        tasks: {
          count: tasksCount[0]?.count || 0,
          storageSize: tasksStorage.size,
          storageSizeFormatted:
            tasksStorage.size > 0 ? formatBytes(tasksStorage.size) : "0 B",
        },
        total: {
          count:
            (bookmarksCount[0]?.count || 0) +
            (documentsCount[0]?.count || 0) +
            (photosCount[0]?.count || 0) +
            (notesCount[0]?.count || 0) +
            (tasksCount[0]?.count || 0),
          storageSize: bookmarksStorage.size + documentsStorage.size + photosStorage.size + notesStorage.size + tasksStorage.size,
          storageSizeFormatted: formatBytes(
            bookmarksStorage.size + documentsStorage.size + photosStorage.size + notesStorage.size + tasksStorage.size
          ),
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
    logger.error({ err: error }, "Error getting activity timeline");
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
    logger.error({ err: error }, "Error getting due items");
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
        .where(and(eq(bookmarks.userId, userId), bookmarks.isPinned)),
      db
        .select({ count: count() })
        .from(documents)
        .where(and(eq(documents.userId, userId), documents.isPinned)),
      db
        .select({ count: count() })
        .from(photos)
        .where(and(eq(photos.userId, userId), photos.isPinned)),
      db
        .select({ count: count() })
        .from(notes)
        .where(and(eq(notes.userId, userId), notes.isPinned)),

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
        .from(queueJobs)
        .where(queueJobsByUserIdCondition(userId)),
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
    logger.error({ err: error }, "Error getting quick stats");
    throw new Error("Failed to get quick stats");
  }
}
