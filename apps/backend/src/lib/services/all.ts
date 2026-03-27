// lib/services/all.ts
import { fileTypeFromBuffer } from "file-type";
import isUrl from "is-url";
import { ASSET_TYPE } from "../../types/assets.js";
import {
  BOOKMARK_MIMES,
  DOCUMENT_MIMES,
  MEDIA_AUDIO_MIMES,
  MEDIA_MIMES,
  NOTE_MIMES,
  PHOTO_MIMES,
} from "../../types/mime-types.js";
import { createChildLogger } from "../logger.js";
import {
  countBookmarks,
  createBookmarkAndQueueJob,
  findBookmarks,
} from "./bookmarks.js";
import { countDocuments, createDocument, findDocuments } from "./documents.js";
import { countMedia, createMedia, findMedia } from "./media.js";
import { countNotes, createNoteEntry, findNotes } from "./notes.js";
import {
  countPhotos,
  createPhoto,
  extractAndGeocode,
  findPhotos,
} from "./photos.js";
import { countTasks, createTask, findTasks } from "./tasks.js";
import type { CallerContext } from "./types.js";

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
    (verifiedMimeType === "application/xml" ||
      verifiedMimeType === "text/xml") &&
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

  // Special handling for text-based formats that file-type cannot detect from magic bytes
  if (verifiedMimeType === "application/octet-stream" && filename) {
    const lowerFilename = filename.toLowerCase();
    const textExtensionMap: Record<string, string> = {
      ".md": "text/markdown",
      ".csv": "text/csv",
      ".txt": "text/plain",
      ".html": "text/html",
      ".htm": "text/html",
      ".json": "application/json",
      ".xml": "application/xml",
      ".rtf": "text/rtf",
    };
    const ext = lowerFilename.slice(lowerFilename.lastIndexOf("."));
    const mapped = textExtensionMap[ext];
    if (mapped) {
      verifiedMimeType = mapped;
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
  // biome-ignore lint/suspicious/noExplicitAny: metadata record from mixed item types
  metadata: Record<string, any>;
  filename?: string;
  userId: string;
  userAgent: string;
  requestId?: string;
}

type CreateContentResult =
  // biome-ignore lint/suspicious/noExplicitAny: union result from polymorphic query
  | { success: true; result: any; assetType: string }
  | { success: false; error: string; statusCode: number };

/**
 * Classifies content and creates the appropriate asset type.
 * Encapsulates all 7 classification rules.
 */
export async function classifyAndCreateContent(
  payload: CreateContentPayload,
  caller: CallerContext,
): Promise<CreateContentResult> {
  const {
    contentBuffer,
    mimeType,
    metadata,
    filename,
    userId,
    userAgent,
    requestId,
  } = payload;
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
          return {
            success: false,
            error: "Invalid URL for bookmark",
            statusCode: 400,
          };
        }
        const result = await createBookmarkAndQueueJob(
          {
            url: url,
            userId: userId,
            rawMetadata: metadata,
            userAgent: userAgent,
          },
          caller,
        );
        if (!result.success) {
          return {
            success: false,
            error: result.error || "Failed to create bookmark",
            statusCode: 500,
          };
        }
        logger.info(
          {
            requestId,
            bookmarkId: result.bookmark.id,
            rule: "Rule 1 (explicit assetType)",
          },
          "Bookmark created",
        );
        return {
          success: true,
          result: result.bookmark,
          assetType: "bookmark",
        };
      }
      case ASSET_TYPE.NOTE: {
        const result = await createNoteEntry(
          { ...servicePayload, content: contentString },
          caller,
        );
        logger.info(
          { requestId, noteId: result.id, rule: "Rule 1 (explicit assetType)" },
          "Note created",
        );
        return { success: true, result, assetType: "note" };
      }
      case ASSET_TYPE.PHOTO: {
        if (!PHOTO_MIMES.includes(mimeType)) {
          return {
            success: false,
            error: "Content is not a valid photo format.",
            statusCode: 400,
          };
        }
        const extractedMetadata = await extractAndGeocode(contentBuffer);
        const result = await createPhoto(
          {
            ...servicePayload,
            content: contentBuffer,
            extractedMetadata,
            metadata: {
              ...metadata,
              originalFilename: metadata.originalFilename || filename,
            },
          },
          userId,
          caller,
        );
        logger.info(
          {
            requestId,
            photoId: result.id,
            rule: "Rule 1 (explicit assetType)",
          },
          "Photo created",
        );
        return { success: true, result, assetType: "photo" };
      }
      case ASSET_TYPE.DOCUMENT: {
        const result = await createDocument(
          {
            ...servicePayload,
            content: contentBuffer,
            metadata: {
              ...metadata,
              originalFilename: metadata.originalFilename || filename,
            },
          },
          userId,
          caller,
        );
        logger.info(
          {
            requestId,
            documentId: result.id,
            rule: "Rule 1 (explicit assetType)",
          },
          "Document created",
        );
        return { success: true, result, assetType: "document" };
      }
      case ASSET_TYPE.TASK: {
        const taskData = JSON.parse(contentString);
        if (!taskData.title) {
          return {
            success: false,
            error: "Task title is required",
            statusCode: 400,
          };
        }
        const result = await createTask(taskData, caller);
        logger.info(
          { requestId, taskId: result.id, rule: "Rule 1 (explicit assetType)" },
          "Task created",
        );
        return { success: true, result, assetType: "task" };
      }
    }
  }

  // Rule 2: URI list MIME types -> Bookmarks
  if (BOOKMARK_MIMES.URI_LIST.includes(mimeType)) {
    const result = await createBookmarkAndQueueJob(
      {
        url: contentString,
        userId: userId,
        rawMetadata: metadata,
        userAgent: userAgent,
      },
      caller,
    );
    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to create bookmark",
        statusCode: 500,
      };
    }
    logger.info(
      { requestId, bookmarkId: result.bookmark.id, rule: "Rule 2 (URI list)" },
      "Bookmark created",
    );
    return { success: true, result: result.bookmark, assetType: "bookmark" };
  }

  // Rule 3: Text content that is a valid URL -> Bookmarks
  if (
    BOOKMARK_MIMES.URL_IN_TEXT.includes(mimeType) &&
    isLaxUrl(contentString)
  ) {
    const result = await createBookmarkAndQueueJob(
      {
        url: contentString,
        userId: userId,
        rawMetadata: metadata,
        userAgent: userAgent,
      },
      caller,
    );
    if (!result.success) {
      return {
        success: false,
        error: result.error || "Failed to create bookmark",
        statusCode: 500,
      };
    }
    logger.info(
      { requestId, bookmarkId: result.bookmark.id, rule: "Rule 3 (text URL)" },
      "Bookmark created",
    );
    return { success: true, result: result.bookmark, assetType: "bookmark" };
  }

  // Rule 4: Plain text/RTF -> Notes
  if (NOTE_MIMES.includes(mimeType)) {
    const result = await createNoteEntry(
      { ...servicePayload, content: contentString },
      caller,
    );
    logger.info(
      { requestId, noteId: result.id, rule: "Rule 4 (MIME-based)" },
      "Note created",
    );
    return { success: true, result, assetType: "note" };
  }

  // Rule 5: Audio/Video MIME types -> Media
  if (MEDIA_MIMES.includes(mimeType)) {
    const result = await createMedia(
      {
        ...servicePayload,
        content: contentBuffer,
        metadata: {
          ...metadata,
          originalFilename: metadata.originalFilename || filename,
        },
      },
      userId,
      caller,
    );
    logger.info(
      { requestId, mediaId: result.id, rule: "Rule 5 (media MIME)" },
      "Media created",
    );
    return { success: true, result, assetType: "media" };
  }

  // Rule 6: Image MIME types -> Photos
  if (PHOTO_MIMES.includes(mimeType)) {
    const extractedMetadata = await extractAndGeocode(contentBuffer);
    const result = await createPhoto(
      {
        ...servicePayload,
        content: contentBuffer,
        extractedMetadata,
        metadata: {
          ...metadata,
          originalFilename: metadata.originalFilename || filename,
        },
      },
      userId,
      caller,
    );
    logger.info(
      { requestId, photoId: result.id, rule: "Rule 6 (MIME-based)" },
      "Photo created",
    );
    return { success: true, result, assetType: "photo" };
  }

  // Rule 7: Document MIME types -> Documents
  if (
    DOCUMENT_MIMES.SET.has(mimeType) ||
    mimeType.startsWith(DOCUMENT_MIMES.OPENXML_PREFIX)
  ) {
    const result = await createDocument(
      {
        ...servicePayload,
        content: contentBuffer,
        metadata: {
          ...metadata,
          originalFilename: metadata.originalFilename || filename,
        },
      },
      userId,
      caller,
    );
    logger.info(
      { requestId, documentId: result.id, rule: "Rule 7 (MIME-based)" },
      "Document created",
    );
    return { success: true, result, assetType: "document" };
  }

  // Rule 8: Reject if no rules matched
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

// ---------------------------------------------------------------------------
// Cross-entity search with cursor pagination
// ---------------------------------------------------------------------------

interface FindAllParams {
  userId: string;
  text?: string;
  tagsList?: string[];
  startDate?: Date;
  endDate?: Date;
  types?: string[];
  limit?: number;
  cursor?: string;
  dueStatus?: string;
  isPinned?: boolean;
  flagged?: boolean;
  flagColor?: string;
  reviewStatus?: string;
}

// biome-ignore lint/suspicious/noExplicitAny: items from heterogeneous entity queries
type AllItem = Record<string, any> & { type: string };

interface CursorPaginatedAll {
  items: AllItem[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Decode cross-entity cursor.
 * Format: base64url(JSON({ d: isoDateString, id: entityId }))
 */
function decodeCrossEntityCursor(cursor: string): {
  date: string;
  id: string;
} {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    );
    return { date: parsed.d, id: parsed.id };
  } catch {
    throw new Error("Invalid cursor");
  }
}

function encodeCrossEntityCursor(date: string, id: string): string {
  return Buffer.from(JSON.stringify({ d: date, id })).toString("base64url");
}

/**
 * Search across all content types with cursor-based pagination.
 *
 * Fetches limit items from each type, merges by createdAt desc,
 * applies cursor for deterministic paging, and returns the top `limit` items.
 */
export async function findAllEntries({
  userId,
  text,
  tagsList,
  startDate,
  endDate,
  types,
  limit = 50,
  cursor,
  dueStatus,
  isPinned,
  flagged,
  flagColor,
  reviewStatus,
}: FindAllParams): Promise<CursorPaginatedAll> {
  try {
    const dueDateFilter = getDueDateRange(dueStatus);
    const dueDateStart = dueDateFilter?.startDue;
    const dueDateEnd = dueDateFilter?.endDue;

    const commonParams = {
      userId,
      text,
      tags: tagsList,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    };

    // Determine which types to query
    const activeTypes = new Set(
      types && types.length > 0
        ? types
        : ["bookmark", "document", "media", "note", "photo", "task"],
    );

    // Fetch limit+1 from each active type (extra to detect hasMore after merge)
    const fetchLimit = limit + 1;
    const promises: Promise<AllItem[]>[] = [];

    if (activeTypes.has("bookmark")) {
      promises.push(
        findBookmarks({ ...commonParams, limit: fetchLimit }).then((r) =>
          r.items.map((item) => ({ ...item, type: "bookmark" })),
        ),
      );
    }
    if (activeTypes.has("document")) {
      promises.push(
        findDocuments({ ...commonParams, limit: fetchLimit }).then((r) =>
          r.items.map((item) => ({ ...item, type: "document" })),
        ),
      );
    }
    if (activeTypes.has("note")) {
      promises.push(
        findNotes({ ...commonParams, limit: fetchLimit }).then((r) =>
          r.items.map((item) => ({ ...item, type: "note" })),
        ),
      );
    }
    if (activeTypes.has("media")) {
      promises.push(
        findMedia({ ...commonParams, limit: fetchLimit }).then((r) =>
          r.items.map((item) => ({ ...item, type: "media" })),
        ),
      );
    }
    if (activeTypes.has("photo")) {
      promises.push(
        findPhotos({ ...commonParams, limit: fetchLimit }).then((r) =>
          r.items.map((item) => ({ ...item, type: "photo" })),
        ),
      );
    }
    if (activeTypes.has("task")) {
      promises.push(
        findTasks({
          ...commonParams,
          taskStatus: undefined,
          limit: fetchLimit,
        }).then((r) => r.items.map((item) => ({ ...item, type: "task" }))),
      );
    }

    const results = await Promise.all(promises);
    let allItems = results.flat();

    // Apply cross-entity filters (shared columns across all entity types)
    if (isPinned !== undefined) {
      allItems = allItems.filter((item) => item.isPinned === isPinned);
    }
    if (flagged) {
      allItems = allItems.filter(
        (item) => item.flagColor !== null && item.flagColor !== undefined,
      );
    }
    if (flagColor) {
      allItems = allItems.filter((item) => item.flagColor === flagColor);
    }
    if (reviewStatus) {
      allItems = allItems.filter((item) => item.reviewStatus === reviewStatus);
    }

    // Normalize date field (services return different field names)
    for (const item of allItems) {
      if (!item.createdAt && item.date) {
        item.createdAt = item.date;
      }
    }

    // Sort by createdAt desc, then id desc for tie-breaking
    allItems.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      if (dateB !== dateA) return dateB - dateA;
      return (b.id || "").localeCompare(a.id || "");
    });

    // Apply cursor: skip items at or before the cursor position
    if (cursor) {
      const { date: cursorDate, id: cursorId } =
        decodeCrossEntityCursor(cursor);
      const cursorTime = new Date(cursorDate).getTime();
      const idx = allItems.findIndex((item) => {
        const t = new Date(item.createdAt || 0).getTime();
        return t < cursorTime || (t === cursorTime && item.id <= cursorId);
      });
      if (idx > 0) {
        allItems = allItems.slice(idx);
      }
    }

    // Check hasMore and trim to limit
    const hasMore = allItems.length > limit;
    const items = hasMore ? allItems.slice(0, limit) : allItems;

    // Build next cursor from last item
    const lastItem = items[items.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? encodeCrossEntityCursor(lastItem.createdAt, lastItem.id)
        : null;

    return { items, nextCursor, hasMore };
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
 * Count items across all content types matching the given criteria.
 */
export async function countAllEntries({
  userId,
  text,
  tagsList,
  startDate,
  endDate,
  types,
  dueStatus,
}: Omit<FindAllParams, "limit" | "cursor">): Promise<number> {
  try {
    const dueDateFilter = getDueDateRange(dueStatus);
    const dueDateStart = dueDateFilter?.startDue;
    const dueDateEnd = dueDateFilter?.endDue;

    const commonParams = {
      userId,
      text,
      tags: tagsList,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    };

    const activeTypes = new Set(
      types && types.length > 0
        ? types
        : ["bookmark", "document", "media", "note", "photo", "task"],
    );

    const countPromises: Promise<number>[] = [];
    if (activeTypes.has("bookmark"))
      countPromises.push(countBookmarks(commonParams));
    if (activeTypes.has("document"))
      countPromises.push(countDocuments(commonParams));
    if (activeTypes.has("media")) countPromises.push(countMedia(commonParams));
    if (activeTypes.has("note")) countPromises.push(countNotes(commonParams));
    if (activeTypes.has("photo")) countPromises.push(countPhotos(commonParams));
    if (activeTypes.has("task"))
      countPromises.push(
        countTasks({ ...commonParams, taskStatus: undefined }),
      );

    const counts = await Promise.all(countPromises);
    return counts.reduce((sum, c) => sum + c, 0);
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Error counting all entries",
    );
    throw new Error("Failed to count items across all collections");
  }
}

/**
 * Find all entries with count (first page only includes totalCount).
 */
export async function findAllEntriesPaginated(
  params: FindAllParams,
): Promise<CursorPaginatedAll> {
  const isFirstPage = !params.cursor;

  if (isFirstPage) {
    const [result, totalCount] = await Promise.all([
      findAllEntries(params),
      countAllEntries(params),
    ]);
    return { ...result, totalCount };
  }

  return findAllEntries(params);
}
