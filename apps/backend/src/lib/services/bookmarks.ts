// lib/services/bookmarks.ts

import {
  formatToISO8601,
  generateBookmarkId,
  generateHistoryId,
} from "@eclaire/core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  type SQL,
} from "drizzle-orm";
import { db, queueJobs, schema, txManager } from "../../db/index.js";

const { bookmarks, bookmarksTags, tags } = schema;

import isUrl from "is-url";
import {
  batchGetTags,
  buildTagFilterCondition,
  getOrCreateTags,
} from "../db-helpers.js";
import {
  buildCursorCondition,
  encodeCursor,
  type CursorPaginatedResponse,
} from "../pagination.js";
import { buildTextSearchCondition } from "../search.js";
import { NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { getQueueAdapter } from "../queue/index.js";
import { createOrUpdateProcessingJob } from "./processing-status.js";
import {
  callerActorId,
  callerOwnerUserId,
  type CallerContext,
} from "./types.js";

const logger = createChildLogger("services:bookmarks");

// --- URL VALIDATION AND NORMALIZATION ---

/**
 * Normalizes a URL by adding https:// protocol if missing.
 */
export function normalizeBookmarkUrl(url: string): string {
  const trimmedUrl = url.trim();

  // If URL already has a protocol, return as-is
  if (trimmedUrl.match(/^https?:\/\//i)) {
    return trimmedUrl;
  }

  // Add https:// prefix for URLs without protocol
  return `https://${trimmedUrl}`;
}

/**
 * Validates and normalizes a bookmark URL.
 * Returns the normalized URL if valid, or an error message if invalid.
 */
export function validateAndNormalizeBookmarkUrl(
  url: string | undefined | null,
): {
  valid: boolean;
  normalizedUrl?: string;
  error?: string;
} {
  if (!url || !url.trim()) {
    return { valid: false, error: "A valid URL is required." };
  }

  const normalizedUrl = normalizeBookmarkUrl(url);
  if (!isUrl(normalizedUrl)) {
    return { valid: false, error: "A valid URL is required." };
  }

  return { valid: true, normalizedUrl };
}

// --- TYPES AND INTERFACES ---

interface CreateBookmarkPayload {
  url: string;
  userId: string;
  // biome-ignore lint/suspicious/noExplicitAny: open-ended metadata from external APIs
  rawMetadata: Record<string, any>;
  userAgent: string;
}

export interface FindBookmarksParams {
  userId: string;
  text?: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  cursor?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  dueDateStart?: Date;
  dueDateEnd?: Date;
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

import { getMimeTypeFromStorageId } from "./mime-utils.js";

const assetTypeToColumnMap = {
  favicon: {
    column: bookmarks.faviconStorageId,
    mime: "image/x-icon",
    dynamicMime: true,
  },
  thumbnail: { column: bookmarks.thumbnailStorageId, mime: "image/webp" },
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
    throw new NotFoundError("Bookmark");
  }

  if (!result.storageId) {
    throw new NotFoundError("Bookmark file");
  }

  // Use dynamic MIME type detection for favicons, static for others
  const mimeType =
    "dynamicMime" in assetInfo && assetInfo.dynamicMime
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
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  try {
    const { url, userId, rawMetadata, userAgent } = payload;

    // Check if background processing is enabled (default true if not specified)
    const processingEnabled = rawMetadata.processingEnabled !== false; // Will be true unless explicitly set to false

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

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Strip fields that are already in dedicated columns from rawMetadata
    const {
      tags: _tags,
      title: _title,
      description: _desc,
      dueDate: _due,
      processingEnabled: _pe,
      url: _url,
      ...metadataRest
    } = rawMetadata;

    // Atomic transaction: insert bookmark, tags, and history together
    await txManager.withTransaction(async (tx) => {
      // Insert bookmark
      await tx.bookmarks.insert({
        id: bookmarkId,
        userId: userId,
        originalUrl: url,
        title: title,
        description: description,
        dueDate: dueDateValue,
        rawMetadata: metadataRest,
        userAgent: userAgent,
        processingEnabled: processingEnabled,
        processingStatus: processingEnabled ? "pending" : null,
      });

      // Insert bookmark-tag relationships
      const tags = rawMetadata.tags;
      if (tags && Array.isArray(tags) && tags.length > 0) {
        const tagList = await tx.getOrCreateTags(tags, userId);
        for (const tag of tagList) {
          await tx.bookmarksTags.insert({ bookmarkId, tagId: tag.id });
        }
      }

      // Record history - atomic with the insert
      await tx.history.insert({
        id: historyId,
        action: "create",
        itemType: "bookmark",
        itemId: bookmarkId,
        itemName: title || url,
        beforeData: null,
        afterData: null,
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Initialize processing job status tracking
    if (processingEnabled) {
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
    if (processingEnabled) {
      try {
        const queueAdapter = await getQueueAdapter();
        await queueAdapter.enqueueBookmark({
          bookmarkId,
          url,
          userId,
        });
        logger.info(
          {
            bookmarkId,
            userId,
            processingEnabled: true,
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
          processingEnabled: false,
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
  caller: CallerContext,
) {
  const userId = callerOwnerUserId(caller);
  const actorId = callerActorId(caller);
  try {
    const existingBookmark = await getBookmarkById(id, userId);
    if (!existingBookmark) throw new NotFoundError("Bookmark");

    const { tags: tagNames, dueDate, ...apiUpdateData } = bookmarkData;

    // Map API fields to database fields
    const dbUpdateData = mapApiRequestToDbFields(apiUpdateData);

    // Handle dueDate conversion if provided
    if (Object.hasOwn(bookmarkData, "dueDate")) {
      const dueDateValue = dueDate ? new Date(dueDate) : null;
      dbUpdateData.dueDate = dueDateValue;
    }

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Atomic transaction: update bookmark, handle tags, and record history together
    await txManager.withTransaction(async (tx) => {
      // Update the bookmark if there are changes
      if (Object.keys(dbUpdateData).length > 0) {
        await tx.bookmarks.update(
          and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)),
          { ...dbUpdateData, updatedAt: new Date() },
        );
      }

      // Handle tags if provided
      if (tagNames !== undefined) {
        await tx.bookmarksTags.delete(eq(bookmarksTags.bookmarkId, id));
        if (tagNames.length > 0) {
          const tagList = await tx.getOrCreateTags(tagNames, userId);
          for (const tag of tagList) {
            await tx.bookmarksTags.insert({ bookmarkId: id, tagId: tag.id });
          }
        }
      }

      // Record history for bookmark update - atomic with the update
      await tx.history.insert({
        id: historyId,
        action: "update",
        itemType: "bookmark",
        itemId: id,
        itemName:
          bookmarkData.title || existingBookmark.title || existingBookmark.url,
        beforeData: existingBookmark,
        afterData: { ...existingBookmark, ...bookmarkData },
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
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
  caller: CallerContext,
  deleteStorage: boolean = true,
) {
  const actorId = callerActorId(caller);
  try {
    const existingBookmark = await getBookmarkById(id, userId);
    if (!existingBookmark) throw new NotFoundError("Bookmark");

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Atomic transaction: delete all DB records and record history together
    await txManager.withTransaction(async (tx) => {
      // Delete bookmark-tag relationships first
      await tx.bookmarksTags.delete(eq(bookmarksTags.bookmarkId, id));

      // Delete the bookmark itself
      await tx.bookmarks.delete(
        and(eq(bookmarks.id, id), eq(bookmarks.userId, userId)),
      );

      // Record history - atomic with the delete
      await tx.history.insert({
        id: historyId,
        action: "delete",
        itemType: "bookmark",
        itemId: id,
        itemName: existingBookmark.title || existingBookmark.url,
        beforeData: existingBookmark,
        afterData: null,
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Delete queue job outside transaction (non-critical, like storage)
    await db.delete(queueJobs).where(eq(queueJobs.key, `bookmarks:${id}`));

    // Delete the entire asset folder if deleteStorage is true
    // (outside transaction - external side-effect)
    if (deleteStorage) {
      try {
        const { getStorage, assetPrefix } = await import("../storage/index.js");
        const storage = getStorage();
        await storage.deletePrefix(assetPrefix(userId, "bookmarks", id));
        logger.info(
          `Successfully deleted storage for bookmark ${id} (user: ${userId})`,
        );
      } catch (storageError: unknown) {
        // Log that storage deletion failed but DB entry is gone.
        logger.warn(
          {
            err: storageError instanceof Error ? storageError : undefined,
            bookmarkId: id,
          },
          `DB record deleted, but failed to delete asset folder for bookmark ${id} (user: ${userId})`,
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
// biome-ignore lint/suspicious/noExplicitAny: raw DB row with variable shape
export function mapBookmarkToApiResponse(dbBookmark: any) {
  const {
    originalUrl,
    normalizedUrl,
    createdAt,
    updatedAt,
    pageLastUpdatedAt,
    dueDate,
    processingStatus,
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
    processingStatus: processingStatus || null,

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
// biome-ignore lint/suspicious/noExplicitAny: dynamic field remapping from API request
export function mapApiRequestToDbFields(apiData: any) {
  const { url, ...rest } = apiData;

  const dbFields = { ...rest };
  if (url) {
    dbFields.originalUrl = url;
    // Note: We don't overwrite normalizedUrl here as it's computed by workers
  }

  return dbFields;
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
        processingEnabled: bookmarks.processingEnabled,
        processingStatus: bookmarks.processingStatus,
      })
      .from(bookmarks)
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
  // biome-ignore lint/suspicious/noExplicitAny: generic artifact record from processors
  artifacts: Record<string, any>, // Use a generic Record type now
): Promise<void> {
  // Changed to void for cleaner try/catch
  try {
    const { tags: tagNames, ...bookmarkUpdateData } = artifacts;

    // Load extractedText from storage if storage ID is provided (not inline in artifacts)
    if (artifacts.extractedTxtStorageId && !artifacts.extractedText) {
      try {
        const { getStorage } = await import("../storage/index.js");
        const storage = getStorage();
        const { buffer } = await storage.readBuffer(
          artifacts.extractedTxtStorageId,
        );
        bookmarkUpdateData.extractedText = buffer.toString("utf-8");
        logger.debug(
          {
            bookmarkId,
            storageId: artifacts.extractedTxtStorageId,
            textLength: bookmarkUpdateData.extractedText.length,
          },
          "Loaded extractedText from storage",
        );
      } catch (storageError) {
        logger.warn(
          {
            bookmarkId,
            storageId: artifacts.extractedTxtStorageId,
            error: storageError,
          },
          "Failed to load extractedText from storage, continuing without it",
        );
      }
    }

    // Get or create tags BEFORE transaction if tags are provided
    let tagList: { id: string; name: string }[] = [];
    if (
      tagNames !== undefined &&
      Array.isArray(tagNames) &&
      tagNames.length > 0
    ) {
      // Find the bookmark's userId for tag scoping
      const bookmarkResult = await db.query.bookmarks.findFirst({
        columns: { userId: true },
        where: eq(bookmarks.id, bookmarkId),
      });

      if (bookmarkResult) {
        tagList = await getOrCreateTags(tagNames, bookmarkResult.userId);
      }
    }

    // Execute transaction
    await txManager.withTransaction(async (tx) => {
      if (Object.keys(bookmarkUpdateData).length > 0) {
        await tx.bookmarks.update(eq(bookmarks.id, bookmarkId), {
          ...bookmarkUpdateData,
          updatedAt: new Date(),
        });
      }

      if (tagNames !== undefined && Array.isArray(tagNames)) {
        // Clear existing tags
        await tx.bookmarksTags.delete(eq(bookmarksTags.bookmarkId, bookmarkId));

        // Insert new tags
        if (tagList.length > 0) {
          for (const tag of tagList) {
            await tx.bookmarksTags.insert({ bookmarkId, tagId: tag.id });
          }
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

function _buildBookmarkQueryConditions({
  userId,
  text,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
}: Omit<FindBookmarksParams, "tags" | "limit">): SQL<unknown>[] {
  const definedConditions: SQL<unknown>[] = [eq(bookmarks.userId, userId)];

  if (text) {
    definedConditions.push(
      buildTextSearchCondition(text, bookmarks.searchVector, [
        bookmarks.title,
        bookmarks.description,
        bookmarks.originalUrl,
        bookmarks.normalizedUrl,
        bookmarks.extractedText,
      ]),
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

export async function findBookmarks({
  userId,
  text,
  tags: tagsList,
  startDate,
  endDate,
  limit = 50,
  cursor,
  sortBy = "createdAt",
  sortDir = "desc",
  dueDateStart,
  dueDateEnd,
}: FindBookmarksParams) {
  try {
    const conditions = _buildBookmarkQueryConditions({
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });

    // Resolve sort column
    // biome-ignore lint/suspicious/noExplicitAny: maps sort keys to Drizzle column objects
    const sortColumnMap: Record<string, any> = {
      createdAt: bookmarks.createdAt,
      title: bookmarks.title,
    };
    const sortColumn = sortColumnMap[sortBy] || bookmarks.createdAt;
    const orderDir = sortDir === "asc" ? asc : desc;

    // Add cursor condition if paginating
    if (cursor) {
      conditions.push(
        buildCursorCondition(sortColumn, bookmarks.id, cursor, sortDir),
      );
    }

    // Add tag filter as a subquery condition (single query, no unbounded ID fetch)
    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          bookmarksTags,
          bookmarksTags.bookmarkId,
          bookmarksTags.tagId,
          tagsList,
          userId,
        ),
      );
    }

    const fetchLimit = limit + 1; // fetch one extra to detect hasMore
    const matched = await db
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(and(...conditions))
      .orderBy(orderDir(sortColumn), orderDir(bookmarks.id))
      .limit(fetchLimit);
    let finalIds: string[] = matched.map((e) => e.id);

    if (finalIds.length === 0)
      return { items: [], nextCursor: null, hasMore: false };

    // Check hasMore before trimming
    const hasMore = finalIds.length > limit;
    if (hasMore) finalIds = finalIds.slice(0, limit);

    // Fetch full data for the final page of IDs
    const entriesList = await db
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
        processingEnabled: bookmarks.processingEnabled,
        processingStatus: bookmarks.processingStatus,
        thumbnailStorageId: bookmarks.thumbnailStorageId,
        faviconStorageId: bookmarks.faviconStorageId,
      })
      .from(bookmarks)
      .where(inArray(bookmarks.id, finalIds))
      .orderBy(orderDir(sortColumn), orderDir(bookmarks.id));

    // Batch-load tags for all entries in one query
    const tagMap = await batchGetTags(
      bookmarksTags,
      bookmarksTags.bookmarkId,
      bookmarksTags.tagId,
      finalIds,
    );

    const items = entriesList.map((entry) => ({
      id: entry.id,
      title: entry.title,
      url: entry.originalUrl,
      description: entry.description,
      date: formatToISO8601(entry.createdAt),
      dueDate: entry.dueDate ? formatToISO8601(entry.dueDate) : null,
      reviewStatus: entry.reviewStatus,
      flagColor: entry.flagColor,
      isPinned: entry.isPinned,
      processingStatus: entry.processingStatus || null,
      thumbnailUrl: entry.thumbnailStorageId
        ? `/api/bookmarks/${entry.id}/thumbnail`
        : null,
      faviconUrl: entry.faviconStorageId
        ? `/api/bookmarks/${entry.id}/favicon`
        : null,
      tags: tagMap.get(entry.id) ?? [],
    }));

    // Build cursor from the last item
    const lastItem = items[items.length - 1];
    // biome-ignore lint/suspicious/noExplicitAny: sort value type varies
    const getSortVal = (item: any) => {
      if (sortBy === "title") return item.title;
      return item.date; // createdAt formatted as ISO string
    };
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(getSortVal(lastItem), lastItem.id)
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

export async function countBookmarks({
  userId,
  text,
  tags: tagsList,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
}: Omit<FindBookmarksParams, "limit">): Promise<number> {
  try {
    const conditions = _buildBookmarkQueryConditions({
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });

    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          bookmarksTags,
          bookmarksTags.bookmarkId,
          bookmarksTags.tagId,
          tagsList,
          userId,
        ),
      );
    }

    const [result] = await db
      .select({ value: count() })
      .from(bookmarks)
      .where(and(...conditions));
    return result?.value ?? 0;
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

/**
 * Runs findBookmarks and (on first page only) countBookmarks in parallel.
 * Returns a cursor-paginated response.
 */
export async function findBookmarksPaginated(
  params: FindBookmarksParams,
): Promise<
  CursorPaginatedResponse<
    Awaited<ReturnType<typeof findBookmarks>>["items"][number]
  >
> {
  const isFirstPage = !params.cursor;

  if (isFirstPage) {
    const [result, totalCount] = await Promise.all([
      findBookmarks(params),
      countBookmarks(params),
    ]);
    return { ...result, totalCount };
  }

  return findBookmarks(params);
}

async function getBookmarkTags(bookmarkId: string): Promise<string[]> {
  const result = await db
    .select({ name: tags.name })
    .from(bookmarksTags)
    .innerJoin(tags, eq(bookmarksTags.tagId, tags.id))
    .where(eq(bookmarksTags.bookmarkId, bookmarkId));
  return result.map((t) => t.name);
}

async function _addTagsToBookmark(
  bookmarkId: string,
  tagNames: string[],
  userId: string,
) {
  if (!tagNames.length) return;
  // Get or create tags (this uses its own transaction)
  const tagList = await getOrCreateTags(tagNames, userId);
  if (tagList.length > 0) {
    await db
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

export interface ChromeBookmarkItem {
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
export function convertChromeTimestamp(timestamp: string): Date {
  const microseconds = parseInt(timestamp, 10);
  // Convert to milliseconds since epoch (Jan 1, 1970)
  const milliseconds = (microseconds - 11644473600000000) / 1000;
  return new Date(milliseconds);
}

/**
 * Recursively extract bookmarks from Chrome folder structure
 */
export function extractBookmarksFromFolder(
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
  // biome-ignore lint/suspicious/noExplicitAny: Chrome/Brave bookmark JSON import data
  bookmarkData: any,
  caller: CallerContext,
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
        const createResult = await createBookmarkAndQueueJob(
          {
            url: bookmark.url,
            userId,
            rawMetadata: metadata,
            userAgent: "bookmark-import",
          },
          caller,
        );

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
    logger.error({ err: error }, "Error importing bookmark file");
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
    const { retryAssetProcessing } = await import("./processing-status.js");
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
