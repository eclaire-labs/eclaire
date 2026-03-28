// lib/services/documents.ts

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
import { fileTypeFromBuffer } from "file-type";
import { db, queueJobs, schema, txManager } from "../../db/index.js";

const { documentsTags, documents: schemaDocuments, tags } = schema;

import {
  formatRequiredTimestamp,
  formatToISO8601,
  generateDocumentId,
  generateHistoryId,
} from "@eclaire/core";
import type { ProcessingStatus } from "../../types/assets.js";
import {
  batchGetTags,
  buildTagFilterCondition,
  getOrCreateTags,
} from "../db-helpers.js";
import { buildTextSearchCondition } from "../search.js";
import {
  buildCursorCondition,
  encodeCursor,
  type CursorPaginatedResponse,
} from "../pagination.js";
import { NotFoundError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { getQueueAdapter } from "../queue/index.js";
import { assetPrefix, buildKey, getStorage } from "../storage/index.js";
import {
  callerActorId,
  callerOwnerUserId,
  type CallerContext,
} from "./types.js";
import { createOrUpdateProcessingJob } from "./processing-status.js";

const logger = createChildLogger("services:documents");

// --- Interfaces ---

interface CreateDocumentData {
  content: Buffer;
  metadata: {
    title?: string;
    description?: string | null;
    dueDate?: string | null;
    tags?: string[];
    originalFilename?: string;
    processingEnabled?: boolean;
    reviewStatus?: "pending" | "accepted" | "rejected";
    flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
    isPinned?: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: open-ended metadata from upload clients
    [key: string]: any;
  };
  originalMimeType: string;
  userAgent: string;
}

interface UpdateDocumentParams {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  tags?: string[];
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
}

interface DocumentDetails {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  fileSize: number | null;
  fileUrl: string | null;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  thumbnailUrl: string | null;
  screenshotUrl: string | null;
  pdfUrl: string | null;
  contentUrl: string | null;
  extractedText: string | null;
  processingStatus: ProcessingStatus | null;
  reviewStatus: "pending" | "accepted" | "rejected";
  flagColor: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned: boolean;
  processingEnabled: boolean;
}

export { NotFoundError };

// --- Params Types ---

export interface FindDocumentsParams {
  userId: string;
  text?: string;
  tags?: string[];
  fileTypes?: string[];
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

// --- Helper Functions ---

async function getDocumentTags(documentId: string): Promise<string[]> {
  try {
    const documentTagsJoin = await db
      .select({ name: tags.name })
      .from(documentsTags)
      .innerJoin(tags, eq(documentsTags.tagId, tags.id))
      .where(eq(documentsTags.documentId, documentId));
    return documentTagsJoin.map((tag) => tag.name);
  } catch (error) {
    logger.error({ err: error, documentId }, "Error getting tags for document");
    return [];
  }
}

async function getDocumentWithDetails(
  documentId: string,
  userId: string,
): Promise<DocumentDetails> {
  const [result] = await db
    .select({
      document: schemaDocuments,
    })
    .from(schemaDocuments)
    .where(
      and(
        eq(schemaDocuments.id, documentId),
        eq(schemaDocuments.userId, userId),
      ),
    );

  if (!result) {
    throw new NotFoundError("Document");
  }

  const document = result.document;

  const documentTagNames = await getDocumentTags(documentId);
  const fileUrl = document.storageId
    ? `/api/documents/${document.id}/file`
    : null;
  const thumbnailUrl = document.thumbnailStorageId
    ? `/api/documents/${document.id}/thumbnail`
    : null;
  const screenshotUrl = document.screenshotStorageId
    ? `/api/documents/${document.id}/screenshot`
    : null;
  const pdfUrl =
    document.pdfStorageId ||
    (document.mimeType === "application/pdf" && document.storageId)
      ? `/api/documents/${document.id}/pdf`
      : null;
  const contentUrl =
    document.extractedMdStorageId || document.extractedTxtStorageId
      ? `/api/documents/${document.id}/content`
      : null;

  return {
    id: document.id,
    title: document.title,
    description: document.description || null,
    dueDate: document.dueDate ? formatToISO8601(document.dueDate) : null,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    fileSize: document.fileSize,
    fileUrl,
    createdAt: formatRequiredTimestamp(document.createdAt),
    updatedAt: formatRequiredTimestamp(document.updatedAt),
    tags: documentTagNames,
    thumbnailUrl,
    screenshotUrl,
    pdfUrl,
    contentUrl,
    extractedText: document.extractedText,
    processingStatus: document.processingStatus || null,
    reviewStatus: document.reviewStatus || "pending",
    flagColor: document.flagColor,
    isPinned: document.isPinned || false,
    processingEnabled: document.processingEnabled || false,
  };
}

function _buildDocumentQueryConditions({
  userId,
  text,
  fileTypes,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
}: Pick<
  FindDocumentsParams,
  | "userId"
  | "text"
  | "fileTypes"
  | "startDate"
  | "endDate"
  | "dueDateStart"
  | "dueDateEnd"
>): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [eq(schemaDocuments.userId, userId)];
  if (text?.trim()) {
    conditions.push(
      buildTextSearchCondition(text, schemaDocuments.searchVector, [
        schemaDocuments.title,
        schemaDocuments.description,
        schemaDocuments.originalFilename,
        schemaDocuments.extractedText,
      ]),
    );
  }
  if (fileTypes && fileTypes.length > 0) {
    conditions.push(inArray(schemaDocuments.mimeType, fileTypes));
  }
  if (startDate) {
    if (!Number.isNaN(startDate.getTime()))
      conditions.push(gte(schemaDocuments.createdAt, startDate));
  }
  if (endDate) {
    if (!Number.isNaN(endDate.getTime()))
      conditions.push(lte(schemaDocuments.createdAt, endDate));
  }
  if (dueDateStart) {
    if (!Number.isNaN(dueDateStart.getTime()))
      conditions.push(gte(schemaDocuments.dueDate, dueDateStart));
  }
  if (dueDateEnd) {
    if (!Number.isNaN(dueDateEnd.getTime()))
      conditions.push(lte(schemaDocuments.dueDate, dueDateEnd));
  }
  return conditions;
}

// --- Exported Service Functions ---

export async function createDocument(
  data: CreateDocumentData,
  userId: string,
  caller: CallerContext,
): Promise<DocumentDetails> {
  const actorId = callerActorId(caller);
  // Generate document ID first so we can use it for storage
  const documentId = generateDocumentId();
  const { metadata, content, originalMimeType, userAgent } = data;
  let storageInfo: { storageId: string } | undefined;

  try {
    const fileTypeResult = await fileTypeFromBuffer(content);
    const verifiedMimeType = fileTypeResult?.mime || originalMimeType;
    const fileSize = content.length;
    const originalFilename = metadata.originalFilename || "untitled";
    const processingEnabled = metadata.processingEnabled !== false;
    const dueDateValue = metadata.dueDate ? new Date(metadata.dueDate) : null;

    // Save the file to storage first using the pre-generated ID
    const fileExtension = originalFilename.includes(".")
      ? originalFilename.split(".").pop()?.toLowerCase()
      : "bin";

    const storage = getStorage();
    const storageKey = buildKey(
      userId,
      "documents",
      documentId,
      `original.${fileExtension}`,
    );
    await storage.write(
      storageKey,
      Readable.from(content) as unknown as NodeJS.ReadableStream,
      {
        contentType: verifiedMimeType,
      },
    );

    storageInfo = { storageId: storageKey };

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Strip fields that are already in dedicated columns from metadata
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

    // Atomic transaction: insert document, tags, and history together
    await txManager.withTransaction(async (tx) => {
      await tx.documents.insert({
        id: documentId,
        userId,
        title: metadata.title || originalFilename,
        description: metadata.description || null,
        dueDate: dueDateValue,
        storageId: storageKey,
        originalFilename,
        mimeType: verifiedMimeType,
        fileSize,
        rawMetadata: metadataRest,
        originalMimeType: originalMimeType,
        userAgent: userAgent,
        processingEnabled: processingEnabled,
        processingStatus: processingEnabled ? "pending" : null,
        reviewStatus: metadata.reviewStatus || "pending",
        flagColor: metadata.flagColor || null,
        isPinned: metadata.isPinned || false,
      });

      // Handle tags inside transaction
      if (metadata.tags && metadata.tags.length > 0) {
        const tagList = await tx.getOrCreateTags(metadata.tags, userId);
        for (const tag of tagList) {
          await tx.documentsTags.insert({ documentId, tagId: tag.id });
        }
      }

      // Record history - atomic with the insert
      await tx.history.insert({
        id: historyId,
        action: "create",
        itemType: "document",
        itemId: documentId,
        itemName: metadata.title || originalFilename,
        beforeData: null,
        afterData: {
          id: documentId,
          title: metadata.title,
          storageId: storageKey,
          originalFilename,
          mimeType: verifiedMimeType,
          tags: metadata.tags,
        },
        actor: caller.actor,
        actorId,
        userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    const newDocumentDetails = await getDocumentWithDetails(documentId, userId);

    if (processingEnabled) {
      await createOrUpdateProcessingJob("documents", documentId, userId, [
        "processing",
      ]);
      try {
        const queueAdapter = await getQueueAdapter();
        await queueAdapter.enqueueDocument({
          documentId,
          userId,
          storageId: storageKey,
          mimeType: verifiedMimeType,
          originalFilename,
        });
        logger.info(
          `Enqueued unified document processing job for document ${documentId}`,
        );
      } catch (error) {
        logger.error(
          {
            documentId,
            error: error instanceof Error ? error.message : "Unknown error",
          },
          `Failed to enqueue document processing job`,
        );
      }
    } else {
      logger.info(
        `Skipped queuing background jobs for document ${documentId} (processingEnabled: false)`,
      );
    }

    return newDocumentDetails;
  } catch (error) {
    logger.error({ err: error, userId }, "Error creating document");
    if (storageInfo?.storageId) {
      logger.warn(
        `Attempting to clean up stored file ${storageInfo.storageId} after DB error.`,
      );
      try {
        const storageForCleanup = getStorage();
        await storageForCleanup.delete(storageInfo.storageId);
      } catch (cleanupError) {
        logger.error({ err: cleanupError }, "Document file cleanup failed");
      }
    }
    throw new Error("Failed to create document");
  }
}

export async function updateDocument(
  id: string,
  documentData: UpdateDocumentParams,
  caller: CallerContext,
): Promise<DocumentDetails> {
  const userId = callerOwnerUserId(caller);
  const actorId = callerActorId(caller);
  try {
    const existingDocument = await db.query.documents.findFirst({
      columns: { title: true, description: true },
      where: and(
        eq(schemaDocuments.id, id),
        eq(schemaDocuments.userId, userId),
      ),
    });
    if (!existingDocument) {
      throw new NotFoundError("Document");
    }

    const { tags: tagNames, dueDate, ...docUpdateData } = documentData;
    const updatePayload: Partial<typeof schemaDocuments.$inferInsert> = {};

    // Filter out undefined values to avoid overwriting with them
    Object.entries(docUpdateData).forEach(([key, value]) => {
      if (value !== undefined) {
        // biome-ignore lint/suspicious/noExplicitAny: dynamic property assignment on Drizzle partial insert type
        (updatePayload as any)[key] = value;
      }
    });

    if (Object.hasOwn(documentData, "dueDate")) {
      updatePayload.dueDate = dueDate ? new Date(dueDate) : null;
    }

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Atomic transaction: update document, handle tags, and record history together
    await txManager.withTransaction(async (tx) => {
      // Update the document if there are changes
      if (Object.keys(updatePayload).length > 0 || tagNames !== undefined) {
        await tx.documents.update(
          and(eq(schemaDocuments.id, id), eq(schemaDocuments.userId, userId)),
          { ...updatePayload, updatedAt: new Date() },
        );
      }

      // Handle tags if provided
      if (tagNames !== undefined) {
        await tx.documentsTags.delete(eq(documentsTags.documentId, id));
        if (tagNames.length > 0) {
          const tagList = await tx.getOrCreateTags(tagNames, userId);
          for (const tag of tagList) {
            await tx.documentsTags.insert({ documentId: id, tagId: tag.id });
          }
        }
      }

      // Record history for document update - atomic with the update
      await tx.history.insert({
        id: historyId,
        action: "update",
        itemType: "document",
        itemId: id,
        itemName: documentData.title || existingDocument.title,
        beforeData: existingDocument,
        afterData: { ...existingDocument, ...documentData },
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    return getDocumentWithDetails(id, userId);
  } catch (error) {
    logger.error({ err: error, documentId: id }, "Error updating document");
    if (error instanceof NotFoundError) throw error;
    throw new Error("Failed to update document metadata");
  }
}

export async function deleteDocument(
  id: string,
  userId: string,
  caller: CallerContext,
  deleteStorage: boolean = true,
): Promise<{ success: boolean }> {
  const actorId = callerActorId(caller);
  try {
    const existingDocument = await db.query.documents.findFirst({
      where: and(
        eq(schemaDocuments.id, id),
        eq(schemaDocuments.userId, userId),
      ),
    });
    if (!existingDocument) {
      logger.warn(
        { documentId: id, userId },
        "Document record not found during deletion attempt",
      );
      return { success: true };
    }

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    await txManager.withTransaction(async (tx) => {
      await tx.documentsTags.delete(eq(documentsTags.documentId, id));
      await tx.documents.delete(
        and(eq(schemaDocuments.id, id), eq(schemaDocuments.userId, userId)),
      );

      // Record history for document deletion - atomic with the delete
      await tx.history.insert({
        id: historyId,
        action: "delete",
        itemType: "document",
        itemId: id,
        itemName: existingDocument.title,
        beforeData: existingDocument,
        afterData: null,
        actor: caller.actor,
        actorId,
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Delete queue job outside transaction (non-critical, like storage)
    await db.delete(queueJobs).where(eq(queueJobs.key, `documents:${id}`));

    if (deleteStorage) {
      const storageForDelete = getStorage();
      await storageForDelete
        .deletePrefix(assetPrefix(userId, "documents", id))
        .catch((storageError: unknown) => {
          logger.warn(
            {
              documentId: id,
              storageError:
                storageError instanceof Error
                  ? storageError.message
                  : String(storageError),
            },
            "DB record deleted, but failed to delete asset folder",
          );
        });
    }

    return { success: true };
  } catch (error) {
    logger.error({ err: error, documentId: id }, "Error deleting document");
    throw new Error("Failed to delete document");
  }
}

export async function getDocumentById(
  documentId: string,
  userId: string,
): Promise<DocumentDetails> {
  try {
    return await getDocumentWithDetails(documentId, userId);
  } catch (error) {
    if (error instanceof NotFoundError) throw error;
    logger.error({ err: error, documentId }, "Error getting document by ID");
    throw new Error("Failed to fetch document");
  }
}

export async function findDocuments({
  userId,
  text,
  tags: filterTags,
  fileTypes,
  startDate,
  endDate,
  limit = 50,
  cursor,
  sortBy = "createdAt",
  sortDir = "desc",
  dueDateStart,
  dueDateEnd,
}: FindDocumentsParams) {
  try {
    const conditions = _buildDocumentQueryConditions({
      userId,
      text,
      fileTypes,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });
    // biome-ignore lint/suspicious/noExplicitAny: maps sort keys to Drizzle column objects of varying types
    const sortColumnMap: Record<string, any> = {
      createdAt: schemaDocuments.createdAt,
      updatedAt: schemaDocuments.updatedAt,
      title: schemaDocuments.title,
      mimeType: schemaDocuments.mimeType,
      fileSize: schemaDocuments.fileSize,
      originalFilename: schemaDocuments.originalFilename,
    };
    const sortColumn = sortColumnMap[sortBy] || schemaDocuments.createdAt;
    const orderDir = sortDir === "asc" ? asc : desc;

    // Add cursor condition if paginating
    if (cursor) {
      conditions.push(
        buildCursorCondition(sortColumn, schemaDocuments.id, cursor, sortDir),
      );
    }

    // Add tag filter as a subquery condition
    if (filterTags && filterTags.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          documentsTags,
          documentsTags.documentId,
          documentsTags.tagId,
          filterTags,
          userId,
        ),
      );
    }

    const fetchLimit = limit + 1; // fetch one extra to detect hasMore
    const matchedDocs = await db
      .select({ id: schemaDocuments.id })
      .from(schemaDocuments)
      .where(and(...conditions))
      .orderBy(orderDir(sortColumn), orderDir(schemaDocuments.id))
      .limit(fetchLimit);
    let finalDocIds: string[] = matchedDocs.map((d) => d.id);

    if (finalDocIds.length === 0)
      return { items: [], nextCursor: null, hasMore: false };

    // Check hasMore before trimming
    const hasMore = finalDocIds.length > limit;
    if (hasMore) finalDocIds = finalDocIds.slice(0, limit);

    // Efficiently fetch all documents in a single query
    const documentsWithStatus = await db
      .select({
        document: schemaDocuments,
      })
      .from(schemaDocuments)
      .where(inArray(schemaDocuments.id, finalDocIds))
      .orderBy(orderDir(sortColumn), orderDir(schemaDocuments.id));

    // Batch-load tags for all documents in a single query
    const docIds = documentsWithStatus.map((r) => r.document.id);
    const tagMap = await batchGetTags(
      documentsTags,
      documentsTags.documentId,
      documentsTags.tagId,
      docIds,
    );

    const items = documentsWithStatus.map((result) => {
      const document = result.document;

      const fileUrl = document.storageId
        ? `/api/documents/${document.id}/file`
        : null;
      const thumbnailUrl = document.thumbnailStorageId
        ? `/api/documents/${document.id}/thumbnail`
        : null;
      const screenshotUrl = document.screenshotStorageId
        ? `/api/documents/${document.id}/screenshot`
        : null;
      const pdfUrl =
        document.pdfStorageId ||
        (document.mimeType === "application/pdf" && document.storageId)
          ? `/api/documents/${document.id}/pdf`
          : null;
      const contentUrl =
        document.extractedMdStorageId || document.extractedTxtStorageId
          ? `/api/documents/${document.id}/content`
          : null;

      return {
        id: document.id,
        title: document.title,
        description: document.description || null,
        dueDate: document.dueDate ? formatToISO8601(document.dueDate) : null,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        fileSize: document.fileSize,
        fileUrl,
        createdAt: formatRequiredTimestamp(document.createdAt),
        updatedAt: formatRequiredTimestamp(document.updatedAt),
        tags: tagMap.get(document.id) ?? [],
        thumbnailUrl,
        screenshotUrl,
        pdfUrl,
        contentUrl,
        extractedText: document.extractedText,
        processingStatus: document.processingStatus || null,
        reviewStatus: document.reviewStatus || "pending",
        flagColor: document.flagColor,
        isPinned: document.isPinned || false,
        processingEnabled: document.processingEnabled || false,
      };
    });

    // Build cursor from the last item
    const lastItem = items[items.length - 1];
    // biome-ignore lint/suspicious/noExplicitAny: sort value type varies
    const getSortVal = (item: any) => {
      if (sortBy === "title") return item.title;
      if (sortBy === "updatedAt") return item.updatedAt;
      if (sortBy === "mimeType") return item.mimeType;
      if (sortBy === "fileSize") return item.fileSize;
      if (sortBy === "originalFilename") return item.originalFilename;
      return item.createdAt; // default
    };
    const nextCursor =
      hasMore && lastItem
        ? encodeCursor(getSortVal(lastItem), lastItem.id)
        : null;

    return { items, nextCursor, hasMore };
  } catch (error) {
    logger.error({ err: error, userId }, "Error searching documents");
    throw new Error("Failed to search documents");
  }
}

export async function countDocuments({
  userId,
  text,
  tags: filterTags,
  fileTypes,
  startDate,
  endDate,
  dueDateStart,
  dueDateEnd,
}: Omit<FindDocumentsParams, "limit">): Promise<number> {
  try {
    const conditions = _buildDocumentQueryConditions({
      userId,
      text,
      fileTypes,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    });
    if (filterTags && filterTags.length > 0) {
      conditions.push(
        buildTagFilterCondition(
          documentsTags,
          documentsTags.documentId,
          documentsTags.tagId,
          filterTags,
          userId,
        ),
      );
    }
    const [result] = await db
      .select({ value: count() })
      .from(schemaDocuments)
      .where(and(...conditions));
    return result?.value ?? 0;
  } catch (error) {
    logger.error({ err: error, userId }, "Error counting documents");
    throw new Error("Failed to count documents");
  }
}

/**
 * Runs findDocuments and (on first page only) countDocuments in parallel.
 * Returns a cursor-paginated response.
 */
export async function findDocumentsPaginated(
  params: FindDocumentsParams,
): Promise<
  CursorPaginatedResponse<
    Awaited<ReturnType<typeof findDocuments>>["items"][number]
  >
> {
  const isFirstPage = !params.cursor;

  if (isFirstPage) {
    const [result, totalCount] = await Promise.all([
      findDocuments(params),
      countDocuments(params),
    ]);
    return { ...result, totalCount };
  }

  return findDocuments(params);
}

export async function updateDocumentArtifacts(
  documentId: string,
  artifacts: {
    title?: string | null;
    description?: string | null;
    tags?: string[];
    // extractedText is loaded from storage, not passed inline
    extractedMdStorageId?: string;
    extractedTxtStorageId?: string;
    pdfStorageId?: string;
    thumbnailStorageId?: string;
    screenshotStorageId?: string;
  },
): Promise<void> {
  try {
    logger.info({ documentId }, "Saving final artifacts for document");

    // Load extractedText from storage if storage ID is provided
    let extractedText: string | null = null;
    if (artifacts.extractedTxtStorageId) {
      try {
        const storage = getStorage();
        const { buffer } = await storage.readBuffer(
          artifacts.extractedTxtStorageId,
        );
        extractedText = buffer.toString("utf-8");
        logger.debug(
          {
            documentId,
            storageId: artifacts.extractedTxtStorageId,
            textLength: extractedText.length,
          },
          "Loaded extractedText from storage",
        );
      } catch (storageError) {
        logger.warn(
          {
            documentId,
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
      artifacts.tags &&
      Array.isArray(artifacts.tags) &&
      artifacts.tags.length > 0
    ) {
      const document = await db.query.documents.findFirst({
        columns: { userId: true },
        where: eq(schemaDocuments.id, documentId),
      });
      if (!document)
        throw new Error("Could not find document to associate tags with.");
      tagList = await getOrCreateTags(artifacts.tags, document.userId);
    }

    await txManager.withTransaction(async (tx) => {
      const updatePayload: Partial<typeof schemaDocuments.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (artifacts.title) updatePayload.title = artifacts.title;
      if (artifacts.description)
        updatePayload.description = artifacts.description;
      if (extractedText) updatePayload.extractedText = extractedText;
      if (artifacts.extractedMdStorageId)
        updatePayload.extractedMdStorageId = artifacts.extractedMdStorageId;
      if (artifacts.extractedTxtStorageId)
        updatePayload.extractedTxtStorageId = artifacts.extractedTxtStorageId;
      if (artifacts.pdfStorageId)
        updatePayload.pdfStorageId = artifacts.pdfStorageId;
      if (artifacts.thumbnailStorageId)
        updatePayload.thumbnailStorageId = artifacts.thumbnailStorageId;
      if (artifacts.screenshotStorageId)
        updatePayload.screenshotStorageId = artifacts.screenshotStorageId;

      await tx.documents.update(
        eq(schemaDocuments.id, documentId),
        updatePayload,
      );

      if (artifacts.tags && Array.isArray(artifacts.tags)) {
        // Clear existing tags
        await tx.documentsTags.delete(eq(documentsTags.documentId, documentId));

        // Insert new tags
        if (tagList.length > 0) {
          for (const tag of tagList) {
            await tx.documentsTags.insert({ documentId, tagId: tag.id });
          }
        }
      }
    });
    logger.info(
      { documentId },
      "Successfully saved all artifacts for document",
    );
  } catch (error) {
    logger.error(
      {
        documentId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      "Database error saving document artifacts",
    );
    throw error;
  }
}

export async function getDocumentAsset(
  documentId: string,
  userId: string,
  assetType:
    | "original"
    | "thumbnail"
    | "screenshot"
    | "pdf"
    | "content"
    | "extracted-md"
    | "extracted-txt",
) {
  const document = await db.query.documents.findFirst({
    where: and(
      eq(schemaDocuments.id, documentId),
      eq(schemaDocuments.userId, userId),
    ),
  });

  if (!document) {
    throw new NotFoundError("Document");
  }

  let storageId: string | null = null;
  let mimeType: string = "application/octet-stream";
  let filename: string = document.originalFilename || `${document.id}`;

  switch (assetType) {
    case "original":
      storageId = document.storageId;
      mimeType = document.mimeType || "application/octet-stream";
      break;
    case "thumbnail":
      storageId = document.thumbnailStorageId;
      mimeType = "image/webp";
      filename = `${document.id}-thumbnail.webp`;
      break;
    case "screenshot":
      storageId = document.screenshotStorageId;
      mimeType = "image/jpeg";
      filename = `${document.id}-screenshot.jpg`;
      break;
    case "pdf":
      storageId = document.pdfStorageId;
      // Native PDFs (uploaded as PDF) won't have a separate pdfStorageId —
      // fall back to the original file so /pdf serves them consistently.
      if (!storageId && document.mimeType === "application/pdf") {
        storageId = document.storageId;
      }
      mimeType = "application/pdf";
      filename = `${document.id}.pdf`;
      break;
    case "content":
    case "extracted-md":
      storageId =
        document.extractedMdStorageId || document.extractedTxtStorageId;
      mimeType = document.extractedMdStorageId ? "text/markdown" : "text/plain";
      filename = document.extractedMdStorageId
        ? `${document.id}-extracted.md`
        : `${document.id}-extracted.txt`;
      break;
    case "extracted-txt":
      storageId = document.extractedTxtStorageId;
      mimeType = "text/plain";
      filename = `${document.id}-extracted.txt`;
      break;
  }

  if (!storageId) {
    throw new NotFoundError(`Document asset (${assetType})`);
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(storageId);
    return { stream, contentLength: metadata.size, mimeType, filename };
  } catch (error: unknown) {
    // If the file is missing from storage (e.g., deleted manually or processing failed)
    if (
      error instanceof Error &&
      (("code" in error &&
        (error as NodeJS.ErrnoException).code === "ENOENT") ||
        error.name === "StorageNotFoundError")
    ) {
      logger.warn(
        `Storage file not found for document ${documentId}, asset ${assetType}, storageId ${storageId}`,
      );
      throw new NotFoundError("Document asset file");
    }
    // Re-throw other, unexpected storage errors
    throw error;
  }
}

/**
 * Re-processes an existing document by using the existing retry logic.
 * This allows users to refresh processing results without knowing about processing jobs.
 */
export async function reprocessDocument(
  documentId: string,
  userId: string,
  force: boolean = false,
  caller?: CallerContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get the existing document to ensure it exists and user has access
    const document = await getDocumentById(documentId, userId);
    if (!document) {
      return { success: false, error: "Document not found" };
    }

    // 2. Use the existing retry logic with force parameter to properly handle job deduplication
    const { retryAssetProcessing } = await import("./processing-status.js");
    const result = await retryAssetProcessing(
      "documents",
      documentId,
      userId,
      force,
    );

    if (result.success) {
      logger.info(
        { documentId, userId },
        "Successfully queued document for reprocessing using retry logic",
      );

      if (caller) {
        const { recordHistory } = await import("./history.js");
        await recordHistory({
          action: "update",
          itemType: "document",
          itemId: documentId,
          itemName: document.title || undefined,
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
        { documentId, userId, error: result.error },
        "Failed to reprocess document using retry logic",
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        documentId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error reprocessing document",
    );
    return { success: false, error: "Failed to reprocess document" };
  }
}
