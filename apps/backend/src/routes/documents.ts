import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";
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
} from "../lib/services/documents.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import {
  DocumentMetadataSchema,
  DocumentSearchParamsSchema,
  PartialDocumentSchema,
} from "../schemas/documents-params.js";
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
} from "../schemas/documents-routes.js";
import { DOCUMENT_MIMES } from "../types/mime-types.js";
import type { Context } from "hono";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("documents");

export const documentsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/documents - Get all documents or search documents
documentsRoutes.get(
  "/",
  describeRoute(getDocumentsRouteDescription),
  withAuth(async (c, userId) => {
    const queryParams = c.req.query();

    // If no search parameters, return all documents
    if (Object.keys(queryParams).length === 0) {
      const documents = await getAllDocuments(userId);
      return c.json({ documents, totalCount: documents.length, limit: 50 });
    }

    // Parse and validate search parameters
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
  }, logger),
);

// POST /api/documents - Create a new document (file upload)
documentsRoutes.post(
  "/",
  describeRoute(postDocumentsRouteDescription),
  withAuth(async (c, userId) => {
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
    let rawMetadata: Record<string, unknown>;
    try {
      rawMetadata = JSON.parse((metadataPart as string) || "{}");
    } catch (error) {
      if (error instanceof SyntaxError) {
        return c.json({ error: "Invalid metadata JSON format" }, 400);
      }
      throw error;
    }

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
  }, logger),
);

// GET /api/documents/:id - Get a specific document by ID
documentsRoutes.get(
  "/:id",
  describeRoute(getDocumentByIdRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const document = await getDocumentById(id, userId);

    if (!document) {
      throw new NotFoundError("Document");
    }

    return c.json(document);
  }, logger),
);

// PUT /api/documents/:id - Update a document (full update)
documentsRoutes.put(
  "/:id",
  describeRoute(putDocumentRouteDescription),
  zValidator("json", PartialDocumentSchema), // Note: using PartialDocumentSchema as the original code uses it
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedDocument = await updateDocument(id, validatedData, userId);

    if (!updatedDocument) {
      throw new NotFoundError("Document");
    }

    return c.json(updatedDocument);
  }, logger),
);

// PATCH /api/documents/:id - Update a document (partial update)
documentsRoutes.patch(
  "/:id",
  describeRoute(patchDocumentRouteDescription),
  zValidator("json", PartialDocumentSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedDocument = await updateDocument(id, validatedData, userId);

    if (!updatedDocument) {
      throw new NotFoundError("Document");
    }

    return c.json(updatedDocument);
  }, logger),
);

// GET /api/documents/:id/file
documentsRoutes.get(
  "/:id/file",
  describeRoute(getDocumentFileRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");
    const asset = await getDocumentAsset(documentId, userId, "original");
    return createAssetResponse(c, asset, "private, max-age=3600");
  }, logger),
);

// GET /api/documents/:id/thumbnail
documentsRoutes.get(
  "/:id/thumbnail",
  describeRoute(getDocumentThumbnailRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");
    const asset = await getDocumentAsset(documentId, userId, "thumbnail");
    return createAssetResponse(c, asset, "public, max-age=86400");
  }, logger),
);

// GET /api/documents/:id/screenshot
documentsRoutes.get(
  "/:id/screenshot",
  describeRoute(getDocumentScreenshotRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");
    const asset = await getDocumentAsset(documentId, userId, "screenshot");
    return createAssetResponse(c, asset, "public, max-age=86400");
  }, logger),
);

// GET /api/documents/:id/pdf - Serve the generated PDF version
documentsRoutes.get(
  "/:id/pdf",
  describeRoute(getDocumentPdfRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");

    // Use the generic service function for the 'pdf' asset type
    const asset = await getDocumentAsset(documentId, userId, "pdf");

    // Use the generic response helper
    return createAssetResponse(c, asset, "private, max-age=3600");
  }, logger),
);

// GET /api/documents/:id/content - Serve the extracted content markdown
documentsRoutes.get(
  "/:id/content",
  describeRoute(getDocumentContentRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");

    // Use the generic service function for the 'content' asset type
    const asset = await getDocumentAsset(documentId, userId, "content");

    // Use the generic response helper
    return createAssetResponse(c, asset, "private, max-age=3600");
  }, logger),
);

// DELETE /api/documents/:id - Delete a document
documentsRoutes.delete(
  "/:id",
  describeRoute(deleteDocumentRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");

    // Parse the optional deleteStorage query parameter (defaults to true)
    const deleteStorageParam = c.req.query("deleteStorage");
    const deleteStorage = deleteStorageParam !== "false";

    await deleteDocument(id, userId, deleteStorage);
    return new Response(null, { status: 204 });
  }, logger),
);

// Common endpoints: PATCH review/flag/pin + POST reprocess
registerCommonEndpoints(documentsRoutes, {
  resourceName: "Document",
  idKeyName: "documentId",
  updateFn: updateDocument,
  reprocessFn: reprocessDocument,
  routeDescriptions: {
    review: patchDocumentReviewRouteDescription,
    flag: patchDocumentFlagRouteDescription,
    pin: patchDocumentPinRouteDescription,
  },
  logger,
});

/**
 * Creates a streaming asset response with appropriate headers.
 * @param c Hono context
 * @param asset The asset object from the service layer
 * @param cacheControl The Cache-Control header value
 */
const createAssetResponse = (
  c: Context,
  asset: {
    stream: ReadableStream<Uint8Array>;
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

  return new Response(asset.stream, { status: 200, headers });
};

// GET /api/documents/:id/extracted-md
documentsRoutes.get(
  "/:id/extracted-md",
  describeRoute(getDocumentExtractedMdRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");
    const asset = await getDocumentAsset(documentId, userId, "extracted-md");
    return createAssetResponse(c, asset, "private, max-age=3600");
  }, logger),
);

// GET /api/documents/:id/extracted-txt
documentsRoutes.get(
  "/:id/extracted-txt",
  describeRoute(getDocumentExtractedTxtRouteDescription),
  withAuth(async (c, userId) => {
    const documentId = c.req.param("id");
    const asset = await getDocumentAsset(documentId, userId, "extracted-txt");
    return createAssetResponse(c, asset, "private, max-age=3600");
  }, logger),
);

export default documentsRoutes;
