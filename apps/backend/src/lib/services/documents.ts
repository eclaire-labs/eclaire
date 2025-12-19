// lib/services/documents.ts

import type { Buffer } from "buffer";
import {
  and,
  asc,
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
import { fileTypeFromBuffer } from "file-type";
import { Readable } from "stream";
import { db, txManager, schema, queueJobs } from "../../db/index.js";

const {
  documentsTags,
  documents: schemaDocuments,
  tags,
} = schema;
import { formatToISO8601, formatRequiredTimestamp, getOrCreateTags } from "../db-helpers.js";
import { getQueue, QueueNames, getQueueAdapter } from "../queue/index.js";
import { objectStorage, type StorageInfo } from "../storage.js";
import type { ProcessingStatus } from "../../types/assets.js";
import { generateDocumentId, generateHistoryId } from "@eclaire/core";
import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js";
import { createOrUpdateProcessingJob } from "./processing-status.js";

const logger = createChildLogger("services:documents");

// --- Interfaces ---

interface CreateDocumentData {
  content: Buffer;
  metadata: {
    title?: string;
    description?: string;
    dueDate?: string;
    tags?: string[];
    originalFilename?: string;
    enabled?: boolean;
    reviewStatus?: "pending" | "accepted" | "rejected";
    flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
    isPinned?: boolean;
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
  enabled: boolean;
}

class NotFoundError extends Error {
  public code = "NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
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

async function addTagsToDocument(
  documentId: string,
  tagNames: string[],
  userId: string,
) {
  if (!tagNames || tagNames.length === 0) return;
  try {
    // Get or create tags (this uses its own transaction)
    const tagRecords = await getOrCreateTags(tagNames, userId);
    if (tagRecords.length > 0) {
      await db
        .insert(documentsTags)
        .values(
          tagRecords.map((tag) => ({ documentId: documentId, tagId: tag.id })),
        )
        .onConflictDoNothing();
    }
  } catch (error) {
    logger.error({ err: error, documentId }, "Error adding tags to document");
    throw new Error("Failed to add tags to document");
  }
}

async function getDocumentWithDetails(
  documentId: string,
  userId: string,
): Promise<DocumentDetails> {
  const [result] = await db
    .select({
      document: schemaDocuments,
      status: queueJobs.status,
    })
    .from(schemaDocuments)
    .leftJoin(
      queueJobs,
      eq(queueJobs.key, sql`'documents:' || ${schemaDocuments.id}`),
    )
    .where(
      and(
        eq(schemaDocuments.id, documentId),
        eq(schemaDocuments.userId, userId),
      ),
    );

  if (!result) {
    const error = new Error("Document not found");
    (error as any).code = "NOT_FOUND";
    throw error;
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
  const pdfUrl = document.pdfStorageId
    ? `/api/documents/${document.id}/pdf`
    : null;
  const contentUrl = document.extractedMdStorageId
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
    processingStatus:
      result.status && typeof result.status === "string" ? result.status : null,
    reviewStatus: document.reviewStatus || "pending",
    flagColor: document.flagColor,
    isPinned: document.isPinned || false,
    enabled: document.enabled || false,
  };
}

function _buildDocumentQueryConditions(
  userId: string,
  text?: string,
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [eq(schemaDocuments.userId, userId)];
  if (text?.trim()) {
    const searchTerm = `%${text.trim()}%`;
    conditions.push(
      or(
        like(schemaDocuments.title, searchTerm),
        like(schemaDocuments.description, searchTerm),
        like(schemaDocuments.originalFilename, searchTerm),
      ) as SQL<unknown>,
    );
  }
  if (startDate) {
    if (!isNaN(startDate.getTime()))
      conditions.push(gte(schemaDocuments.createdAt, startDate));
  }
  if (endDate) {
    if (!isNaN(endDate.getTime()))
      conditions.push(lte(schemaDocuments.createdAt, endDate));
  }
  if (dueDateStart) {
    if (!isNaN(dueDateStart.getTime()))
      conditions.push(gte(schemaDocuments.dueDate, dueDateStart));
  }
  if (dueDateEnd) {
    if (!isNaN(dueDateEnd.getTime()))
      conditions.push(lte(schemaDocuments.dueDate, dueDateEnd));
  }
  return conditions;
}

// --- Exported Service Functions ---

export async function createDocument(
  data: CreateDocumentData,
  userId: string,
): Promise<DocumentDetails> {
  // Generate document ID first so we can use it for storage
  const documentId = generateDocumentId();
  const { metadata, content, originalMimeType, userAgent } = data;
  let storageInfo: StorageInfo | undefined;

  try {
    const fileTypeResult = await fileTypeFromBuffer(content);
    const verifiedMimeType = fileTypeResult?.mime || originalMimeType;
    const fileSize = content.length;
    const originalFilename = metadata.originalFilename || "untitled";
    const enabled = metadata.enabled !== false;
    const dueDateValue = metadata.dueDate ? new Date(metadata.dueDate) : null;

    // Save the file to storage first using the pre-generated ID
    const fileExtension = originalFilename.includes(".")
      ? originalFilename.split(".").pop()?.toLowerCase()
      : "bin";

    const assetResult = await objectStorage.saveAsset({
      userId,
      assetType: "documents",
      assetId: documentId,
      fileName: `original.${fileExtension}`,
      fileStream: Readable.from(content),
      contentType: verifiedMimeType,
    });

    // Create storageInfo for backward compatibility
    storageInfo = { storageId: assetResult.storageId };

    // Now create the document record with the actual storage ID in a single operation
    const [newDocument] = await db
      .insert(schemaDocuments)
      .values({
        id: documentId, // Use the pre-generated ID
        userId,
        title: metadata.title || originalFilename,
        description: metadata.description || null,
        dueDate: dueDateValue,
        storageId: assetResult.storageId, // Use the actual storage ID from the save operation
        originalFilename,
        mimeType: verifiedMimeType,
        fileSize,
        rawMetadata: metadata,
        originalMimeType: originalMimeType,
        userAgent: userAgent,
        enabled,
        reviewStatus: metadata.reviewStatus || "pending",
        flagColor: metadata.flagColor || null,
        isPinned: metadata.isPinned || false,
        // createdAt and updatedAt are handled by schema defaults
      })
      .returning();

    if (metadata.tags && metadata.tags.length > 0) {
      await addTagsToDocument(documentId, metadata.tags, userId);
    }

    await recordHistory({
      action: "create",
      itemType: "document",
      itemId: documentId,
      itemName: metadata.title || originalFilename,
      afterData: {
        id: documentId,
        title: metadata.title,
        storageId: storageInfo.storageId,
        originalFilename,
        mimeType: verifiedMimeType,
        tags: metadata.tags,
      },
      actor: "user",
      userId,
    }).catch((err) =>
      logger.error({ err }, "Failed to record history for document creation"),
    );

    const newDocumentDetails = await getDocumentWithDetails(documentId, userId);

    if (enabled) {
      await createOrUpdateProcessingJob("documents", documentId, userId, [
        "processing",
      ]);
      try {
        const queueAdapter = await getQueueAdapter();
        await queueAdapter.enqueueDocument({
          documentId,
          userId,
          storageId: newDocument?.storageId || undefined,
          mimeType: newDocument?.mimeType || undefined,
          originalFilename: newDocument?.originalFilename || undefined,
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
        `Skipped queuing background jobs for document ${documentId} (enabled: false)`,
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
        await objectStorage.delete(storageInfo.storageId);
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
  userId: string,
): Promise<DocumentDetails> {
  try {
    const existingDocument = await db.query.documents.findFirst({
      columns: { title: true, description: true },
      where: and(
        eq(schemaDocuments.id, id),
        eq(schemaDocuments.userId, userId),
      ),
    });
    if (!existingDocument) {
      const error = new Error("Document not found");
      (error as any).code = "NOT_FOUND";
      throw error;
    }

    const { tags: tagNames, dueDate, ...docUpdateData } = documentData;
    const updatePayload: Partial<typeof schemaDocuments.$inferInsert> = {};

    // Filter out undefined values to avoid overwriting with them
    Object.entries(docUpdateData).forEach(([key, value]) => {
      if (value !== undefined) {
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
        actor: "user",
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    return getDocumentWithDetails(id, userId);
  } catch (error) {
    logger.error({ err: error, documentId: id }, "Error updating document");
    if (error instanceof Error && (error as any).code === "NOT_FOUND")
      throw error;
    throw new Error("Failed to update document metadata");
  }
}

export async function deleteDocument(
  id: string,
  userId: string,
  deleteStorage: boolean = true,
): Promise<{ success: boolean }> {
  try {
    const existingDocument = await db.query.documents.findFirst({
      where: and(
        eq(schemaDocuments.id, id),
        eq(schemaDocuments.userId, userId),
      ),
    });
    if (!existingDocument) {
      logger.warn({ documentId: id, userId }, "Document record not found during deletion attempt");
      return { success: true };
    }

    await txManager.withTransaction(async (tx) => {
      await tx.documentsTags.delete(eq(documentsTags.documentId, id));
      await tx.documents.delete(
        and(eq(schemaDocuments.id, id), eq(schemaDocuments.userId, userId)),
      );
    });

    // Delete queue job outside transaction (non-critical, like storage)
    await db.delete(queueJobs).where(eq(queueJobs.key, `documents:${id}`));

    if (deleteStorage) {
      await objectStorage
        .deleteAsset(userId, "documents", id)
        .catch((storageError: any) => {
          logger.warn(
            { documentId: id, storageError: storageError.message || storageError },
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

export async function getAllDocuments(
  userId: string,
): Promise<DocumentDetails[]> {
  try {
    const documentsList = await db
      .select({
        document: schemaDocuments,
        status: queueJobs.status,
      })
      .from(schemaDocuments)
      .leftJoin(
        queueJobs,
        eq(queueJobs.key, sql`'documents:' || ${schemaDocuments.id}`),
      )
      .where(eq(schemaDocuments.userId, userId))
      .orderBy(desc(schemaDocuments.createdAt));

    // Process documents with tags in parallel
    const results = await Promise.all(
      documentsList.map(async (result) => {
        const document = result.document;
        const documentTagNames = await getDocumentTags(document.id);

        const fileUrl = document.storageId
          ? `/api/documents/${document.id}/file`
          : null;
        const thumbnailUrl = document.thumbnailStorageId
          ? `/api/documents/${document.id}/thumbnail`
          : null;
        const screenshotUrl = document.screenshotStorageId
          ? `/api/documents/${document.id}/screenshot`
          : null;
        const pdfUrl = document.pdfStorageId
          ? `/api/documents/${document.id}/pdf`
          : null;
        const contentUrl = document.extractedMdStorageId
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
          processingStatus:
      result.status && typeof result.status === "string" ? result.status : null,
          reviewStatus: document.reviewStatus || "pending",
          flagColor: document.flagColor,
          isPinned: document.isPinned || false,
          enabled: document.enabled || false,
        };
      }),
    );
    return results;
  } catch (error) {
    logger.error({ err: error, userId }, "Error getting all documents");
    throw new Error("Failed to fetch documents");
  }
}

export async function getDocumentById(
  documentId: string,
  userId: string,
): Promise<DocumentDetails> {
  try {
    return await getDocumentWithDetails(documentId, userId);
  } catch (error) {
    if (error instanceof Error && (error as any).code === "NOT_FOUND")
      throw error;
    logger.error({ err: error, documentId }, "Error getting document by ID");
    throw new Error("Failed to fetch document");
  }
}

export async function findDocuments(
  userId: string,
  text?: string,
  tagsList?: string[],
  fileTypes?: string[],
  startDate?: Date,
  endDate?: Date,
  limit = 50,
  sortBy = "createdAt",
  sortDir: "asc" | "desc" = "desc",
  dueDateStart?: Date,
  dueDateEnd?: Date,
): Promise<DocumentDetails[]> {
  try {
    const conditions = _buildDocumentQueryConditions(
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );
    const sortColumnMap: Record<string, any> = {
      createdAt: schemaDocuments.createdAt,
      updatedAt: schemaDocuments.updatedAt,
      title: schemaDocuments.title,
      mimeType: schemaDocuments.mimeType,
      fileSize: schemaDocuments.fileSize,
      originalFilename: schemaDocuments.originalFilename,
    };
    const sortColumn = sortColumnMap[sortBy] || schemaDocuments.createdAt;
    // Use lower() for text columns to ensure consistent case-insensitive sorting across databases
    // (SQLite uses BINARY collation by default which doesn't provide proper alphabetical ordering)
    const textSortColumns = ["title", "mimeType", "originalFilename"];
    const sortExpression = textSortColumns.includes(sortBy)
      ? sql`lower(${sortColumn})`
      : sortColumn;
    const orderByClause =
      sortDir === "asc" ? asc(sortExpression) : desc(sortExpression);

    let finalDocIds: string[];

    if (tagsList && tagsList.length > 0) {
      const baseMatchedDocs = await db
        .select({ id: schemaDocuments.id })
        .from(schemaDocuments)
        .where(and(...conditions));
      const baseDocIds = baseMatchedDocs.map((d) => d.id);
      if (baseDocIds.length === 0) return [];

      const docsWithAllTags = await db
        .select({ documentId: documentsTags.documentId })
        .from(documentsTags)
        .innerJoin(tags, eq(documentsTags.tagId, tags.id))
        .where(
          and(
            inArray(documentsTags.documentId, baseDocIds),
            eq(tags.userId, userId),
            inArray(tags.name, tagsList),
          ),
        )
        .groupBy(documentsTags.documentId)
        .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);
      const taggedDocIds = docsWithAllTags.map((d) => d.documentId);
      if (taggedDocIds.length === 0) return [];

      const finalDocs = await db
        .select({ id: schemaDocuments.id })
        .from(schemaDocuments)
        .where(inArray(schemaDocuments.id, taggedDocIds))
        .orderBy(orderByClause)
        .limit(limit);
      finalDocIds = finalDocs.map((d) => d.id);
    } else {
      const matchedDocs = await db
        .select({ id: schemaDocuments.id })
        .from(schemaDocuments)
        .where(and(...conditions))
        .orderBy(orderByClause)
        .limit(limit);
      finalDocIds = matchedDocs.map((d) => d.id);
    }

    if (finalDocIds.length === 0) return [];

    // Efficiently fetch all documents with processing status in a single query
    const documentsWithStatus = await db
      .select({
        document: schemaDocuments,
        status: queueJobs.status,
      })
      .from(schemaDocuments)
      .leftJoin(
        queueJobs,
        eq(queueJobs.key, sql`'documents:' || ${schemaDocuments.id}`),
      )
      .where(inArray(schemaDocuments.id, finalDocIds));

    // Process documents with tags in parallel
    const results = await Promise.all(
      documentsWithStatus.map(async (result) => {
        const document = result.document;
        const documentTagNames = await getDocumentTags(document.id);

        const fileUrl = document.storageId
          ? `/api/documents/${document.id}/file`
          : null;
        const thumbnailUrl = document.thumbnailStorageId
          ? `/api/documents/${document.id}/thumbnail`
          : null;
        const screenshotUrl = document.screenshotStorageId
          ? `/api/documents/${document.id}/screenshot`
          : null;
        const pdfUrl = document.pdfStorageId
          ? `/api/documents/${document.id}/pdf`
          : null;
        const contentUrl = document.extractedMdStorageId
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
          processingStatus:
      result.status && typeof result.status === "string" ? result.status : null,
          reviewStatus: document.reviewStatus || "pending",
          flagColor: document.flagColor,
          isPinned: document.isPinned || false,
          enabled: document.enabled || false,
        };
      }),
    );
    return results;
  } catch (error) {
    logger.error({ err: error, userId }, "Error searching documents");
    throw new Error("Failed to search documents");
  }
}

export async function countDocuments(
  userId: string,
  text?: string,
  tagsList?: string[],
  fileTypes?: string[],
  startDate?: Date,
  endDate?: Date,
  dueDateStart?: Date,
  dueDateEnd?: Date,
): Promise<number> {
  try {
    const conditions = _buildDocumentQueryConditions(
      userId,
      text,
      startDate,
      endDate,
      dueDateStart,
      dueDateEnd,
    );
    if (!tagsList || tagsList.length === 0) {
      const countResult = await db
        .select({ value: count() })
        .from(schemaDocuments)
        .where(and(...conditions));
      return countResult[0]?.value ?? 0;
    }
    const baseMatchedDocs = await db
      .select({ id: schemaDocuments.id })
      .from(schemaDocuments)
      .where(and(...conditions));
    const baseDocIds = baseMatchedDocs.map((d) => d.id);
    if (baseDocIds.length === 0) return 0;
    const docsWithAllTags = await db
      .select({ documentId: documentsTags.documentId })
      .from(documentsTags)
      .innerJoin(tags, eq(documentsTags.tagId, tags.id))
      .where(
        and(
          inArray(documentsTags.documentId, baseDocIds),
          eq(tags.userId, userId),
          inArray(tags.name, tagsList),
        ),
      )
      .groupBy(documentsTags.documentId)
      .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);
    return docsWithAllTags.length;
  } catch (error) {
    logger.error({ err: error, userId }, "Error counting documents");
    throw new Error("Failed to count documents");
  }
}

export async function updateDocumentArtifacts(
  documentId: string,
  artifacts: {
    title?: string | null;
    description?: string | null;
    tags?: string[];
    extractedText?: string;
    extractedMdStorageId?: string;
    extractedTxtStorageId?: string;
    pdfStorageId?: string;
    thumbnailStorageId?: string;
    screenshotStorageId?: string;
  },
): Promise<void> {
  try {
    logger.info({ documentId }, "Saving final artifacts for document");

    // Get or create tags BEFORE transaction if tags are provided
    let tagList: { id: string; name: string }[] = [];
    if (artifacts.tags && Array.isArray(artifacts.tags) && artifacts.tags.length > 0) {
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
      if (artifacts.extractedText)
        updatePayload.extractedText = artifacts.extractedText;
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

      await tx.documents.update(eq(schemaDocuments.id, documentId), updatePayload);

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
    logger.info({ documentId }, "Successfully saved all artifacts for document");
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
    throw new NotFoundError("Document not found or access denied");
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
      mimeType = "image/jpeg"; // Updated to JPG format
      filename = `${document.id}-thumbnail.jpg`;
      break;
    case "screenshot":
      storageId = document.screenshotStorageId;
      mimeType = "image/jpeg";
      filename = `${document.id}-screenshot.jpg`;
      break;
    case "pdf":
      storageId = document.pdfStorageId;
      mimeType = "application/pdf";
      filename = `${document.id}.pdf`;
      break;
    case "content": // This can point to the markdown version
    case "extracted-md":
      storageId = document.extractedMdStorageId;
      mimeType = "text/markdown";
      filename = `${document.id}-extracted.md`;
      break;
    case "extracted-txt":
      storageId = document.extractedTxtStorageId;
      mimeType = "text/plain";
      filename = `${document.id}-extracted.txt`;
      break;
  }

  if (!storageId) {
    throw new NotFoundError(
      `Asset of type '${assetType}' not found for this document.`,
    );
  }

  try {
    const { stream, contentLength } = await objectStorage.getStream(storageId);
    return { stream, contentLength, mimeType, filename };
  } catch (error: any) {
    // If the file is missing from storage (e.g., deleted manually or processing failed)
    if (error.code === "ENOENT") {
      logger.warn(
        `Storage file not found for document ${documentId}, asset ${assetType}, storageId ${storageId}`,
      );
      throw new NotFoundError(`Asset file not found in storage.`);
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
