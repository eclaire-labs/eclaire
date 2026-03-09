import type { Context } from "hono";
import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { parseDeleteStorage, parseSearchFields } from "../lib/search-params.js";
import {
  createDocument,
  deleteDocument,
  findDocumentsPaginated,
  getDocumentAsset,
  getDocumentById,
  reprocessDocument,
  updateDocument,
} from "../lib/services/documents.js";
import {
  detectAndVerifyMimeType,
  parseUploadMetadata,
} from "../lib/upload-helpers.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import {
  DocumentMetadataSchema,
  DocumentSchema,
  DocumentSearchParamsSchema,
  PartialDocumentSchema,
} from "../schemas/documents-params.js";
// Import route descriptions
import {
  deleteDocumentRouteDescription,
  getDocumentByIdRouteDescription,
  getDocumentContentRouteDescription,
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
import type { RouteVariables } from "../types/route-variables.js";
import { createAssetResponse } from "./asset-response.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";

const logger = createChildLogger("documents");

export const documentsRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/documents - Get all documents or search documents
documentsRoutes.get(
  "/",
  describeRoute(getDocumentsRouteDescription),
  withAuth(async (c, userId) => {
    const params = DocumentSearchParamsSchema.parse(c.req.query());
    const { tags, startDate, endDate, dueDateStart, dueDateEnd } =
      parseSearchFields(params);

    const result = await findDocumentsPaginated({
      userId,
      text: params.text,
      tags,
      startDate,
      endDate,
      limit: params.limit,
      cursor: params.cursor,
      sortBy: params.sortBy,
      sortDir: params.sortDir,
      dueDateStart,
      dueDateEnd,
    });

    return c.json(result);
  }, logger),
);

// POST /api/documents - Create a new document (file upload)
documentsRoutes.post(
  "/",
  describeRoute(postDocumentsRouteDescription),
  withAuth(async (c, userId) => {
    const formData = await c.req.formData();
    const contentPart = formData.get("content") as File;

    if (!contentPart) {
      return c.json({ error: "The 'content' part is required." }, 400);
    }

    const contentBuffer = Buffer.from(await contentPart.arrayBuffer());
    const finalMimeType = await detectAndVerifyMimeType(
      contentBuffer,
      contentPart.type,
      contentPart.name,
    );

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

    const rawMetadata = parseUploadMetadata(formData.get("metadata"));
    const validatedMetadata = DocumentMetadataSchema.parse(rawMetadata);
    const metadata = { ...rawMetadata, ...validatedMetadata };

    const newDocument = await createDocument(
      {
        content: contentBuffer,
        metadata: {
          ...metadata,
          title: metadata.title || contentPart.name || "Untitled Document",
          originalFilename: metadata.originalFilename || contentPart.name,
        },
        originalMimeType: finalMimeType,
        userAgent: c.req.header("User-Agent") || "",
      },
      userId,
      { userId, actor: "user" },
    );
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
  zValidator("json", DocumentSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedDocument = await updateDocument(id, validatedData, {
      userId,
      actor: "user",
    });

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
    const updatedDocument = await updateDocument(id, validatedData, {
      userId,
      actor: "user",
    });

    if (!updatedDocument) {
      throw new NotFoundError("Document");
    }

    return c.json(updatedDocument);
  }, logger),
);

// Content types that must never be rendered inline (XSS risk)
const FORCE_ATTACHMENT_TYPES = new Set([
  "text/html",
  "image/svg+xml",
  "application/xhtml+xml",
  "application/xml",
]);

// Helper to adapt getDocumentAsset results to createAssetResponse options
function serveDocumentAsset(cacheControl: string) {
  return (
    c: Context,
    asset: {
      stream: ReadableStream<Uint8Array>;
      contentLength?: number;
      mimeType: string;
      filename: string;
    },
  ) => {
    const baseType = (asset.mimeType.split(";")[0] ?? "").trim();
    const dispositionType = FORCE_ATTACHMENT_TYPES.has(baseType)
      ? ("attachment" as const)
      : ("auto" as const);
    return createAssetResponse(c, {
      stream: asset.stream,
      contentType: asset.mimeType,
      contentLength: asset.contentLength,
      cacheControl,
      disposition: { type: dispositionType, filename: asset.filename },
    });
  };
}

// GET /api/documents/:id/file
documentsRoutes.get(
  "/:id/file",
  describeRoute(getDocumentFileRouteDescription),
  withAuth(async (c, userId) => {
    const asset = await getDocumentAsset(c.req.param("id"), userId, "original");
    return serveDocumentAsset("private, max-age=3600")(c, asset);
  }, logger),
);

// GET /api/documents/:id/thumbnail
documentsRoutes.get(
  "/:id/thumbnail",
  describeRoute(getDocumentThumbnailRouteDescription),
  withAuth(async (c, userId) => {
    const asset = await getDocumentAsset(
      c.req.param("id"),
      userId,
      "thumbnail",
    );
    return serveDocumentAsset("public, max-age=604800")(c, asset);
  }, logger),
);

// GET /api/documents/:id/screenshot
documentsRoutes.get(
  "/:id/screenshot",
  describeRoute(getDocumentScreenshotRouteDescription),
  withAuth(async (c, userId) => {
    const asset = await getDocumentAsset(
      c.req.param("id"),
      userId,
      "screenshot",
    );
    return serveDocumentAsset("public, max-age=86400")(c, asset);
  }, logger),
);

// GET /api/documents/:id/pdf
documentsRoutes.get(
  "/:id/pdf",
  describeRoute(getDocumentPdfRouteDescription),
  withAuth(async (c, userId) => {
    const asset = await getDocumentAsset(c.req.param("id"), userId, "pdf");
    return serveDocumentAsset("private, max-age=3600")(c, asset);
  }, logger),
);

// GET /api/documents/:id/content
documentsRoutes.get(
  "/:id/content",
  describeRoute(getDocumentContentRouteDescription),
  withAuth(async (c, userId) => {
    const asset = await getDocumentAsset(c.req.param("id"), userId, "content");
    return serveDocumentAsset("private, max-age=3600")(c, asset);
  }, logger),
);

// DELETE /api/documents/:id - Delete a document
documentsRoutes.delete(
  "/:id",
  describeRoute(deleteDocumentRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    await deleteDocument(
      id,
      userId,
      { userId, actor: "user" },
      parseDeleteStorage(c),
    );
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

export default documentsRoutes;
