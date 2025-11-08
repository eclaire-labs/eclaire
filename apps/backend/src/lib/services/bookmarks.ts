// lib/services/bookmarks.ts

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  like,
  lte,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import { db, txManager, schema } from "@/db";
import { generateBookmarkId } from "@/lib/id-generator";

const {
  assetProcessingJobs,
  bookmarks,
  bookmarksTags,
  tags,
} = schema;
import { formatToISO8601, getOrCreateTags } from "@/lib/db-helpers";
import { getQueue, QueueNames } from "@/lib/queues";
import { getQueueAdapter } from "@/lib/queue-adapter";
import { createChildLogger } from "../logger";
import { recordHistory } from "./history";
import { createOrUpdateProcessingJob } from "./processing-status";

const logger = createChildLogger("services:bookmarks");

// --- TYPES AND INTERFACES ---

interface CreateBookmarkPayload {
  url: string;
  userId: string;
  rawMetadata: Record<string, any>;
  userAgent: string;
}

interface UpdateBookmarkParams {
  title?: string;
  url?: string;
  description?: string | null;
  dueDate?: string | null;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  author?: string | null;
  lang?: string | null;
  contentType?: string | null;
  etag?: string | null;
  lastModified?: string | null;
}

/**
 * Helper function to detect MIME type from file extension in storage ID
 */
const getMimeTypeFromStorageId = (storageId: string): string => {
  const lowerStorageId = storageId.toLowerCase();

  if (lowerStorageId.endsWith(".svg")) return "image/svg+xml";
  if (lowerStorageId.endsWith(".png")) return "image/png";
  if (lowerStorageId.endsWith(".jpg") || lowerStorageId.endsWith(".jpeg"))
    return "image/jpeg";
  if (lowerStorageId.endsWith(".gif")) return "image/gif";
  if (lowerStorageId.endsWith(".ico")) return "image/x-icon";

  // Default fallback for extensionless files (backward compatibility)
  return "image/x-icon";
};

const assetTypeToColumnMap = {
  favicon: {
    column: bookmarks.faviconStorageId,
    mime: "image/x-icon",
    dynamicMime: true,
  },
  thumbnail: { column: bookmarks.thumbnailStorageId, mime: "image/jpeg" },
  screenshot: {
    column: bookmarks.screenshotDesktopStorageId,
    mime: "image/jpeg",
  }, // Desktop screenshot
  screenshotMobile: {
    column: bookmarks.screenshotMobileStorageId,
    mime: "image/jpeg",
  }, // Mobile screenshot
  screenshotFullPage: {
    column: bookmarks.screenshotFullPageStorageId,
    mime: "image/jpeg",
  }, // Full page screenshot
  pdf: { column: bookmarks.pdfStorageId, mime: "application/pdf" },
  readable: { column: bookmarks.readableHtmlStorageId, mime: "text/html" },
  raw: { column: bookmarks.rawHtmlStorageId, mime: "text/html" },
  extractedMd: {
    column: bookmarks.extractedMdStorageId,
    mime: "text/markdown",
  }, // Extracted markdown content
  extractedTxt: { column: bookmarks.extractedTxtStorageId, mime: "text/plain" }, // Extracted plain text content
  readme: { column: bookmarks.readmeStorageId, mime: "text/markdown" }, // README content for GitHub repositories
};

export type BookmarkAssetType = keyof typeof assetTypeToColumnMap;

// --- PUBLIC-FACING SERVICES (Called by API routes) ---

/**
 * Retrieves the storage ID and mime type for a specific bookmark asset.
 * Throws errors for not found or access denied.
 */
export async function getBookmarkAssetDetails(
  bookmarkId: string,
  userId: string,
  assetType: BookmarkAssetType,
) {
  const assetInfo = assetTypeToColumnMap[assetType];
  if (!assetInfo) {
    throw new Error("Invalid asset type");
  }

  const [result] = await db
    .select({
      storageId: assetInfo.column,
    })
    .from(bookmarks)
    .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));

  if (!result) {
    const notFoundError = new Error("Bookmark not found");
    (notFoundError as any).name = "NotFoundError";
    throw notFoundError;
  }

  if (!result.storageId) {
    const fileNotFoundError = new Error(
      `${assetType} not found for this bookmark`,
    );
    (fileNotFoundError as any).name = "FileNotFoundError";
    throw fileNotFoundError;
  }

  // Use dynamic MIME type detection for favicons, static for others
  const mimeType = (assetInfo as any).dynamicMime
    ? getMimeTypeFromStorageId(result.storageId)
    : assetInfo.mime;

  logger.debug(
    { assetType, storageId: result.storageId, mimeType },
    "Serving bookmark asset with detected MIME type",
  );

  return {
    storageId: result.storageId,
    mimeType,
  };
}

/**
 * Creates initial DB entries for a bookmark and its processing job, then queues the job.
 * This is called by the public POST /api/bookmarks endpoint.
 */
export async function createBookmarkAndQueueJob(
  payload: CreateBookmarkPayload,
) {
  try {
    const { url, userId, rawMetadata, userAgent } = payload;

    // Check if background processing is enabled (default true if not specified)
    const enabled = rawMetadata.enabled !== false; // Will be true unless explicitly set to false

    // Extract core fields from rawMetadata, with URL as fallback for title
    const title = rawMetadata.title || url;
    const description = rawMetadata.description || null;

    // Convert dueDate string to Date object
    const dueDateValue = rawMetadata.dueDate
      ? new Date(rawMetadata.dueDate)
      : null;

    // Pre-generate bookmark ID before transaction
    const bookmarkId = generateBookmarkId();
    // Note: Job ID is generated by queue adapter when job is created

    // Get or create tags BEFORE transaction if provided
    const tags = rawMetadata.tags;
    let tagList: { id: string; name: string }[] = [];
    if (tags && Array.isArray(tags) && tags.length > 0) {
      tagList = await getOrCreateTags(tags, userId);
    }

    // Execute synchronous transaction
    await txManager.withTransaction((tx) => {
      // Insert bookmark
      tx.bookmarks.insert({
        id: bookmarkId,
        userId: userId,
        originalUrl: url,
        title: title,
        description: description,
        dueDate: dueDateValue,
        rawMetadata: rawMetadata,
        userAgent: userAgent,
        enabled: enabled,
      });

      // Note: Processing job creation moved outside transaction to avoid race condition.
      // The queue adapter's upsert handles job creation atomically with jobData.

      // Insert bookmark-tag relationships
      if (tagList.length > 0) {
        tagList.forEach((tag) => {
          tx.bookmarksTags.insert({ bookmarkId, tagId: tag.id });
        });
      }
    });

    // Record history AFTER transaction (not critical for atomicity)
    await recordHistory({
      action: "create",
      itemType: "bookmark",
      itemId: bookmarkId,
      itemName: title || url,
      actor: "user",
      userId: userId,
    });

    // Initialize processing job status tracking
    if (enabled) {
      await createOrUpdateProcessingJob("bookmarks", bookmarkId, userId, [
        "validation",
        "content_extraction",
        "ai_tagging",
      ]).catch((error) => {
        logger.error(
          { bookmarkId, userId, error: error.message },
          "Failed to initialize processing job for bookmark",
        );
        // Don't fail bookmark creation if processing job initialization fails
      });
    }

    // Only queue the main processing job if enabled
    if (enabled) {
      try {
        const queueAdapter = getQueueAdapter();
        await queueAdapter.enqueueBookmark({
          bookmarkId,
          url,
          userId,
        });
        logger.info(
          {
            bookmarkId,
            userId,
            enabled: true,
          },
          "Queued bookmark processing job",
        );
      } catch (error) {
        logger.error(
          {
            bookmarkId,
            userId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to enqueue bookmark processing job",
        );
        // Optionally update the job status to 'failed' here
      }
    } else {
      logger.info(
        {
          bookmarkId,
          userId,
          enabled: false,
        },
        "Skipped queuing bookmark processing job",
      );
    }

    const initialBookmarkData = await getBookmarkById(bookmarkId, userId);
    return { success: true, bookmark: initialBookmarkData };
  } catch (error) {
    logger.error(
      {
        payload,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error in createBookmarkAndQueueJob",
    );
    return { success: false, error: "Failed to create bookmark." };
  }
}

/**
 * Updates a bookmark's user-editable fields (title, description, tags).
 * Called by the public PUT/PATCH /api/bookmarks/:id endpoints.
 */
export async function updateBookmark(
  id: string,
  bookmarkData: UpdateBookmarkParams,
  userId: string,
) {
  try {
    const existingBookmark = await getBookmarkById(id, userId);
    if (!existingBookmark) throw new Error("Bookmark not found");

    const { tags: tagNames, dueDate, ...apiUpdateData } = bookmarkData;

    // Map API fields to database fields
    const dbUpdateData = mapApiRequestToDbFields(apiUpdateData);

    // Handle dueDate conversion if provided
    if (Object.hasOwn(bookmarkData, "dueDate")) {
      const dueDateValue = dueDate ? new Date(dueDate) : null;
      dbUpdateData.dueDate = dueDateValue;
    }

    // The `set` object now correctly matches the schema.
    if (Object.keys(dbUpdateData).length > 0) {
      await db
        .update(bookmarks)
        .set({
          ...dbUpdateData,
          updatedAt: new Date(),
        })
        .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));
    }

    if (tagNames !== undefined) {
      await db.delete(bookmarksTags).where(eq(bookmarksTags.bookmarkId, id));
      if (tagNames.length > 0) {
        await addTagsToBookmark(id, tagNames, userId);
      }
    }

    await recordHistory({
      action: "update",
      itemType: "bookmark",
      itemId: id,
      itemName:
        bookmarkData.title || existingBookmark.title || existingBookmark.url,
      beforeData: existingBookmark,
      afterData: { ...existingBookmark, ...bookmarkData },
      actor: "user",
      userId: userId,
    });

    return await getBookmarkById(id, userId);
  } catch (error) {
    logger.error(
      {
        bookmarkId: id,
        userId,
        bookmarkData,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error updating bookmark",
    );
    throw new Error("Failed to update bookmark");
  }
}

/**
 * Deletes a bookmark and its associated tags and processing jobs.
 * @param id - The ID of the bookmark to delete.
 * @param userId - The ID of the user performing the deletion (for authorization).
 * @param deleteStorage - Optional flag to control storage deletion. Defaults to true.
 */
export async function deleteBookmark(
  id: string,
  userId: string,
  deleteStorage: boolean = true,
) {
  try {
    const existingBookmark = await getBookmarkById(id, userId);
    if (!existingBookmark) throw new Error("Bookmark not found");

    // Delete bookmark-tag relationships first
    await db.delete(bookmarksTags).where(eq(bookmarksTags.bookmarkId, id));

    // Delete the processing job
    await db
      .delete(assetProcessingJobs)
      .where(
        and(
          eq(assetProcessingJobs.assetType, "bookmarks"),
          eq(assetProcessingJobs.assetId, id),
        ),
      );

    // Delete the bookmark itself
    await db
      .delete(bookmarks)
      .where(and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)));

    // Record history after deletion
    await recordHistory({
      action: "delete",
      itemType: "bookmark",
      itemId: id,
      itemName: existingBookmark.title || existingBookmark.url,
      beforeData: existingBookmark,
      actor: "user",
      userId: userId,
    });

    // Delete the entire asset folder if deleteStorage is true
    if (deleteStorage) {
      try {
        const { objectStorage } = await import("@/lib/storage");
        await objectStorage.deleteAsset(userId, "bookmarks", id);
        logger.info(
          `Successfully deleted storage for bookmark ${id} (user: ${userId})`,
        );
      } catch (storageError: any) {
        // Log that storage deletion failed but DB entry is gone.
        logger.warn(
          `DB record ${id} deleted, but failed to delete asset folder for bookmark ${id} (user: ${userId}):`,
          storageError.message || storageError,
        );
        // Do not throw here, allow the operation to succeed from user's perspective.
      }
    } else {
      logger.info(
        `Storage deletion skipped for bookmark ${id} (user: ${userId}) - deleteStorage flag set to false`,
      );
    }

    return { success: true };
  } catch (error) {
    logger.error(
      {
        bookmarkId: id,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error deleting bookmark",
    );
    throw new Error("Failed to delete bookmark");
  }
}

// --- HELPER FUNCTIONS FOR API MAPPING ---

/**
 * Maps database bookmark fields to API response format
 * - originalUrl -> url (main field)
 * - normalizedUrl -> normalizedUrl (separate field, only if exists)
 * - timestamps converted to ISO strings
 */
function mapBookmarkToApiResponse(dbBookmark: any) {
  const {
    originalUrl,
    normalizedUrl,
    createdAt,
    updatedAt,
    pageLastUpdatedAt,
    dueDate,
    status,
    // Extract storage IDs for URL generation
    faviconStorageId,
    thumbnailStorageId,
    screenshotDesktopStorageId,
    screenshotMobileStorageId,
    screenshotFullPageStorageId,
    pdfStorageId,
    readableHtmlStorageId,
    extractedMdStorageId,
    extractedTxtStorageId,
    rawHtmlStorageId,
    readmeStorageId,
    ...rest
  } = dbBookmark;

  const apiResponse = {
    ...rest,
    url: originalUrl, // Map originalUrl to url for API
    normalizedUrl: normalizedUrl || null, // Only include if exists
    createdAt: formatToISO8601(createdAt),
    updatedAt: formatToISO8601(updatedAt),
    pageLastUpdatedAt: pageLastUpdatedAt
      ? formatToISO8601(pageLastUpdatedAt)
      : null,
    dueDate: dueDate ? formatToISO8601(dueDate) : null,
    processingStatus: status || null,

    // Generate URLs from storage IDs (null if storage ID doesn't exist)
    faviconUrl: faviconStorageId
      ? `/api/bookmarks/${dbBookmark.id}/favicon`
      : null,
    thumbnailUrl: thumbnailStorageId
      ? `/api/bookmarks/${dbBookmark.id}/thumbnail`
      : null,
    screenshotUrl: screenshotDesktopStorageId
      ? `/api/bookmarks/${dbBookmark.id}/screenshot`
      : null,
    screenshotMobileUrl: screenshotMobileStorageId
      ? `/api/bookmarks/${dbBookmark.id}/screenshot-mobile`
      : null,
    screenshotFullPageUrl: screenshotFullPageStorageId
      ? `/api/bookmarks/${dbBookmark.id}/screenshot-fullpage`
      : null,
    pdfUrl: pdfStorageId ? `/api/bookmarks/${dbBookmark.id}/pdf` : null,
    contentUrl: extractedMdStorageId
      ? `/api/bookmarks/${dbBookmark.id}/content`
      : null,
    readableUrl: readableHtmlStorageId
      ? `/api/bookmarks/${dbBookmark.id}/readable`
      : null,
    readmeUrl: readmeStorageId
      ? `/api/bookmarks/${dbBookmark.id}/readme`
      : null,
  };

  // Remove undefined fields to keep response clean
  Object.keys(apiResponse).forEach((key) => {
    if (apiResponse[key] === undefined) {
      delete apiResponse[key];
    }
  });

  return apiResponse;
}

/**
 * Maps API request fields to database fields for updates
 * - url -> originalUrl (but preserve normalizedUrl if it exists)
 */
function mapApiRequestToDbFields(apiData: any) {
  const { url, ...rest } = apiData;

  const dbFields = { ...rest };
  if (url) {
    dbFields.originalUrl = url;
    // Note: We don't overwrite normalizedUrl here as it's computed by workers
  }

  return dbFields;
}

/**
 * Retrieves all bookmarks for a user, including their tags and processing status.
 */
export async function getAllBookmarks(userId: string) {
  try {
    const bookmarksList = await db
      .select({
        id: bookmarks.id,
        title: bookmarks.title,
        originalUrl: bookmarks.originalUrl,
        normalizedUrl: bookmarks.normalizedUrl,
        description: bookmarks.description,
        author: bookmarks.author,
        lang: bookmarks.lang,
        createdAt: bookmarks.createdAt,
        updatedAt: bookmarks.updatedAt,
        pageLastUpdatedAt: bookmarks.pageLastUpdatedAt,
        dueDate: bookmarks.dueDate,
        faviconStorageId: bookmarks.faviconStorageId,
        thumbnailStorageId: bookmarks.thumbnailStorageId,
        screenshotDesktopStorageId: bookmarks.screenshotDesktopStorageId,
        screenshotMobileStorageId: bookmarks.screenshotMobileStorageId,
        screenshotFullPageStorageId: bookmarks.screenshotFullPageStorageId,
        pdfStorageId: bookmarks.pdfStorageId,
        readableHtmlStorageId: bookmarks.readableHtmlStorageId,
        extractedMdStorageId: bookmarks.extractedMdStorageId,
        extractedTxtStorageId: bookmarks.extractedTxtStorageId,
        rawHtmlStorageId: bookmarks.rawHtmlStorageId,
        readmeStorageId: bookmarks.readmeStorageId,
        extractedText: bookmarks.extractedText,
        rawMetadata: bookmarks.rawMetadata,
        reviewStatus: bookmarks.reviewStatus,
        flagColor: bookmarks.flagColor,
        isPinned: bookmarks.isPinned,
        enabled: bookmarks.enabled,
        status: assetProcessingJobs.status,
      })
      .from(bookmarks)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(bookmarks.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "bookmarks"),
        ),
      )
      .where(eq(bookmarks.userId, userId))
      .orderBy(desc(bookmarks.createdAt));

    // This part remains the same, it just adds tags to the already-fetched data
    return await Promise.all(
      bookmarksList.map(async (bookmark) => {
        const bookmarkWithTags = {
          ...bookmark,
          tags: await getBookmarkTags(bookmark.id),
        };
        return mapBookmarkToApiResponse(bookmarkWithTags);
      }),
    );
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting all bookmarks",
    );
    throw new Error("Failed to fetch bookmarks");
  }
}

/**
 * Retrieves a single bookmark by its ID, including tags and processing status.
 */
export async function getBookmarkById(bookmarkId: string, userId: string) {
  try {
    const [bookmark] = await db
      .select({
        id: bookmarks.id,
        title: bookmarks.title,
        originalUrl: bookmarks.originalUrl,
        normalizedUrl: bookmarks.normalizedUrl,
        description: bookmarks.description,
        author: bookmarks.author,
        lang: bookmarks.lang,
        createdAt: bookmarks.createdAt,
        updatedAt: bookmarks.updatedAt,
        pageLastUpdatedAt: bookmarks.pageLastUpdatedAt,
        dueDate: bookmarks.dueDate,
        contentType: bookmarks.contentType,
        etag: bookmarks.etag,
        lastModified: bookmarks.lastModified,
        faviconStorageId: bookmarks.faviconStorageId,
        thumbnailStorageId: bookmarks.thumbnailStorageId,
        screenshotDesktopStorageId: bookmarks.screenshotDesktopStorageId,
        screenshotMobileStorageId: bookmarks.screenshotMobileStorageId,
        screenshotFullPageStorageId: bookmarks.screenshotFullPageStorageId,
        pdfStorageId: bookmarks.pdfStorageId,
        readableHtmlStorageId: bookmarks.readableHtmlStorageId,
        extractedMdStorageId: bookmarks.extractedMdStorageId,
        extractedTxtStorageId: bookmarks.extractedTxtStorageId,
        rawHtmlStorageId: bookmarks.rawHtmlStorageId,
        readmeStorageId: bookmarks.readmeStorageId,
        extractedText: bookmarks.extractedText,
        rawMetadata: bookmarks.rawMetadata,
        reviewStatus: bookmarks.reviewStatus,
        flagColor: bookmarks.flagColor,
        isPinned: bookmarks.isPinned,
        enabled: bookmarks.enabled,
        status: assetProcessingJobs.status,
      })
      .from(bookmarks)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(bookmarks.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "bookmarks"),
        ),
      )
      .where(and(eq(bookmarks.id, bookmarkId), eq(bookmarks.userId, userId)));

    if (!bookmark) return null;

    const bookmarkWithTags = {
      ...bookmark,
      tags: await getBookmarkTags(bookmarkId),
    };

    return mapBookmarkToApiResponse(bookmarkWithTags);
  } catch (error) {
    logger.error(
      {
        bookmarkId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting bookmark by ID",
    );
    throw new Error("Failed to fetch bookmark");
  }
}

// --- INTERNAL-ONLY SERVICES (Called by Worker) ---

/**
 * Updates the bookmark record with artifact results.
 */
export async function updateBookmarkArtifacts(
  bookmarkId: string,
  artifacts: Record<string, any>, // Use a generic Record type now
): Promise<void> {
  // Changed to void for cleaner try/catch
  try {
    const { tags: tagNames, ...bookmarkUpdateData } = artifacts;

    // Get or create tags BEFORE transaction if tags are provided
    let tagList: { id: string; name: string }[] = [];
    if (tagNames !== undefined && Array.isArray(tagNames) && tagNames.length > 0) {
      // Find the bookmark's userId for tag scoping
      const bookmarkResult = await db.query.bookmarks.findFirst({
        columns: { userId: true },
        where: eq(bookmarks.id, bookmarkId),
      });

      if (bookmarkResult) {
        tagList = await getOrCreateTags(tagNames, bookmarkResult.userId);
      }
    }

    // Execute synchronous transaction
    await txManager.withTransaction((tx) => {
      if (Object.keys(bookmarkUpdateData).length > 0) {
        tx.bookmarks.update(eq(bookmarks.id, bookmarkId), {
          ...bookmarkUpdateData,
          updatedAt: new Date(),
        });
      }

      if (tagNames !== undefined && Array.isArray(tagNames)) {
        // Clear existing tags
        tx.bookmarksTags.delete(eq(bookmarksTags.bookmarkId, bookmarkId));

        // Insert new tags
        if (tagList.length > 0) {
          tagList.forEach((tag) => {
            tx.bookmarksTags.insert({ bookmarkId, tagId: tag.id });
          });
        }
      }
    });
  } catch (err) {
    logger.error(
      {
        bookmarkId,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      "Error updating bookmark artifacts",
    );
    throw err; // Re-throw error
  }
}

// --- HELPER & SEARCH FUNCTIONS ---

function _buildBookmarkQueryConditions(
  userId: string,
  text?: string,
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): SQL<unknown>[] {
  const definedConditions: SQL<unknown>[] = [eq(bookmarks.userId, userId)];

  if (text) {
    const searchTerm = `%${text.trim()}%`;
    // Search across title, description, and both URL fields
    definedConditions.push(
      or(
        like(bookmarks.title, searchTerm),
        like(bookmarks.description, searchTerm),
        like(bookmarks.originalUrl, searchTerm),
        like(bookmarks.normalizedUrl, searchTerm),
      ) as SQL<unknown>,
    );
  }

  if (startDate) {
    definedConditions.push(gte(bookmarks.createdAt, startDate));
  }

  if (endDate) {
    definedConditions.push(lte(bookmarks.createdAt, endDate));
  }

  // Add due date filtering conditions
  if (dueDateStart) {
    definedConditions.push(gte(bookmarks.dueDate, dueDateStart));
  }

  if (dueDateEnd) {
    definedConditions.push(lte(bookmarks.dueDate, dueDateEnd));
  }

  return definedConditions;
}

export async function findBookmarks(
  userId: string,
  text?: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  limit = 50,
  dueDateStart?: Date,
  dueDateEnd?: Date,
) {
  try {
    const conditions = _buildBookmarkQueryConditions(
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );

    const query = db
      .select({
        id: bookmarks.id,
        title: bookmarks.title,
        originalUrl: bookmarks.originalUrl,
        description: bookmarks.description,
        createdAt: bookmarks.createdAt,
        dueDate: bookmarks.dueDate,
        reviewStatus: bookmarks.reviewStatus,
        flagColor: bookmarks.flagColor,
        isPinned: bookmarks.isPinned,
        enabled: bookmarks.enabled,
        status: assetProcessingJobs.status,
      })
      .from(bookmarks)
      .leftJoin(
        assetProcessingJobs,
        and(
          eq(bookmarks.id, assetProcessingJobs.assetId),
          eq(assetProcessingJobs.assetType, "bookmarks"),
        ),
      )
      .where(and(...conditions))
      .orderBy(desc(bookmarks.createdAt))
      .limit(limit);

    let entriesList = await query;

    if (tagsList && tagsList.length > 0) {
      const entryIds = entriesList.map((e) => e.id);
      if (entryIds.length === 0) return [];

      const entriesWithAllTags = await db
        .select({ bookmarkId: bookmarksTags.bookmarkId })
        .from(bookmarksTags)
        .innerJoin(tags, eq(bookmarksTags.tagId, tags.id))
        .where(
          and(
            inArray(bookmarksTags.bookmarkId, entryIds),
            eq(tags.userId, userId),
            inArray(tags.name, tagsList),
          ),
        )
        .groupBy(bookmarksTags.bookmarkId)
        .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);

      const filteredEntryIds = entriesWithAllTags.map((e) => e.bookmarkId);
      entriesList = entriesList.filter((entry) =>
        filteredEntryIds.includes(entry.id),
      );
    }

    return await Promise.all(
      entriesList.map(async (entry) => ({
        id: entry.id,
        title: entry.title,
        url: entry.originalUrl, // Return originalUrl as 'url' for consistency
        description: entry.description,
        date: formatToISO8601(entry.createdAt),
        dueDate: entry.dueDate ? formatToISO8601(entry.dueDate) : null,
        reviewStatus: entry.reviewStatus,
        flagColor: entry.flagColor,
        isPinned: entry.isPinned,
        processingStatus: entry.status || null,
        tags: await getBookmarkTags(entry.id),
      })),
    );
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        limit,
        dueDateStart,
        dueDateEnd,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error searching bookmarks",
    );
    throw new Error("Failed to search bookmarks");
  }
}

export async function countBookmarks(
  userId: string,
  text?: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): Promise<number> {
  try {
    const conditions = _buildBookmarkQueryConditions(
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );

    if (!tagsList || tagsList.length === 0) {
      const [result] = await db
        .select({ value: count() })
        .from(bookmarks)
        .where(and(...conditions));
      return result?.value ?? 0;
    }

    const matchingEntries = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(...conditions));
    const entryIds = matchingEntries.map((e) => e.id);
    if (entryIds.length === 0) return 0;

    const entriesWithAllTags = await db
      .select({ bookmarkId: bookmarksTags.bookmarkId })
      .from(bookmarksTags)
      .innerJoin(tags, eq(bookmarksTags.tagId, tags.id))
      .where(
        and(
          inArray(bookmarksTags.bookmarkId, entryIds),
          eq(tags.userId, userId),
          inArray(tags.name, tagsList),
        ),
      )
      .groupBy(bookmarksTags.bookmarkId)
      .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);

    return entriesWithAllTags.length;
  } catch (error) {
    logger.error(
      {
        userId,
        text,
        tagsList,
        startDate,
        endDate,
        dueDateStart,
        dueDateEnd,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error counting bookmarks",
    );
    throw new Error("Failed to count bookmarks");
  }
}

async function getBookmarkTags(bookmarkId: string): Promise<string[]> {
  const result = await db
    .select({ name: tags.name })
    .from(bookmarksTags)
    .innerJoin(tags, eq(bookmarksTags.tagId, tags.id))
    .where(eq(bookmarksTags.bookmarkId, bookmarkId));
  return result.map((t) => t.name);
}

async function addTagsToBookmark(
  bookmarkId: string,
  tagNames: string[],
  userId: string,
  tx?: any,
) {
  const dbOrTx = tx || db;
  if (!tagNames.length) return;
  const tagList = await getOrCreateTags(tagNames, userId, dbOrTx);
  if (tagList.length > 0) {
    await dbOrTx
      .insert(bookmarksTags)
      .values(tagList.map((tag) => ({ bookmarkId, tagId: tag.id })));
  }
}

// --- BOOKMARK IMPORT FUNCTIONS ---

interface BookmarkImportResult {
  imported: number;
  queued: number;
  errors: string[];
}

interface ChromeBookmarkItem {
  type: "url" | "folder";
  name: string;
  url?: string;
  date_added?: string;
  children?: ChromeBookmarkItem[];
}

interface ChromeBookmarkRoot {
  bookmark_bar?: ChromeBookmarkItem;
  other?: ChromeBookmarkItem;
  synced?: ChromeBookmarkItem;
}

interface ChromeBookmarkFile {
  roots: ChromeBookmarkRoot;
  version: number;
}

/**
 * Convert Chrome WebKit timestamp to JavaScript Date
 * Chrome timestamps are in microseconds since January 1, 1601 UTC
 */
function convertChromeTimestamp(timestamp: string): Date {
  const microseconds = parseInt(timestamp, 10);
  // Convert to milliseconds since epoch (Jan 1, 1970)
  const milliseconds = (microseconds - 11644473600000000) / 1000;
  return new Date(milliseconds);
}

/**
 * Recursively extract bookmarks from Chrome folder structure
 */
function extractBookmarksFromFolder(
  folder: ChromeBookmarkItem,
  folderPath: string[] = [],
): Array<{ url: string; title: string; tags: string[]; dateAdded: Date }> {
  const results: Array<{
    url: string;
    title: string;
    tags: string[];
    dateAdded: Date;
  }> = [];

  if (!folder.children) return results;

  for (const item of folder.children) {
    if (item.type === "url" && item.url) {
      // Extract bookmark
      const dateAdded = item.date_added
        ? convertChromeTimestamp(item.date_added)
        : new Date();

      const tags =
        folderPath.length > 0 ? folderPath.map((p) => p.toLowerCase()) : [];

      results.push({
        url: item.url,
        title: item.name || "",
        tags,
        dateAdded,
      });
    } else if (item.type === "folder") {
      // Recursively process subfolder
      const subfolderPath = [...folderPath, item.name];
      results.push(...extractBookmarksFromFolder(item, subfolderPath));
    }
  }

  return results;
}

/**
 * Import bookmarks from Chrome/Brave bookmark JSON file
 */
export async function importBookmarkFile(
  userId: string,
  bookmarkData: any,
): Promise<BookmarkImportResult> {
  const result: BookmarkImportResult = {
    imported: 0,
    queued: 0,
    errors: [],
  };

  try {
    // Validate the bookmark file structure
    if (!bookmarkData.roots || typeof bookmarkData.roots !== "object") {
      result.errors.push("Invalid bookmark file format: missing roots");
      return result;
    }

    const typedData = bookmarkData as ChromeBookmarkFile;
    const allBookmarks: Array<{
      url: string;
      title: string;
      tags: string[];
      dateAdded: Date;
    }> = [];

    // Extract from bookmark_bar
    if (typedData.roots.bookmark_bar) {
      allBookmarks.push(
        ...extractBookmarksFromFolder(typedData.roots.bookmark_bar, [
          "bookmarks-bar",
        ]),
      );
    }

    // Extract from other bookmarks
    if (typedData.roots.other) {
      allBookmarks.push(
        ...extractBookmarksFromFolder(typedData.roots.other, ["other"]),
      );
    }

    // Extract from synced bookmarks
    if (typedData.roots.synced) {
      allBookmarks.push(
        ...extractBookmarksFromFolder(typedData.roots.synced, ["mobile"]),
      );
    }

    // Process each bookmark
    for (const bookmark of allBookmarks) {
      try {
        // Basic URL validation
        if (!bookmark.url || !bookmark.url.startsWith("http")) {
          result.errors.push(`Invalid URL: ${bookmark.url}`);
          continue;
        }

        // Prepare metadata
        const metadata = {
          title: bookmark.title,
          tags: bookmark.tags,
          importedFrom: "chrome-bookmark-file",
        };

        // Create bookmark using existing service
        const createResult = await createBookmarkAndQueueJob({
          url: bookmark.url,
          userId,
          rawMetadata: metadata,
          userAgent: "bookmark-import",
        });

        if (createResult.success) {
          result.imported++;
          result.queued++;
        } else {
          result.errors.push(
            `Failed to create bookmark for ${bookmark.url}: ${createResult.error}`,
          );
        }
      } catch (error) {
        result.errors.push(
          `Error processing bookmark ${bookmark.url}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    logger.info(
      `Imported ${result.imported} bookmarks from file for user ${userId}`,
    );
  } catch (error) {
    logger.error("Error importing bookmark file:", error);
    result.errors.push(
      `Failed to process bookmark file: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return result;
}

/**
 * Re-processes an existing bookmark by using the existing retry logic.
 * This allows users to refresh processing results without knowing about processing jobs.
 */
export async function reprocessBookmark(
  bookmarkId: string,
  userId: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get the existing bookmark to ensure it exists and user has access
    const bookmark = await getBookmarkById(bookmarkId, userId);
    if (!bookmark) {
      return { success: false, error: "Bookmark not found" };
    }

    // 2. Use the existing retry logic with force parameter to properly handle job deduplication
    const { retryAssetProcessing } = await import("./processing-status");
    const result = await retryAssetProcessing(
      "bookmarks",
      bookmarkId,
      userId,
      force,
    );

    if (result.success) {
      logger.info(
        { bookmarkId, userId },
        "Successfully queued bookmark for reprocessing using retry logic",
      );
    } else {
      logger.error(
        { bookmarkId, userId, error: result.error },
        "Failed to reprocess bookmark using retry logic",
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        bookmarkId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error reprocessing bookmark",
    );
    return { success: false, error: "Failed to reprocess bookmark" };
  }
}
