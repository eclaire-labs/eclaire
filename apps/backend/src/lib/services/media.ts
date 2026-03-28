import type { Buffer } from "node:buffer";
import { Readable } from "node:stream";
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
import {
  batchGetTags,
  buildTagFilterCondition,
  getOrCreateTags,
} from "../db-helpers.js";
import { buildSearchRank, buildTextSearchCondition } from "../search.js";

const { media, mediaTags, tags } = schema;

import {
  formatToISO8601,
  generateHistoryId,
  generateMediaId,
} from "@eclaire/core";
import { MEDIA_AUDIO_MIMES } from "../../types/mime-types.js";
import { ForbiddenError, NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import {
  buildCursorCondition,
  type CursorPaginatedResponse,
  encodeCursor,
} from "../pagination.js";
import { getQueueAdapter } from "../queue/index.js";
import { assetPrefix, buildKey, getStorage } from "../storage/index.js";
import { createOrUpdateProcessingJob } from "./processing-status.js";
import {
  type CallerContext,
  callerActorId,
  callerOwnerUserId,
} from "./types.js";

const logger = createChildLogger("services:media");

function isStorageNotFound(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// Backward-compatible re-exports for route files
export {
  NotFoundError as MediaNotFoundError,
  NotFoundError as MediaFileNotFoundError,
  ForbiddenError as MediaForbiddenError,
};

// ============================================================================
// Interfaces
// ============================================================================

export interface Media {
  id: string;
  title: string;
  description: string | null;
  mediaUrl: string;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  waveformUrl: string | null;

  originalFilename: string;
  mimeType: string;
  fileSize: number;

  createdAt: string;
  updatedAt: string;
  dueDate: string | null;

  tags: string[];

  mediaType: "audio" | "video";
  duration: number | null;
  channels: number | null;
  sampleRate: number | null;
  bitrate: number | null;
  codec: string | null;
  language: string | null;

  // Video-specific metadata
  width: number | null;
  height: number | null;
  frameRate: number | null;
  videoCodec: string | null;

  extractedText: string | null;
  contentUrl: string | null;

  processingEnabled: boolean;
  processingStatus: string | null;

  reviewStatus: string;
  flagColor: string | null;
  isPinned: boolean;
}

export interface CreateMediaData {
  content: Buffer;
  metadata: {
    title?: string | null;
    description?: string | null;
    dueDate?: string | null;
    tags?: string[];
    originalFilename?: string | null;
    reviewStatus?: "pending" | "accepted" | "rejected";
    flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
    isPinned?: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: open-ended metadata from upload clients
    [key: string]: any;
  };
  originalMimeType: string;
  userAgent: string;
}

export interface CreateMediaFromUrlData {
  url: string;
  metadata: {
    title?: string | null;
    description?: string | null;
    dueDate?: string | null;
    tags?: string[];
    processingEnabled?: boolean;
  };
  userAgent: string;
}

export interface UpdateMediaParams {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
}

export interface MediaStreamResult {
  stream: ReadableStream<Uint8Array>;
  metadata: { size: number; contentType: string };
  filename: string;
}

// ============================================================================
// Helpers
// ============================================================================

function detectMediaType(mimeType: string): "audio" | "video" {
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  // Fallback: check against known audio MIME list
  if (MEDIA_AUDIO_MIMES.includes(mimeType)) return "audio";
  return "video";
}

async function getMediaTags(mediaId: string): Promise<string[]> {
  try {
    const mediaTagsJoin = await db
      .select({ name: tags.name })
      .from(mediaTags)
      .innerJoin(tags, eq(mediaTags.tagId, tags.id))
      .where(eq(mediaTags.mediaId, mediaId));

    return mediaTagsJoin.map((tag) => tag.name);
  } catch (error) {
    logger.error(
      {
        mediaId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting tags for media",
    );
    return [];
  }
}

function handleServiceError(error: unknown, defaultMessage: string): never {
  if (error instanceof NotFoundError || error instanceof ForbiddenError) {
    throw error;
  }
  logger.error(
    {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    },
    defaultMessage,
  );
  throw new Error(defaultMessage);
}

// ============================================================================
// Internal detail builder
// ============================================================================

async function getMediaWithDetails(mediaId: string, userId: string) {
  const [row] = await db
    .select()
    .from(media)
    .where(and(eq(media.id, mediaId), eq(media.userId, userId)));

  if (!row) {
    throw new NotFoundError("Media");
  }

  const mediaTags = await getMediaTags(mediaId);

  const mediaUrl = `/api/media/${row.id}/original`;
  const thumbnailUrl = row.thumbnailStorageId
    ? `/api/media/${row.id}/thumbnail`
    : null;
  const waveformUrl = row.waveformStorageId
    ? `/api/media/${row.id}/waveform`
    : null;

  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dueDate: row.dueDate ? formatToISO8601(row.dueDate) : null,
    mediaUrl,
    sourceUrl: row.sourceUrl || null,
    thumbnailUrl,
    waveformUrl,
    originalFilename: row.originalFilename || "",
    mimeType: row.mimeType || "",
    fileSize: row.fileSize || 0,
    createdAt: formatToISO8601(row.createdAt),
    updatedAt: formatToISO8601(row.updatedAt),
    tags: mediaTags,

    mediaType: row.mediaType,
    duration: row.duration,
    channels: row.channels,
    sampleRate: row.sampleRate,
    bitrate: row.bitrate,
    codec: row.codec,
    language: row.language,

    width: row.width,
    height: row.height,
    frameRate: row.frameRate,
    videoCodec: row.videoCodec,

    extractedText: row.extractedText,
    contentUrl:
      row.extractedMdStorageId || row.extractedTxtStorageId
        ? `/api/media/${row.id}/content`
        : null,

    processingStatus: row.processingStatus || null,
    reviewStatus: row.reviewStatus || "pending",
    flagColor: row.flagColor,
    isPinned: row.isPinned || false,
    processingEnabled: row.processingEnabled || false,
  };
}

// ============================================================================
// Background Job Queuing
// ============================================================================

async function queueMediaBackgroundJobs(
  mediaData: { id: string; storageId: string },
  userId: string,
  originalMimeType: string,
  originalFilename: string,
): Promise<void> {
  try {
    const queueAdapter = await getQueueAdapter();
    await queueAdapter.enqueueMedia({
      mediaId: mediaData.id,
      storageId: mediaData.storageId,
      mimeType: originalMimeType,
      originalFilename: originalFilename,
      userId: userId,
    });

    logger.info({ mediaId: mediaData.id }, "Enqueued media processing job");
  } catch (error) {
    logger.error(
      {
        mediaId: mediaData.id,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Failed to enqueue media processing job",
    );
  }
}

// ============================================================================
// Core CRUD Functions
// ============================================================================

/**
 * Creates a new media record in the database and stores the file.
 */
export async function createMedia(
  data: CreateMediaData,
  userId: string,
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  const mediaId = generateMediaId();
  const { metadata, content, originalMimeType, userAgent } = data;

  let storageInfo: { storageId: string } | undefined;
  try {
    const verifiedMimeType = originalMimeType;
    const fileSize = content.length;
    const mediaType = detectMediaType(verifiedMimeType);
    const originalFilename =
      metadata.originalFilename ||
      (mediaType === "video" ? "untitled.mp4" : "untitled.mp3");
    const processingEnabled = metadata.processingEnabled !== false;

    const dueDateValue = metadata.dueDate ? new Date(metadata.dueDate) : null;

    // Save file to storage
    const fileExtension = originalFilename.includes(".")
      ? originalFilename.split(".").pop()?.toLowerCase()
      : mediaType === "video"
        ? "mp4"
        : "mp3";

    const storage = getStorage();
    const storageKey = buildKey(
      userId,
      "media",
      mediaId,
      `original.${fileExtension}`,
    );
    await storage.write(
      storageKey,
      Readable.from(content) as unknown as NodeJS.ReadableStream,
      { contentType: verifiedMimeType },
    );

    storageInfo = { storageId: storageKey };

    const historyId = generateHistoryId();
    const tagNames = metadata.tags || [];

    // Strip fields that are already in dedicated columns
    const {
      tags: _tags,
      title: _title,
      description: _desc,
      dueDate: _due,
      processingEnabled: _pe,
      originalFilename: _of,
      reviewStatus: _rs,
      flagColor: _fc,
      isPinned: _ip,
      ...metadataRest
    } = metadata;

    // Atomic transaction: insert media, tags, and history together
    await txManager.withTransaction(async (tx) => {
      await tx.media.insert({
        id: mediaId,
        userId: userId,
        title: metadata.title || originalFilename,
        description: metadata.description || null,
        dueDate: dueDateValue,
        originalFilename: originalFilename,
        storageId: storageKey,
        mimeType: verifiedMimeType,
        fileSize: fileSize,

        mediaType: mediaType,

        // Audio/video metadata (initially null, populated by worker)
        duration: null,
        channels: null,
        sampleRate: null,
        bitrate: null,
        codec: null,
        language: null,

        // Video-specific metadata (initially null, populated by worker)
        width: null,
        height: null,
        frameRate: null,
        videoCodec: null,

        extractedText: null,

        thumbnailStorageId: null,
        waveformStorageId: null,

        rawMetadata: metadataRest,
        originalMimeType: originalMimeType,
        userAgent: userAgent,

        reviewStatus: metadata.reviewStatus || "pending",
        flagColor: metadata.flagColor || null,
        isPinned: metadata.isPinned || false,

        processingEnabled: processingEnabled,
        processingStatus: processingEnabled ? "pending" : null,
      });

      if (tagNames.length > 0) {
        const tagList = await tx.getOrCreateTags(tagNames, userId);
        for (const tag of tagList) {
          await tx.mediaTags.insert({ mediaId, tagId: tag.id });
        }
      }

      await tx.history.insert({
        id: historyId,
        action: "create",
        itemType: "media",
        itemId: mediaId,
        itemName: metadata.title || originalFilename,
        beforeData: null,
        afterData: {
          id: mediaId,
          title: metadata.title,
          originalFilename: originalFilename,
          storageId: storageKey,
          mediaType: mediaType,
          tags: tagNames,
        },
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Initialize processing job status tracking
    if (processingEnabled) {
      const stages: string[] = ["media_processing"];

      await createOrUpdateProcessingJob("media", mediaId, userId, stages).catch(
        (error) => {
          logger.error(
            { mediaId, userId, error: error.message },
            "Failed to initialize processing job for media",
          );
        },
      );
    }

    // Queue background processing
    if (processingEnabled) {
      await queueMediaBackgroundJobs(
        { id: mediaId, storageId: storageKey },
        userId,
        originalMimeType,
        metadata.originalFilename || "untitled.mp3",
      );
      logger.info(
        { mediaId, userId, processingEnabled: true },
        "Queued media background processing jobs",
      );
    } else {
      logger.info(
        { mediaId, userId, processingEnabled: false },
        "Skipped queuing media background processing jobs",
      );
    }

    const newMediaDetails = await getMediaWithDetails(mediaId, userId);
    return newMediaDetails;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating media",
    );
    // Attempt cleanup if storage succeeded but DB failed
    if (storageInfo?.storageId) {
      try {
        const storageForCleanup = getStorage();
        await storageForCleanup.delete(storageInfo.storageId);
      } catch (cleanupError) {
        logger.error(
          {
            cleanupError:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unknown error",
            stack:
              cleanupError instanceof Error ? cleanupError.stack : undefined,
          },
          "Cleanup failed",
        );
      }
    }
    handleServiceError(error, "Failed to create media");
  }
}

/**
 * Creates a new media record from a URL. The actual download and processing
 * happen in the background worker. The record is created with a placeholder
 * storageId that will be updated after download completes.
 */
export async function createMediaFromUrl(
  data: CreateMediaFromUrlData,
  userId: string,
  caller: CallerContext,
) {
  const actorId = callerActorId(caller);
  const mediaId = generateMediaId();
  const { url, metadata, userAgent } = data;
  const processingEnabled = metadata.processingEnabled !== false;

  const dueDateValue = metadata.dueDate ? new Date(metadata.dueDate) : null;
  const tagNames = metadata.tags || [];

  // Use URL hostname + path as a fallback title
  const fallbackTitle = (() => {
    try {
      const parsed = new URL(url);
      return parsed.hostname + parsed.pathname.slice(0, 60);
    } catch {
      return url.slice(0, 60);
    }
  })();

  try {
    const historyId = generateHistoryId();

    await txManager.withTransaction(async (tx) => {
      await tx.media.insert({
        id: mediaId,
        userId,
        title: metadata.title || fallbackTitle,
        description: metadata.description || null,
        dueDate: dueDateValue,
        originalFilename: null,
        sourceUrl: url,
        storageId: `pending://${mediaId}`,
        mimeType: null,
        fileSize: null,
        mediaType: "video", // Default — corrected by worker after download
        duration: null,
        channels: null,
        sampleRate: null,
        bitrate: null,
        codec: null,
        language: null,
        width: null,
        height: null,
        frameRate: null,
        videoCodec: null,
        extractedText: null,
        thumbnailStorageId: null,
        waveformStorageId: null,
        rawMetadata: {},
        originalMimeType: null,
        userAgent,
        reviewStatus: "pending",
        flagColor: null,
        isPinned: false,
        processingEnabled,
        processingStatus: processingEnabled ? "pending" : null,
      });

      if (tagNames.length > 0) {
        const tagList = await tx.getOrCreateTags(tagNames, userId);
        for (const tag of tagList) {
          await tx.mediaTags.insert({ mediaId, tagId: tag.id });
        }
      }

      await tx.history.insert({
        id: historyId,
        action: "create",
        itemType: "media",
        itemId: mediaId,
        itemName: metadata.title || fallbackTitle,
        beforeData: null,
        afterData: {
          id: mediaId,
          title: metadata.title || fallbackTitle,
          sourceUrl: url,
          tags: tagNames,
        },
        actor: caller.actor,
        actorId,
        userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Initialize processing job status tracking
    if (processingEnabled) {
      const stages: string[] = ["media_processing"];
      await createOrUpdateProcessingJob("media", mediaId, userId, stages).catch(
        (error) => {
          logger.error(
            { mediaId, userId, error: error.message },
            "Failed to initialize processing job for URL import",
          );
        },
      );
    }

    // Queue background processing (includes URL download)
    if (processingEnabled) {
      try {
        const queueAdapter = await getQueueAdapter();
        await queueAdapter.enqueueMedia({
          mediaId,
          userId,
          sourceUrl: url,
        });
        logger.info(
          { mediaId, userId, sourceUrl: url },
          "Enqueued media URL import job",
        );
      } catch (error) {
        logger.error(
          {
            mediaId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          "Failed to enqueue media URL import job",
        );
      }
    }

    const newMediaDetails = await getMediaWithDetails(mediaId, userId);
    return newMediaDetails;
  } catch (error) {
    logger.error(
      {
        userId,
        url,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating media from URL",
    );
    handleServiceError(error, "Failed to create media from URL");
  }
}

/**
 * Retrieves a single media item by its ID, ensuring the user is authorized.
 */
export async function getMediaById(mediaId: string, userId: string) {
  try {
    return await getMediaWithDetails(mediaId, userId);
  } catch (error) {
    handleServiceError(error, "Failed to fetch media");
  }
}

/**
 * Updates the user-editable metadata of an existing media item.
 */
export async function updateMedia(
  id: string,
  mediaData: UpdateMediaParams,
  caller: CallerContext,
) {
  const userId = callerOwnerUserId(caller);
  const actorId = callerActorId(caller);
  try {
    const existingMedia = await db.query.media.findFirst({
      where: and(eq(media.id, id), eq(media.userId, userId)),
    });
    if (!existingMedia) throw new NotFoundError("Media");

    const currentMediaTags = await getMediaTags(id);

    const { tags: tagNames, dueDate, ...mediaUpdateData } = mediaData;

    const filteredUpdateData = Object.entries(mediaUpdateData).reduce(
      (acc, [key, value]) => {
        if (value !== undefined) {
          // @ts-expect-error - Trusting the structure for now
          acc[key] = value;
        }
        return acc;
      },
      {} as Partial<typeof media.$inferInsert>,
    );

    if (Object.hasOwn(mediaData, "dueDate")) {
      const dueDateValue = dueDate ? new Date(dueDate) : null;
      filteredUpdateData.dueDate = dueDateValue;
    }

    const historyId = generateHistoryId();

    await txManager.withTransaction(async (tx) => {
      if (
        Object.keys(filteredUpdateData).length > 0 ||
        tagNames !== undefined
      ) {
        await tx.media.update(and(eq(media.id, id), eq(media.userId, userId)), {
          ...filteredUpdateData,
          updatedAt: new Date(),
        });
      }

      if (tagNames !== undefined) {
        await tx.mediaTags.delete(eq(mediaTags.mediaId, id));
        if (tagNames.length > 0) {
          const tagList = await tx.getOrCreateTags(tagNames, userId);
          for (const tag of tagList) {
            await tx.mediaTags.insert({ mediaId: id, tagId: tag.id });
          }
        }
      }

      await tx.history.insert({
        id: historyId,
        action: "update",
        itemType: "media",
        itemId: id,
        itemName: mediaData.title || existingMedia.title,
        beforeData: { ...existingMedia, tags: currentMediaTags },
        afterData: {
          ...existingMedia,
          ...mediaData,
          tags: tagNames ?? currentMediaTags,
        },
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    return getMediaWithDetails(id, userId);
  } catch (error) {
    handleServiceError(error, "Failed to update media metadata");
  }
}

/**
 * Deletes a media record and its storage files.
 */
export async function deleteMedia(
  id: string,
  userId: string,
  caller: CallerContext,
  deleteStorage: boolean = true,
) {
  const actorId = callerActorId(caller);
  try {
    const existingMedia = await db.query.media.findFirst({
      columns: {
        title: true,
        userId: true,
        description: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        mediaType: true,
      },
      where: and(eq(media.id, id), eq(media.userId, userId)),
    });
    if (!existingMedia) throw new NotFoundError("Media");

    const mediaTagsList = await getMediaTags(id);
    const historyId = generateHistoryId();

    await txManager.withTransaction(async (tx) => {
      await tx.mediaTags.delete(eq(mediaTags.mediaId, id));
      await tx.media.delete(and(eq(media.id, id), eq(media.userId, userId)));

      await tx.history.insert({
        id: historyId,
        action: "delete",
        itemType: "media",
        itemId: id,
        itemName: existingMedia.title || "Untitled Media",
        beforeData: { ...existingMedia, tags: mediaTagsList },
        afterData: null,
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Delete queue job outside transaction (non-critical)
    await db.delete(queueJobs).where(eq(queueJobs.key, `media:${id}`));

    if (deleteStorage) {
      try {
        const storageForDelete = getStorage();
        await storageForDelete.deletePrefix(assetPrefix(userId, "media", id));
        logger.info(
          { mediaId: id, userId },
          "Successfully deleted storage for media",
        );
      } catch (storageError) {
        logger.warn(
          {
            mediaId: id,
            storageError:
              storageError instanceof Error
                ? storageError.message
                : "Unknown error",
            stack:
              storageError instanceof Error ? storageError.stack : undefined,
          },
          "DB record deleted, but failed to delete asset folder for media",
        );
      }
    } else {
      logger.info(
        { mediaId: id, userId },
        "Storage deletion skipped for media - deleteStorage flag set to false",
      );
    }

    return { success: true };
  } catch (error) {
    handleServiceError(error, "Failed to delete media");
  }
}

// ============================================================================
// Search and Count Functions
// ============================================================================

export interface FindMediaParams {
  userId: string;
  text?: string;
  tags?: string[];
  mediaType?: "audio" | "video";
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

function _buildMediaQueryConditions({
  userId,
  text,
  mediaType: mediaTypeFilter,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
}: Omit<FindMediaParams, "tags" | "limit">): SQL<unknown>[] {
  const definedConditions: SQL<unknown>[] = [eq(media.userId, userId)];

  if (text?.trim()) {
    definedConditions.push(
      buildTextSearchCondition(text, media.searchVector, [
        media.title,
        media.description,
        media.extractedText,
      ]),
    );
  }

  if (mediaTypeFilter) {
    definedConditions.push(eq(media.mediaType, mediaTypeFilter));
  }

  if (startDate) {
    if (!Number.isNaN(startDate.getTime())) {
      definedConditions.push(gte(media.createdAt, startDate));
    } else {
      logger.warn({ startDate }, "Invalid start date provided for media query");
    }
  }

  if (endDate) {
    if (!Number.isNaN(endDate.getTime())) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      definedConditions.push(lte(media.createdAt, endOfDay));
    } else {
      logger.warn({ endDate }, "Invalid end date provided for media query");
    }
  }

  if (dueDateStart) {
    definedConditions.push(gte(media.dueDate, dueDateStart));
  }

  if (dueDateEnd) {
    definedConditions.push(lte(media.dueDate, dueDateEnd));
  }

  return definedConditions;
}

/**
 * Finds media matching specific criteria with cursor pagination.
 */
export async function findMedia({
  userId,
  text,
  tags: tagsList,
  mediaType: mediaTypeFilter,
  startDate,
  endDate,
  limit = 50,
  cursor,
  sortBy = "createdAt",
  sortDir = "desc",
  dueDateStart,
  dueDateEnd,
}: FindMediaParams) {
  try {
    const conditions = _buildMediaQueryConditions({
      userId,
      text,
      mediaType: mediaTypeFilter,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });

    // Resolve sort column
    const rankExpr = text?.trim()
      ? buildSearchRank(text, media.searchVector)
      : null;
    // biome-ignore lint/suspicious/noExplicitAny: maps sort keys to Drizzle column objects
    const sortColumnMap: Record<string, any> = {
      createdAt: media.createdAt,
      title: media.title,
      duration: media.duration,
      ...(rankExpr ? { relevance: rankExpr } : {}),
    };
    const sortColumn = sortColumnMap[sortBy] || media.createdAt;
    const orderDir = sortDir === "asc" ? asc : desc;

    if (cursor) {
      conditions.push(
        buildCursorCondition(sortColumn, media.id, cursor, sortDir),
      );
    }

    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          mediaTags,
          mediaTags.mediaId,
          mediaTags.tagId,
          tagsList,
          userId,
        ),
      );
    }

    const fetchLimit = limit + 1;
    const isRelevanceSort = sortBy === "relevance" && rankExpr;
    const matchedMedia = await db
      .select({
        id: media.id,
        ...(isRelevanceSort ? { rankScore: rankExpr } : {}),
      })
      .from(media)
      .where(and(...conditions))
      .orderBy(orderDir(sortColumn), orderDir(media.id))
      .limit(fetchLimit);
    let finalMediaIds: string[] = matchedMedia.map((m) => m.id);
    const rankMap = isRelevanceSort
      ? // biome-ignore lint/suspicious/noExplicitAny: rank score type varies by query shape
        new Map(matchedMedia.map((r: any) => [r.id, r.rankScore ?? 0]))
      : null;

    if (finalMediaIds.length === 0)
      return { items: [], nextCursor: null, hasMore: false };

    const hasMore = finalMediaIds.length > limit;
    if (hasMore) finalMediaIds = finalMediaIds.slice(0, limit);

    const entriesList = await db
      .select()
      .from(media)
      .where(inArray(media.id, finalMediaIds))
      .orderBy(orderDir(sortColumn), orderDir(media.id));

    // Batch-load tags (fixes N+1)
    const batchMediaIds = entriesList.map((r) => r.id);
    const tagMap = await batchGetTags(
      mediaTags,
      mediaTags.mediaId,
      mediaTags.tagId,
      batchMediaIds,
    );

    const items = entriesList.map((row) => {
      const mediaUrl = `/api/media/${row.id}/original`;
      const thumbnailUrl = row.thumbnailStorageId
        ? `/api/media/${row.id}/thumbnail`
        : null;
      const waveformUrl = row.waveformStorageId
        ? `/api/media/${row.id}/waveform`
        : null;

      return {
        id: row.id,
        title: row.title,
        description: row.description,
        dueDate: row.dueDate ? formatToISO8601(row.dueDate) : null,
        mediaUrl,
        sourceUrl: row.sourceUrl || null,
        thumbnailUrl,
        waveformUrl,
        originalFilename: row.originalFilename || "",
        mimeType: row.mimeType || "",
        fileSize: row.fileSize || 0,
        createdAt: formatToISO8601(row.createdAt),
        updatedAt: formatToISO8601(row.updatedAt),
        tags: tagMap.get(row.id) ?? [],

        mediaType: row.mediaType,
        duration: row.duration,
        channels: row.channels,
        sampleRate: row.sampleRate,
        bitrate: row.bitrate,
        codec: row.codec,
        language: row.language,

        width: row.width,
        height: row.height,
        frameRate: row.frameRate,
        videoCodec: row.videoCodec,

        extractedText: row.extractedText,
        contentUrl:
          row.extractedMdStorageId || row.extractedTxtStorageId
            ? `/api/media/${row.id}/content`
            : null,

        processingStatus: row.processingStatus || null,
        reviewStatus: row.reviewStatus || "pending",
        flagColor: row.flagColor,
        isPinned: row.isPinned || false,
        processingEnabled: row.processingEnabled || false,
      };
    });

    const lastItem = items[items.length - 1];
    // biome-ignore lint/suspicious/noExplicitAny: sort value type varies
    const getSortVal = (item: any) => {
      if (sortBy === "relevance") return rankMap?.get(item.id) ?? 0;
      if (sortBy === "title") return item.title;
      if (sortBy === "duration") return item.duration;
      return item.createdAt;
    };
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(getSortVal(lastItem), lastItem.id)
        : null;

    return { items, nextCursor, hasMore };
  } catch (error) {
    handleServiceError(error, "Failed to search media");
  }
}

/**
 * Counts media matching specific criteria.
 */
export async function countMedia({
  userId,
  text,
  tags: tagsList,
  mediaType: mediaTypeFilter,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
}: Omit<FindMediaParams, "limit">): Promise<number> {
  try {
    const conditions = _buildMediaQueryConditions({
      userId,
      text,
      mediaType: mediaTypeFilter,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });

    if (tagsList && tagsList.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          mediaTags,
          mediaTags.mediaId,
          mediaTags.tagId,
          tagsList,
          userId,
        ),
      );
    }

    const [result] = await db
      .select({ value: count() })
      .from(media)
      .where(and(...conditions));
    return result?.value ?? 0;
  } catch (error) {
    handleServiceError(error, "Failed to count media");
  }
}

/**
 * Runs findMedia and (on first page only) countMedia in parallel.
 * Returns a cursor-paginated response.
 */
export async function findMediaPaginated(
  params: FindMediaParams,
): Promise<
  CursorPaginatedResponse<
    Awaited<ReturnType<typeof findMedia>>["items"][number]
  >
> {
  const isFirstPage = !params.cursor;

  if (isFirstPage) {
    const [result, totalCount] = await Promise.all([
      findMedia(params),
      countMedia(params),
    ]);
    return { ...result, totalCount };
  }

  return findMedia(params);
}

// ============================================================================
// Stream Functions
// ============================================================================

/**
 * Gets the original media file as a stream.
 */
export async function getMediaStream(
  mediaId: string,
  userId: string,
): Promise<MediaStreamResult> {
  const row = await db.query.media.findFirst({
    columns: {
      id: true,
      userId: true,
      storageId: true,
      mimeType: true,
      originalFilename: true,
    },
    where: and(eq(media.id, mediaId), eq(media.userId, userId)),
  });

  if (!row) {
    throw new NotFoundError("Media");
  }

  if (!row.storageId) {
    throw new NotFoundError("Media original file");
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(row.storageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: row.mimeType || "application/octet-stream",
      },
      filename: row.originalFilename || `${row.id}-original`,
    };
  } catch (error: unknown) {
    if (isStorageNotFound(error)) {
      throw new NotFoundError("Media original file");
    }
    throw error;
  }
}

/**
 * Gets the original media file as a Buffer (for internal use, e.g. transcription).
 */
export async function getMediaBuffer(
  mediaId: string,
  userId: string,
): Promise<{ buffer: Buffer; originalFilename: string; mimeType: string }> {
  const row = await db.query.media.findFirst({
    columns: {
      storageId: true,
      mimeType: true,
      originalFilename: true,
    },
    where: and(eq(media.id, mediaId), eq(media.userId, userId)),
  });

  if (!row) {
    throw new NotFoundError("Media");
  }
  if (!row.storageId) {
    throw new NotFoundError("Media original file");
  }

  const storage = getStorage();
  const { buffer } = await storage.readBuffer(row.storageId);

  return {
    buffer,
    originalFilename: row.originalFilename || "",
    mimeType: row.mimeType || "application/octet-stream",
  };
}

/**
 * Gets the waveform thumbnail as a stream.
 */
export async function getThumbnailStream(
  mediaId: string,
  userId: string,
): Promise<MediaStreamResult> {
  const row = await db.query.media.findFirst({
    columns: {
      thumbnailStorageId: true,
      userId: true,
      originalFilename: true,
    },
    where: and(eq(media.id, mediaId), eq(media.userId, userId)),
  });

  if (!row) {
    throw new NotFoundError("Media");
  }

  if (row.userId !== userId) {
    throw new ForbiddenError("Access denied");
  }

  if (!row.thumbnailStorageId) {
    throw new NotFoundError("Media thumbnail");
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(row.thumbnailStorageId);

    const baseFilename =
      row.originalFilename?.replace(/\.[^/.]+$/, "") || mediaId;

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: "image/png",
      },
      filename: `${baseFilename}-thumbnail.png`,
    };
  } catch (error: unknown) {
    if (isStorageNotFound(error)) {
      throw new NotFoundError("Media thumbnail");
    }
    throw error;
  }
}

/**
 * Gets the AI analysis JSON file as a stream.
 */
export async function getAnalysisStream(
  mediaId: string,
  userId: string,
): Promise<MediaStreamResult> {
  const row = await db.query.media.findFirst({
    columns: { id: true, userId: true },
    where: and(eq(media.id, mediaId), eq(media.userId, userId)),
  });

  if (!row) {
    throw new NotFoundError("Media");
  }

  try {
    const analysisStorageId = `${userId}/media/${mediaId}/extracted.json`;
    const storage = getStorage();
    const { stream, metadata } = await storage.read(analysisStorageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: "application/json",
      },
      filename: `${row.id}-analysis.json`,
    };
  } catch (error: unknown) {
    if (isStorageNotFound(error)) {
      throw new NotFoundError("Media AI analysis");
    }
    throw error;
  }
}

/**
 * Gets the extracted content markdown/text file as a stream.
 */
export async function getContentStream(
  mediaId: string,
  userId: string,
): Promise<MediaStreamResult & { title: string }> {
  const row = await db.query.media.findFirst({
    columns: {
      id: true,
      userId: true,
      title: true,
      extractedMdStorageId: true,
      extractedTxtStorageId: true,
    },
    where: and(eq(media.id, mediaId), eq(media.userId, userId)),
  });

  if (!row) {
    throw new NotFoundError("Media");
  }

  const storageId = row.extractedMdStorageId || row.extractedTxtStorageId;
  if (!storageId) {
    throw new NotFoundError("Media content");
  }

  const mimeType = row.extractedMdStorageId ? "text/markdown" : "text/plain";
  const filename = row.extractedMdStorageId
    ? `${row.title || row.id}-content.md`
    : `${row.title || row.id}-content.txt`;

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(storageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: mimeType,
      },
      filename,
      title: row.title,
    };
  } catch (error: unknown) {
    if (isStorageNotFound(error)) {
      throw new NotFoundError("Media content");
    }
    throw error;
  }
}

// ============================================================================
// Worker / Processing Functions
// ============================================================================

/**
 * Updates the media record with processing results from the worker.
 * This function only updates the actual results/artifacts, not status tracking.
 */
export async function updateMediaArtifacts(
  mediaId: string,
  artifacts: {
    duration?: number | null;
    channels?: number | null;
    sampleRate?: number | null;
    bitrate?: number | null;
    codec?: string | null;
    language?: string | null;
    width?: number | null;
    height?: number | null;
    frameRate?: number | null;
    videoCodec?: string | null;
    extractedText?: string | null;
    description?: string | null;
    tags?: string[];
    thumbnailStorageId?: string;
    waveformStorageId?: string;
    extractedMdStorageId?: string;
    extractedTxtStorageId?: string;
  },
): Promise<boolean> {
  try {
    logger.info({ mediaId, artifacts }, "Updating media artifacts");

    const updatePayload: Partial<typeof media.$inferInsert> = {
      updatedAt: new Date(),
    };

    // Handle audio metadata
    if (artifacts.duration !== undefined) {
      updatePayload.duration = artifacts.duration;
    }
    if (artifacts.channels !== undefined) {
      updatePayload.channels = artifacts.channels;
    }
    if (artifacts.sampleRate !== undefined) {
      updatePayload.sampleRate = artifacts.sampleRate;
    }
    if (artifacts.bitrate !== undefined) {
      updatePayload.bitrate = artifacts.bitrate;
    }
    if (artifacts.codec !== undefined) {
      updatePayload.codec = artifacts.codec;
    }
    if (artifacts.language !== undefined) {
      updatePayload.language = artifacts.language;
    }

    // Handle video metadata
    if (artifacts.width !== undefined) {
      updatePayload.width = artifacts.width;
    }
    if (artifacts.height !== undefined) {
      updatePayload.height = artifacts.height;
    }
    if (artifacts.frameRate !== undefined) {
      updatePayload.frameRate = artifacts.frameRate;
    }
    if (artifacts.videoCodec !== undefined) {
      updatePayload.videoCodec = artifacts.videoCodec;
    }

    // Handle storage artifacts
    if (artifacts.thumbnailStorageId !== undefined) {
      updatePayload.thumbnailStorageId = artifacts.thumbnailStorageId;
    }
    if (artifacts.waveformStorageId !== undefined) {
      updatePayload.waveformStorageId = artifacts.waveformStorageId;
    }
    if (artifacts.extractedMdStorageId !== undefined) {
      updatePayload.extractedMdStorageId = artifacts.extractedMdStorageId;
    }
    if (artifacts.extractedTxtStorageId !== undefined) {
      updatePayload.extractedTxtStorageId = artifacts.extractedTxtStorageId;
    }

    // Handle AI-generated content
    if (artifacts.description !== undefined) {
      updatePayload.description = artifacts.description;
    }
    if (artifacts.extractedText !== undefined) {
      updatePayload.extractedText = artifacts.extractedText;
    }

    // Get or create tags BEFORE transaction if tags are provided
    let tagRecords: { id: string; name: string }[] = [];
    if (artifacts.tags !== undefined && artifacts.tags.length > 0) {
      const row = await db
        .select({ userId: media.userId })
        .from(media)
        .where(eq(media.id, mediaId));

      if (row.length > 0 && row[0]) {
        tagRecords = await getOrCreateTags(artifacts.tags, row[0].userId);
      }
    }

    // Execute transaction
    await txManager.withTransaction(async (tx) => {
      await tx.media.update(eq(media.id, mediaId), updatePayload);

      if (artifacts.tags !== undefined) {
        await tx.mediaTags.delete(eq(mediaTags.mediaId, mediaId));
        if (tagRecords.length > 0) {
          for (const tag of tagRecords) {
            await tx.mediaTags.insert({
              mediaId: mediaId,
              tagId: tag.id,
            });
          }
        }
      }
    });

    logger.info({ mediaId }, "Successfully updated media artifacts");
    return true;
  } catch (error) {
    logger.error(
      {
        mediaId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Database error updating media artifacts",
    );
    throw new Error(`Database error updating media artifacts for ${mediaId}`);
  }
}

/**
 * Re-processes an existing media item by using the existing retry logic.
 */
export async function reprocessMedia(
  mediaId: string,
  userId: string,
  force: boolean = false,
  caller?: CallerContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    const mediaItem = await getMediaById(mediaId, userId);
    if (!mediaItem) {
      return { success: false, error: "Media not found" };
    }

    const { retryAssetProcessing } = await import("./processing-status.js");
    const result = await retryAssetProcessing("media", mediaId, userId, force);

    if (result.success) {
      logger.info(
        { mediaId, userId },
        "Successfully queued media for reprocessing using retry logic",
      );

      if (caller) {
        const { recordHistory } = await import("./history.js");
        await recordHistory({
          action: "update",
          itemType: "media",
          itemId: mediaId,
          itemName: mediaItem.title || undefined,
          beforeData: null,
          afterData: { force },
          actor: caller.actor,
          actorId: callerActorId(caller),
          authorizedByActorId: caller.authorizedByActorId ?? null,
          grantId: caller.grantId ?? null,
          userId: callerOwnerUserId(caller),
          metadata: { trigger: "reprocess" },
        });
      }
    } else {
      logger.error(
        { mediaId, userId, error: result.error },
        "Failed to reprocess media using retry logic",
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        mediaId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error reprocessing media",
    );
    return { success: false, error: "Failed to reprocess media" };
  }
}
