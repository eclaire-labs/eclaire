// lib/services/all.ts
import { createChildLogger } from "../logger.js";
import { countBookmarks, findBookmarks } from "./bookmarks.js";
import { countDocuments, findDocuments } from "./documents.js";
import { countNotes, findNotes } from "./notes.js";
import { countPhotos, findPhotos } from "./photos.js";
import { countTasks, findTasks } from "./tasks.js";

const logger = createChildLogger("services:all");

/**
 * Helper function to get due date filter range based on status
 */
function getDueDateRange(
  dueStatus?: string,
): { startDue?: Date; endDue?: Date } | null {
  if (!dueStatus || dueStatus === "all") return null;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()); // Start of today (00:00:00)
  const todayEnd = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
  ); // End of today (23:59:59)

  switch (dueStatus) {
    case "overdue":
      // Items with due date before today
      return { endDue: new Date(todayStart.getTime() - 1) }; // Before start of today

    case "due_today":
      // Items with due date during today
      return { startDue: todayStart, endDue: todayEnd };

    case "due_now":
      // Items that are overdue OR due today (anything <= end of today)
      return { endDue: todayEnd };

    default:
      return null;
  }
}

/**
 * Search for items across all types based on criteria.
 * This function fetches results from each collection service and then
 * combines, sorts, and limits them in the application layer.
 *
 * @param userId - The ID of the user
 * @param text - Optional text to search for in item content
 * @param tagsList - Optional array of tags to filter by
 * @param startDate - Optional start date
 * @param endDate - Optional end date
 * @param types - Optional array of item types to include (not yet implemented, searches all)
 * @param limit - Optional maximum number of results
 * @param dueStatus - Optional due date status filter
 * @returns A sorted array of items matching the criteria
 */
export async function findAllEntries(
  userId: string,
  text?: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  types?: string[], // Parameter is kept for future filtering logic
  limit = 50,
  dueStatus?: string,
) {
  try {
    // Get due date range filter if specified
    const dueDateFilter = getDueDateRange(dueStatus);
    const dueDateStart = dueDateFilter?.startDue;
    const dueDateEnd = dueDateFilter?.endDue;

    // We fetch from all services concurrently
    const promises = [
      findBookmarks(
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        limit,
        dueDateStart,
        dueDateEnd,
      ).then((items) => items.map((item) => ({ ...item, type: "bookmark" }))),
      findDocuments(
        userId,
        text,
        tagsList,
        undefined,
        startDate,
        endDate,
        limit,
        undefined, // sortBy - use default
        undefined, // sortDir - use default
        dueDateStart,
        dueDateEnd,
      ).then((items) => items.map((item) => ({ ...item, type: "document" }))),
      findNotes(
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        limit,
        dueDateStart,
        dueDateEnd,
      ).then((items) => items.map((item) => ({ ...item, type: "note" }))),
      findPhotos(
        userId,
        tagsList,
        startDate,
        endDate,
        undefined,
        "createdAt",
        limit,
        dueDateStart,
        dueDateEnd,
      ).then((items) => items.map((item) => ({ ...item, type: "photo" }))),
      findTasks(
        userId,
        text,
        tagsList,
        undefined,
        startDate,
        endDate,
        limit,
        dueDateStart,
        dueDateEnd,
      ).then((items) => items.map((item) => ({ ...item, type: "task" }))),
    ];

    const results = await Promise.all(promises);
    const allItems = results.flat();

    // Sort all combined items by their creation date (newest first)
    // Note: Each service should return a consistent date field, e.g., `createdAt` or `dateCreated`
    allItems.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.dateCreated || 0).getTime();
      const dateB = new Date(b.createdAt || b.dateCreated || 0).getTime();
      return dateB - dateA;
    });

    // Apply the final limit to the combined and sorted array
    return allItems.slice(0, limit);
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        types,
        limit,
        dueStatus,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error finding all entries",
    );
    throw new Error("Failed to search across all items");
  }
}

/**
 * Efficiently counts items matching search criteria across all collections
 * by summing up the counts from each individual service.
 *
 * @param userId - The ID of the user
 * @param text - Optional text to search for
 * @param tagsList - Optional array of tags to filter by
 * @param startDate - Optional start date
 * @param endDate - Optional end date
 * @param types - Optional array of item types to include (not yet implemented)
 * @param dueStatus - Optional due date status filter
 * @returns The total count of items matching the criteria
 */
export async function countAllEntries(
  userId: string,
  text?: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  types?: string[], // Parameter is kept for future filtering logic
  dueStatus?: string,
): Promise<number> {
  try {
    // Get due date range filter if specified
    const dueDateFilter = getDueDateRange(dueStatus);
    const dueDateStart = dueDateFilter?.startDue;
    const dueDateEnd = dueDateFilter?.endDue;

    const countPromises = [
      countBookmarks(
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
      ),
      countDocuments(
        userId,
        text,
        tagsList,
        undefined,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
      ),
      countNotes(
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
      ),
      countPhotos(
        userId,
        tagsList,
        startDate,
        endDate,
        undefined,
        "createdAt",
        dueDateStart,
        dueDateEnd,
      ),
      countTasks(
        userId,
        text,
        tagsList,
        undefined,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
      ),
    ];

    const counts = await Promise.all(countPromises);

    // Sum the counts from all services
    const totalCount = counts.reduce((sum, current) => sum + current, 0);

    return totalCount;
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        types,
        dueStatus,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error counting all entries",
    );
    throw new Error("Failed to count items across all collections");
  }
}
