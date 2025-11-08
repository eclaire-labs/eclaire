import type { Readable } from "node:stream";
import { and, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { resolver, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { db, schema } from "@/db";
import { getAuthenticatedUserId } from "@/lib/auth-utils";
// Import response schemas
import { ErrorResponseSchema } from "@/lib/openapi-config";
import {
  countDocuments,
  createDocument,
  deleteDocument,
  findDocuments,
  getAllDocuments,
  getDocumentAsset,
  getDocumentById,
  reprocessDocument,
  updateDocument,
} from "@/lib/services/documents";
// Import schemas
import {
  DocumentMetadataSchema,
  DocumentSearchParamsSchema,
  PartialDocumentSchema,
} from "@/schemas/documents-params";
// Import route descriptions
import {
  deleteDocumentRouteDescription,
  getDocumentByIdRouteDescription,
  getDocumentContentRouteDescription,
  getDocumentExtractedMdRouteDescription,
  getDocumentExtractedTxtRouteDescription,
  getDocumentFileRouteDescription,
  getDocumentPdfRouteDescription,
  getDocumentScreenshotRouteDescription,
  getDocumentsRouteDescription,
  getDocumentThumbnailRouteDescription,
  patchDocumentFlagRouteDescription,
  patchDocumentPinRouteDescription,
  patchDocumentReviewRouteDescription,
  patchDocumentRouteDescription,
  postDocumentsRouteDescription,
  putDocumentRouteDescription,
} from "@/schemas/documents-routes";
import { DOCUMENT_MIMES } from "@/types/mime-types";
import type { RouteVariables } from "@/types/route-variables";

import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("documents");

const { documents: schemaDocuments } = schema;

export const documentsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/documents - Get all documents or search documents
documentsRoutes.get(
  "/",
  describeRoute(getDocumentsRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const queryParams = c.req.query();

      // If no search parameters, return all documents
      if (Object.keys(queryParams).length === 0) {
        const documents = await getAllDocuments(userId);
        return c.json({ documents, totalCount: documents.length, limit: 50 });
      }

      // Parse and validate search parameters
      try {
        const params = DocumentSearchParamsSchema.parse({
          text: queryParams.text || undefined,
          tags: queryParams.tags || undefined,
          startDate: queryParams.startDate || undefined,
          endDate: queryParams.endDate || undefined,
          limit: queryParams.limit || 50,
          sortBy: queryParams.sortBy || "createdAt",
          sortDir: queryParams.sortDir || "desc",
          dueDateStart: queryParams.dueDateStart || undefined,
          dueDateEnd: queryParams.dueDateEnd || undefined,
        });

        // Process tags if provided (convert from comma-separated string to array)
        const tagsList = params.tags
          ? params.tags.split(",").map((tag: string) => tag.trim())
          : undefined;

        // Parse dates if provided
        const startDate = params.startDate
          ? new Date(params.startDate)
          : undefined;
        const endDate = params.endDate ? new Date(params.endDate) : undefined;

        // Search documents with provided criteria
        const documents = await findDocuments(
          userId,
          params.text,
          tagsList,
          undefined, // fileTypes parameter
          startDate,
          endDate,
          params.limit,
          params.sortBy,
          params.sortDir,
          params.dueDateStart ? new Date(params.dueDateStart) : undefined,
          params.dueDateEnd ? new Date(params.dueDateEnd) : undefined,
        );

        // Get total count for pagination
        const totalCount = await countDocuments(
          userId,
          params.text,
          tagsList,
          undefined, // fileTypes parameter
          startDate,
          endDate,
        );

        return c.json({
          documents,
          totalCount,
          limit: params.limit,
        });
      } catch (error: unknown) {
        if (error instanceof z.ZodError) {
          return c.json(
            { error: "Invalid search parameters", details: error.issues },
            400,
          );
        }
        throw error;
      }
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error getting documents:",
      );
      return c.json({ error: "Failed to fetch documents" }, 500);
    }
  },
);

// POST /api/documents - Create a new document (file upload)
documentsRoutes.post(
  "/",
  describeRoute(postDocumentsRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const formData = await c.req.formData();
      const metadataPart = formData.get("metadata");
      const contentPart = formData.get("content") as File;

      if (!contentPart) {
        return c.json({ error: "The 'content' part is required." }, 400);
      }

      const contentBuffer = Buffer.from(await contentPart.arrayBuffer());
      const fileTypeResult = await fileTypeFromBuffer(contentBuffer);
      const verifiedMimeType = fileTypeResult?.mime || contentPart.type;

      // Special handling for Apple iWork files that might be detected as ZIP
      let finalMimeType = verifiedMimeType;
      if (verifiedMimeType === "application/zip" && contentPart.name) {
        const filename = contentPart.name.toLowerCase();
        if (filename.endsWith(".numbers")) {
          finalMimeType = "application/vnd.apple.numbers";
        } else if (filename.endsWith(".pages")) {
          finalMimeType = "application/vnd.apple.pages";
        } else if (filename.endsWith(".keynote")) {
          finalMimeType = "application/vnd.apple.keynote";
        }
      }

      // Validate content type for this specific endpoint
      const isValidDocumentType =
        DOCUMENT_MIMES.SET.has(finalMimeType) ||
        finalMimeType.startsWith(DOCUMENT_MIMES.OPENXML_PREFIX);

      if (!isValidDocumentType) {
        return c.json(
          {
            error: `Invalid content type for a document. Received ${finalMimeType}.`,
          },
          400,
        );
      }

      // Parse the raw metadata first (keep all fields for database storage)
      const rawMetadata = JSON.parse((metadataPart as string) || "{}");

      // Then validate only the fields we need for our internal logic
      const validatedMetadata = DocumentMetadataSchema.parse(rawMetadata);

      // Merge: use the raw metadata as base, but overlay our validated fields
      const metadata = { ...rawMetadata, ...validatedMetadata };

      const servicePayload = {
        content: contentBuffer,
        metadata: {
          ...metadata,
          title: metadata.title || contentPart.name || "Untitled Document",
          originalFilename: metadata.originalFilename || contentPart.name,
        },
        originalMimeType: finalMimeType, // Use the corrected MIME type
        userAgent: c.req.header("User-Agent") || "",
      };

      const newDocument = await createDocument(servicePayload, userId);
      return c.json(newDocument, 201);
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error creating document:",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid metadata format", details: error.issues },
          400,
        );
      }

      return c.json({ error: "Failed to create document" }, 500);
    }
  },
);

// GET /api/documents/:id - Get a specific document by ID
documentsRoutes.get(
  "/:id",
  describeRoute(getDocumentByIdRouteDescription),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      try {
        const document = await getDocumentById(id, userId);

        if (!document) {
          return c.json({ error: "Document not found" }, 404);
        }

        return c.json(document);
      } catch (error) {
        if ((error as Error).message === "Document not found") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error fetching document:",
      );
      return c.json({ error: "Failed to fetch document" }, 500);
    }
  },
);

// PUT /api/documents/:id - Update a document (full update)
documentsRoutes.put(
  "/:id",
  describeRoute(putDocumentRouteDescription),
  zValidator("json", PartialDocumentSchema), // Note: using PartialDocumentSchema as the original code uses it
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      try {
        const updatedDocument = await updateDocument(id, validatedData, userId);

        if (!updatedDocument) {
          return c.json({ error: "Document not found" }, 404);
        }

        return c.json(updatedDocument);
      } catch (error) {
        if ((error as Error).message === "Document not found") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating document:",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.issues },
          400,
        );
      }

      return c.json({ error: "Failed to update document" }, 500);
    }
  },
);

// PATCH /api/documents/:id - Update a document (partial update)
documentsRoutes.patch(
  "/:id",
  describeRoute(patchDocumentRouteDescription),
  zValidator("json", PartialDocumentSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      try {
        const updatedDocument = await updateDocument(id, validatedData, userId);

        if (!updatedDocument) {
          return c.json({ error: "Document not found" }, 404);
        }

        return c.json(updatedDocument);
      } catch (error) {
        if ((error as Error).message === "Document not found") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error updating document:",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.issues },
          400,
        );
      }

      return c.json({ error: "Failed to update document" }, 500);
    }
  },
);

// GET /api/documents/:id/file
documentsRoutes.get(
  "/:id/file",
  describeRoute(getDocumentFileRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      const asset = await getDocumentAsset(documentId, userId, "original");
      return createAssetResponse(c, asset, "private, max-age=3600");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

// GET /api/documents/:id/thumbnail
documentsRoutes.get(
  "/:id/thumbnail",
  describeRoute(getDocumentThumbnailRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      const asset = await getDocumentAsset(documentId, userId, "thumbnail");
      return createAssetResponse(c, asset, "public, max-age=86400");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

// GET /api/documents/:id/screenshot
documentsRoutes.get(
  "/:id/screenshot",
  describeRoute(getDocumentScreenshotRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      const asset = await getDocumentAsset(documentId, userId, "screenshot");
      return createAssetResponse(c, asset, "public, max-age=86400");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

// GET /api/documents/:id/pdf - Serve the generated PDF version
documentsRoutes.get(
  "/:id/pdf",
  describeRoute(getDocumentPdfRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      // Use the generic service function for the 'pdf' asset type
      const asset = await getDocumentAsset(documentId, userId, "pdf");

      // Use the generic response helper
      return createAssetResponse(c, asset, "private, max-age=3600");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

// GET /api/documents/:id/content - Serve the extracted content markdown
documentsRoutes.get(
  "/:id/content",
  describeRoute(getDocumentContentRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      // Use the generic service function for the 'content' asset type
      const asset = await getDocumentAsset(documentId, userId, "content");

      // Use the generic response helper
      return createAssetResponse(c, asset, "private, max-age=3600");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

// POST /api/documents/:id/reprocess - Re-process an existing document
documentsRoutes.post("/:id/reprocess", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Parse body for optional force parameter
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;

    const result = await reprocessDocument(id, userId, force);

    if (result.success) {
      return c.json(
        {
          message: "Document queued for reprocessing successfully",
          documentId: id,
        },
        202,
      ); // 202 Accepted: The request has been accepted for processing
    } else {
      return c.json({ error: result.error }, 400);
    }
  } catch (error) {
    logger.error("Error reprocessing document:", error);
    return c.json({ error: "Failed to reprocess document" }, 500);
  }
});

// DELETE /api/documents/:id - Delete a document
documentsRoutes.delete(
  "/:id",
  describeRoute(deleteDocumentRouteDescription),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Parse the optional deleteStorage query parameter (defaults to true)
      const deleteStorageParam = c.req.query("deleteStorage");
      const deleteStorage = deleteStorageParam === "false" ? false : true;

      try {
        await deleteDocument(id, userId, deleteStorage);
        return new Response(null, { status: 204 });
      } catch (error) {
        if ((error as Error).message === "Document not found") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error deleting document:",
      );
      return c.json({ error: "Failed to delete document" }, 500);
    }
  },
);

// PATCH /api/documents/:id/review - Update review status
documentsRoutes.patch(
  "/:id/review",
  describeRoute(patchDocumentReviewRouteDescription),
  zValidator(
    "json",
    z.object({
      reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
        description: "New review status for the document",
        examples: ["accepted", "rejected"],
      }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { reviewStatus } = c.req.valid("json");

      try {
        const updatedDocument = await updateDocument(
          id,
          { reviewStatus },
          userId,
        );

        if (!updatedDocument) {
          return c.json({ error: "Document not found" }, 404);
        }

        return c.json(updatedDocument);
      } catch (error: any) {
        if ((error as any).code === "NOT_FOUND") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating document review status:", error);
      return c.json({ error: "Failed to update document review status" }, 500);
    }
  },
);

// PATCH /api/documents/:id/flag - Update flag color
documentsRoutes.patch(
  "/:id/flag",
  describeRoute(patchDocumentFlagRouteDescription),
  zValidator(
    "json",
    z.object({
      flagColor: z
        .enum(["red", "yellow", "orange", "green", "blue"])
        .nullable()
        .meta({
          description: "Flag color for the document (null to remove flag)",
          examples: ["red", "green", null],
        }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { flagColor } = c.req.valid("json");

      try {
        const updatedDocument = await updateDocument(id, { flagColor }, userId);

        if (!updatedDocument) {
          return c.json({ error: "Document not found" }, 404);
        }

        return c.json(updatedDocument);
      } catch (error: any) {
        if ((error as any).code === "NOT_FOUND") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating document flag:", error);
      return c.json({ error: "Failed to update document flag" }, 500);
    }
  },
);

// PATCH /api/documents/:id/pin - Toggle pin status
documentsRoutes.patch(
  "/:id/pin",
  describeRoute(patchDocumentPinRouteDescription),
  zValidator(
    "json",
    z.object({
      isPinned: z.boolean().meta({
        description: "Whether to pin or unpin the document",
        examples: [true, false],
      }),
    }),
  ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { isPinned } = c.req.valid("json");

      try {
        const updatedDocument = await updateDocument(id, { isPinned }, userId);

        if (!updatedDocument) {
          return c.json({ error: "Document not found" }, 404);
        }

        return c.json(updatedDocument);
      } catch (error: any) {
        if ((error as any).code === "NOT_FOUND") {
          return c.json({ error: "Document not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating document pin status:", error);
      return c.json({ error: "Failed to update document pin status" }, 500);
    }
  },
);

// Document asset types for serving extracted content
const documentAssetTypeToColumnMap = {
  extractedMd: { column: "extractedMdStorageId", mime: "text/markdown" },
  extractedTxt: { column: "extractedTxtStorageId", mime: "text/plain" },
} as const;

type DocumentAssetType = keyof typeof documentAssetTypeToColumnMap;

// Helper function to get document asset details
async function getDocumentAssetDetails(
  documentId: string,
  userId: string,
  assetType: DocumentAssetType,
) {
  const assetInfo = documentAssetTypeToColumnMap[assetType];
  if (!assetInfo) {
    throw new Error("Invalid asset type");
  }

  const document = await db.query.documents.findFirst({
    columns: {
      id: true,
      [assetInfo.column]: true,
    },
    where: and(
      eq(schemaDocuments.id, documentId),
      eq(schemaDocuments.userId, userId),
    ),
  });

  if (!document) {
    const notFoundError = new Error("Document not found");
    (notFoundError as any).name = "NotFoundError";
    throw notFoundError;
  }

  const path = (document as any)[assetInfo.column];
  if (!path) {
    const fileNotFoundError = new Error(
      `${assetType} not found for this document`,
    );
    (fileNotFoundError as any).name = "FileNotFoundError";
    throw fileNotFoundError;
  }

  return {
    storageId: path,
    mimeType: assetInfo.mime,
  };
}

// Helper function to serve a document asset
const serveDocumentAsset = async (c: any, assetType: DocumentAssetType) => {
  try {
    const documentId = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { storageId, mimeType } = await getDocumentAssetDetails(
      documentId,
      userId,
      assetType,
    );

    const { objectStorage } = await import("@/lib/storage");
    const { stream, contentLength } = await objectStorage.getStream(storageId);

    const headers = new Headers();
    // Add charset for text-based content types
    const textTypes = ["text/", "application/json", "application/xml"];
    const needsCharset = textTypes.some((type) => mimeType.startsWith(type));
    headers.set(
      "Content-Type",
      needsCharset ? `${mimeType}; charset=utf-8` : mimeType,
    );
    if (contentLength !== undefined) {
      headers.set("Content-Length", String(contentLength));
    }
    headers.set("Cache-Control", "private, max-age=3600");

    return new Response(stream as any, { status: 200, headers });
  } catch (error: any) {
    logger.error(`Error serving document asset (${assetType}):`, error);
    if (
      error.name === "NotFoundError" ||
      error.name === "FileNotFoundError" ||
      error.code === "ENOENT"
    ) {
      return c.json({ error: error.message }, 404);
    }
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

/**
 * Creates a streaming asset response with appropriate headers.
 * @param c Hono context
 * @param asset The asset object from the service layer
 * @param cacheControl The Cache-Control header value
 */
const createAssetResponse = (
  c: any,
  asset: {
    // *** FIX: The stream can be a Node.js Readable or a Web ReadableStream ***
    stream: Readable | ReadableStream;
    contentLength?: number;
    mimeType: string;
    filename: string;
  },
  cacheControl: string,
) => {
  const headers = new Headers();
  headers.set("Content-Type", asset.mimeType);
  if (asset.contentLength !== undefined) {
    headers.set("Content-Length", String(asset.contentLength));
  }
  headers.set("Cache-Control", cacheControl);

  const viewParam = c.req.query("view");
  const isInlineView = viewParam === "inline";
  const disposition = isInlineView ? "inline" : "attachment";
  headers.set(
    "Content-Disposition",
    `${disposition}; filename="${asset.filename}"`,
  );

  // *** FIX: Cast to 'any' here because the Response constructor is strictly typed,
  // but Hono's runtime can handle the Node.js stream. ***
  return new Response(asset.stream as any, { status: 200, headers });
};

/**
 * Handles errors from asset fetching consistently.
 * @param c Hono context
 * @param error The caught error
 */
const handleAssetError = async (c: any, error: any) => {
  const requestId = c.get("requestId");
  logger.error(
    {
      requestId,
      documentId: c.req.param("id"),
      userId: await getAuthenticatedUserId(c),
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      errorCode: error.code,
    },
    "Error serving document asset",
  );

  if (error.name === "NotFoundError") {
    return c.json({ error: error.message }, 404);
  }

  return c.json({ error: "Internal Server Error" }, 500);
};

// GET /api/documents/:id/extracted-md
documentsRoutes.get(
  "/:id/extracted-md",
  describeRoute(getDocumentExtractedMdRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      const asset = await getDocumentAsset(documentId, userId, "extracted-md");
      return createAssetResponse(c, asset, "private, max-age=3600");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

// GET /api/documents/:id/extracted-txt
documentsRoutes.get(
  "/:id/extracted-txt",
  describeRoute(getDocumentExtractedTxtRouteDescription),
  async (c) => {
    try {
      const documentId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);
      if (!userId) return c.json({ error: "Unauthorized" }, 401);

      const asset = await getDocumentAsset(documentId, userId, "extracted-txt");
      return createAssetResponse(c, asset, "private, max-age=3600");
    } catch (error: any) {
      return handleAssetError(c, error);
    }
  },
);

export default documentsRoutes;
