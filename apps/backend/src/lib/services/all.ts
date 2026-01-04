// lib/services/all.ts
import { fileTypeFromBuffer } from "file-type";
import isUrl from "is-url";
import { createChildLogger } from "../logger.js";
import { ASSET_TYPE } from "../../types/assets.js";
import {
  BOOKMARK_MIMES,
  DOCUMENT_MIMES,
  NOTE_MIMES,
  PHOTO_MIMES,
} from "../../types/mime-types.js";
import { countBookmarks, createBookmarkAndQueueJob, findBookmarks } from "./bookmarks.js";
import { countDocuments, createDocument, findDocuments } from "./documents.js";
import { countNotes, createNoteEntry, findNotes } from "./notes.js";
import { countPhotos, createPhoto, extractAndGeocode, findPhotos } from "./photos.js";
import { countTasks, createTask, findTasks } from "./tasks.js";

const logger = createChildLogger("services:all");

// --- MIME DETECTION AND URL VALIDATION HELPERS ---

/**
 * Detects and verifies MIME type from buffer, with special handling for SVG and Apple iWork files.
 */
export async function detectAndVerifyMimeType(
  buffer: Buffer,
  originalMimeType: string,
  filename?: string,
): Promise<string> {
  const fileTypeResult = await fileTypeFromBuffer(buffer);
  let verifiedMimeType = fileTypeResult?.mime || originalMimeType;

  // Special handling for SVG files that might be detected as application/xml
  if (
    (verifiedMimeType === "application/xml" || verifiedMimeType === "text/xml") &&
    filename
  ) {
    if (filename.toLowerCase().endsWith(".svg")) {
      verifiedMimeType = "image/svg+xml";
    }
  }

  // Special handling for Apple iWork files that might be detected as ZIP
  if (verifiedMimeType === "application/zip" && filename) {
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith(".numbers")) {
      verifiedMimeType = "application/vnd.apple.numbers";
    } else if (lowerFilename.endsWith(".pages")) {
      verifiedMimeType = "application/vnd.apple.pages";
    } else if (lowerFilename.endsWith(".keynote")) {
      verifiedMimeType = "application/vnd.apple.keynote";
    }
  }

  return verifiedMimeType;
}

/**
 * Lenient URL check that allows URLs without protocol.
 */
export function isLaxUrl(str: string): boolean {
  if (isUrl(str)) return true;
  // Try again with a protocol prepended for cases like "google.com"
  if (str.includes(".") && !str.includes(" ") && !str.startsWith("http")) {
    return isUrl(`http://${str}`);
  }
  return false;
}

// --- CONTENT CLASSIFICATION AND CREATION ---

interface CreateContentPayload {
  contentBuffer: Buffer;
  mimeType: string;
  metadata: Record<string, any>;
  filename?: string;
  userId: string;
  userAgent: string;
  requestId?: string;
}

type CreateContentResult =
  | { success: true; result: any; assetType: string }
  | { success: false; error: string; statusCode: number };

/**
 * Classifies content and creates the appropriate asset type.
 * Encapsulates all 7 classification rules.
 */
export async function classifyAndCreateContent(
  payload: CreateContentPayload,
): Promise<CreateContentResult> {
  const { contentBuffer, mimeType, metadata, filename, userId, userAgent, requestId } = payload;
  const contentString = contentBuffer.toString("utf-8").trim();

  const servicePayload = {
    metadata,
    originalMimeType: mimeType,
    userAgent,
    userId,
  };

  // Rule 1: Explicit assetType in metadata (overrides all other rules)
  if (metadata.assetType) {
    switch (metadata.assetType) {
      case ASSET_TYPE.BOOKMARK: {
        const url = metadata.url || contentString;
        if (!isLaxUrl(url)) {
          return { success: false, error: "Invalid URL for bookmark", statusCode: 400 };
        }
        const result = await createBookmarkAndQueueJob({
          url: url,
          userId: userId,
          rawMetadata: metadata,
          userAgent: userAgent,
        });
        if (!result.success) {
          return { success: false, error: result.error || "Failed to create bookmark", statusCode: 500 };
        }
        logger.info({ requestId, bookmarkId: result.bookmark.id, rule: "Rule 1 (explicit assetType)" }, "Bookmark created");
        return { success: true, result: result.bookmark, assetType: "bookmark" };
      }
      case ASSET_TYPE.NOTE: {
        const result = await createNoteEntry(
          { ...servicePayload, content: contentString },
          userId,
        );
        logger.info({ requestId, noteId: result.id, rule: "Rule 1 (explicit assetType)" }, "Note created");
        return { success: true, result, assetType: "note" };
      }
      case ASSET_TYPE.PHOTO: {
        if (!PHOTO_MIMES.includes(mimeType)) {
          return { success: false, error: "Content is not a valid photo format.", statusCode: 400 };
        }
        const extractedMetadata = await extractAndGeocode(contentBuffer);
        const result = await createPhoto(
          {
            ...servicePayload,
            content: contentBuffer,
            extractedMetadata,
            metadata: { ...metadata, originalFilename: metadata.originalFilename || filename },
          },
          userId,
        );
        logger.info({ requestId, photoId: result.id, rule: "Rule 1 (explicit assetType)" }, "Photo created");
        return { success: true, result, assetType: "photo" };
      }
      case ASSET_TYPE.DOCUMENT: {
        const result = await createDocument(
          {
            ...servicePayload,
            content: contentBuffer,
            metadata: { ...metadata, originalFilename: metadata.originalFilename || filename },
          },
          userId,
        );
        logger.info({ requestId, documentId: result.id, rule: "Rule 1 (explicit assetType)" }, "Document created");
        return { success: true, result, assetType: "document" };
      }
      case ASSET_TYPE.TASK: {
        const taskData = JSON.parse(contentString);
        if (!taskData.title) {
          return { success: false, error: "Task title is required", statusCode: 400 };
        }
        const result = await createTask(taskData, userId);
        logger.info({ requestId, taskId: result.id, rule: "Rule 1 (explicit assetType)" }, "Task created");
        return { success: true, result, assetType: "task" };
      }
    }
  }

  // Rule 2: URI list MIME types -> Bookmarks
  if (BOOKMARK_MIMES.URI_LIST.includes(mimeType)) {
    const result = await createBookmarkAndQueueJob({
      url: contentString,
      userId: userId,
      rawMetadata: metadata,
      userAgent: userAgent,
    });
    if (!result.success) {
      return { success: false, error: result.error || "Failed to create bookmark", statusCode: 500 };
    }
    logger.info({ requestId, bookmarkId: result.bookmark.id, rule: "Rule 2 (URI list)" }, "Bookmark created");
    return { success: true, result: result.bookmark, assetType: "bookmark" };
  }

  // Rule 3: Text content that is a valid URL -> Bookmarks
  if (BOOKMARK_MIMES.URL_IN_TEXT.includes(mimeType) && isLaxUrl(contentString)) {
    const result = await createBookmarkAndQueueJob({
      url: contentString,
      userId: userId,
      rawMetadata: metadata,
      userAgent: userAgent,
    });
    if (!result.success) {
      return { success: false, error: result.error || "Failed to create bookmark", statusCode: 500 };
    }
    logger.info({ requestId, bookmarkId: result.bookmark.id, rule: "Rule 3 (text URL)" }, "Bookmark created");
    return { success: true, result: result.bookmark, assetType: "bookmark" };
  }

  // Rule 4: Plain text/RTF -> Notes
  if (NOTE_MIMES.includes(mimeType)) {
    const result = await createNoteEntry(
      { ...servicePayload, content: contentString },
      userId,
    );
    logger.info({ requestId, noteId: result.id, rule: "Rule 4 (MIME-based)" }, "Note created");
    return { success: true, result, assetType: "note" };
  }

  // Rule 5: Image MIME types -> Photos
  if (PHOTO_MIMES.includes(mimeType)) {
    const extractedMetadata = await extractAndGeocode(contentBuffer);
    const result = await createPhoto(
      {
        ...servicePayload,
        content: contentBuffer,
        extractedMetadata,
        metadata: { ...metadata, originalFilename: metadata.originalFilename || filename },
      },
      userId,
    );
    logger.info({ requestId, photoId: result.id, rule: "Rule 5 (MIME-based)" }, "Photo created");
    return { success: true, result, assetType: "photo" };
  }

  // Rule 6: Document MIME types -> Documents
  if (DOCUMENT_MIMES.SET.has(mimeType) || mimeType.startsWith(DOCUMENT_MIMES.OPENXML_PREFIX)) {
    const result = await createDocument(
      {
        ...servicePayload,
        content: contentBuffer,
        metadata: { ...metadata, originalFilename: metadata.originalFilename || filename },
      },
      userId,
    );
    logger.info({ requestId, documentId: result.id, rule: "Rule 6 (MIME-based)" }, "Document created");
    return { success: true, result, assetType: "document" };
  }

  // Rule 7: Reject if no rules matched
  return {
    success: false,
    error: `Unsupported content type or invalid data. Could not classify content with MIME type: ${mimeType}`,
    statusCode: 400,
  };
}

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
