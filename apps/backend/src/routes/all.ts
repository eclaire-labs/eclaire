import { fileTypeFromBuffer } from "file-type";
// routes/all.ts
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi";
import isUrl from "is-url";
import z from "zod/v4";
import { getAuthenticatedUserId } from "../lib/auth-utils.js";
// Import search service functions
import { countAllEntries, findAllEntries } from "../lib/services/all.js";
// Import creation service functions
import { createBookmarkAndQueueJob } from "../lib/services/bookmarks.js";
import { createDocument } from "../lib/services/documents.js";
import { createNoteEntry } from "../lib/services/notes.js";
import { createPhoto, extractAndGeocode } from "../lib/services/photos.js";
import { createTask } from "../lib/services/tasks.js";
// Import schemas
import { CreateMetadataSchema, SearchQuerySchema } from "../schemas/all-params.js";
import {
  getAllRouteDescription,
  postAllRouteDescription,
} from "../schemas/all-routes.js";
import { ASSET_TYPE } from "../types/assets.js";
// Import MIME type definitions
import {
  BOOKMARK_MIMES,
  DOCUMENT_MIMES,
  NOTE_MIMES,
  PHOTO_MIMES,
} from "../types/mime-types.js";
import type { RouteVariables } from "../types/route-variables.js";

import { createChildLogger } from "../lib/logger.js";

const logger = createChildLogger("all");

export const allRoutes = new Hono<{ Variables: RouteVariables }>();

// --- Helper function for more lenient URL checking ---
const isLaxUrl = (str: string): boolean => {
  if (isUrl(str)) return true;
  // Try again with a protocol prepended for cases like "google.com"
  if (str.includes(".") && !str.includes(" ") && !str.startsWith("http")) {
    return isUrl(`http://${str}`);
  }
  return false;
};

// GET /api/all - Search across all content types
allRoutes.get(
  "/",
  describeRoute(getAllRouteDescription),
  zValidator("query", SearchQuerySchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const params = c.req.valid("query");
      const tagsList = params.tags
        ? params.tags.split(",").map((tag: string) => tag.trim())
        : undefined;
      const startDate = params.startDate
        ? new Date(params.startDate)
        : undefined;
      const endDate = params.endDate ? new Date(params.endDate) : undefined;

      const allItems = await findAllEntries(
        userId,
        params.text,
        tagsList,
        startDate,
        endDate,
        undefined,
        params.limit,
        params.dueStatus,
      );

      const totalCount = await countAllEntries(
        userId,
        params.text,
        tagsList,
        startDate,
        endDate,
        undefined,
        params.dueStatus,
      );

      return c.json({
        items: allItems,
        totalCount,
        limit: params.limit,
        offset: params.offset,
      });
    } catch (error: unknown) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error searching all items:",
      );
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid search parameters", details: error.issues },
          400,
        );
      }
      return c.json({ error: "Failed to search all items" }, 500);
    }
  },
);

// POST /api/all - Create any content type
allRoutes.post("/", describeRoute(postAllRouteDescription), async (c) => {
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

    // Parse the raw metadata first (keep all fields for database storage)
    const rawMetadata = JSON.parse((metadataPart as string) || "{}");

    // Then validate only the fields we need for our internal logic
    const validatedMetadata = CreateMetadataSchema.parse(rawMetadata);

    // Merge: use the raw metadata as base, but overlay our validated fields
    const metadata = { ...rawMetadata, ...validatedMetadata };
    const contentBuffer = Buffer.from(await contentPart.arrayBuffer());
    const originalMimeType = contentPart.type;
    const userAgent = c.req.header("User-Agent") || "";

    const fileTypeResult = await fileTypeFromBuffer(contentBuffer);
    let verifiedMimeType = fileTypeResult?.mime || originalMimeType;

    // Special handling for SVG files that might be detected as application/xml
    if (
      (verifiedMimeType === "application/xml" ||
        verifiedMimeType === "text/xml") &&
      contentPart.name
    ) {
      const filename = contentPart.name.toLowerCase();
      if (filename.endsWith(".svg")) {
        verifiedMimeType = "image/svg+xml";
      }
    }

    // Special handling for Apple iWork files that might be detected as ZIP
    if (verifiedMimeType === "application/zip" && contentPart.name) {
      const filename = contentPart.name.toLowerCase();
      if (filename.endsWith(".numbers")) {
        verifiedMimeType = "application/vnd.apple.numbers";
      } else if (filename.endsWith(".pages")) {
        verifiedMimeType = "application/vnd.apple.pages";
      } else if (filename.endsWith(".keynote")) {
        verifiedMimeType = "application/vnd.apple.keynote";
      }
    }

    // Log request details for troubleshooting (avoid logging large binary content)
    const requestId = c.get("requestId");
    logger.info(
      {
        requestId,
        userId,
        contentPartName: contentPart.name,
        contentPartType: contentPart.type,
        contentSize: contentBuffer.length,
        originalMimeType,
        verifiedMimeType,
        userAgent,
        metadataKeys: Object.keys(metadata),
        metadata: {
          assetType: metadata.assetType,
          title: metadata.title,
          originalFilename: metadata.originalFilename,
          url: metadata.url?.substring(0, 100), // Log only first 100 chars of URL
        },
      },
      "POST /api/all - Request details",
    );

    const servicePayload = {
      metadata,
      originalMimeType: verifiedMimeType,
      userAgent,
      userId,
    };

    // Rule 1: Explicit assetType in metadata (overrides all other rules)
    if (metadata.assetType) {
      switch (metadata.assetType) {
        case ASSET_TYPE.BOOKMARK: {
          const contentString = contentBuffer.toString("utf-8").trim();
          const url = metadata.url || contentString;
          if (!isLaxUrl(url)) {
            return c.json({ error: "Invalid URL for bookmark" }, 400);
          }
          const result = await createBookmarkAndQueueJob({
            url: url,
            userId: userId,
            rawMetadata: metadata,
            userAgent: userAgent,
          });
          if (!result.success) {
            return c.json(
              { error: result.error || "Failed to create bookmark" },
              500,
            );
          }
          logger.info(
            {
              requestId,
              bookmarkId: result.bookmark.id,
              url: url.substring(0, 50) + "...",
              rule: "Rule 1 (explicit assetType)",
            },
            "Bookmark created",
          );
          return c.json(result.bookmark, 201);
        }
        case ASSET_TYPE.NOTE: {
          const result = await createNoteEntry(
            { ...servicePayload, content: contentBuffer.toString("utf-8") },
            userId,
          );
          logger.info(
            {
              requestId,
              noteId: result.id,
              title: metadata.title || "Untitled",
              rule: "Rule 1 (explicit assetType)",
            },
            "Note created",
          );
          return c.json(result, 201);
        }
        case ASSET_TYPE.PHOTO: {
          // Use the already corrected verifiedMimeType instead of re-detecting
          if (!PHOTO_MIMES.includes(verifiedMimeType)) {
            return c.json(
              { error: "Content is not a valid photo format." },
              400,
            );
          }
          const extractedMetadata = await extractAndGeocode(contentBuffer);
          const result = await createPhoto(
            {
              ...servicePayload,
              content: contentBuffer,
              extractedMetadata,
              metadata: {
                ...metadata,
                originalFilename: metadata.originalFilename || contentPart.name,
              },
            },
            userId,
          );
          logger.info(
            {
              requestId,
              photoId: result.id,
              filename: metadata.originalFilename || contentPart.name,
              rule: "Rule 1 (explicit assetType)",
            },
            "Photo created",
          );
          return c.json(result, 201);
        }
        case ASSET_TYPE.DOCUMENT: {
          const result = await createDocument(
            {
              ...servicePayload,
              content: contentBuffer,
              metadata: {
                ...metadata,
                originalFilename: metadata.originalFilename || contentPart.name,
              },
            },
            userId,
          );
          logger.info(
            {
              requestId,
              documentId: result.id,
              filename: metadata.originalFilename || contentPart.name,
              rule: "Rule 1 (explicit assetType)",
            },
            "Document created",
          );
          return c.json(result, 201);
        }
        case ASSET_TYPE.TASK: {
          const taskData = JSON.parse(contentBuffer.toString("utf-8"));
          // Basic validation
          if (!taskData.title) {
            return c.json({ error: "Task title is required" }, 400);
          }
          const result = await createTask(taskData, userId);
          logger.info(
            {
              requestId,
              taskId: result.id,
              title: result.title,
              rule: "Rule 1 (explicit assetType)",
            },
            "Task created",
          );
          return c.json(result, 201);
        }
      }
    }

    // --- Start of the strict if-else if classification chain ---
    const contentString = contentBuffer.toString("utf-8").trim();

    // Log classification result
    logger.debug(
      {
        requestId,
        verifiedMimeType,
        originalMimeType,
      },
      "Content classification result",
    );

    // Rule 2: URI list MIME types -> Bookmarks
    if (BOOKMARK_MIMES.URI_LIST.includes(verifiedMimeType)) {
      const result = await createBookmarkAndQueueJob({
        url: contentString,
        userId: userId,
        rawMetadata: metadata,
        userAgent: userAgent,
      });
      if (!result.success) {
        return c.json(
          { error: result.error || "Failed to create bookmark" },
          500,
        );
      }
      logger.info(
        {
          requestId,
          bookmarkId: result.bookmark.id,
          url: contentString.substring(0, 50) + "...",
          rule: "Rule 2 (URI list)",
        },
        "Bookmark created",
      );
      return c.json(result.bookmark, 201);
    }
    // Rule 3: Text content that is a valid URL -> Bookmarks
    else if (
      BOOKMARK_MIMES.URL_IN_TEXT.includes(verifiedMimeType) &&
      isLaxUrl(contentString)
    ) {
      const result = await createBookmarkAndQueueJob({
        url: contentString,
        userId: userId,
        rawMetadata: metadata,
        userAgent: userAgent,
      });
      if (!result.success) {
        return c.json(
          { error: result.error || "Failed to create bookmark" },
          500,
        );
      }
      logger.info(
        {
          requestId,
          bookmarkId: result.bookmark.id,
          url: contentString.substring(0, 50) + "...",
          rule: "Rule 3 (text URL)",
        },
        "Bookmark created",
      );
      return c.json(result.bookmark, 201);
    }
    // Rule 4: Plain text/RTF -> Notes
    else if (NOTE_MIMES.includes(verifiedMimeType)) {
      const result = await createNoteEntry(
        { ...servicePayload, content: contentString },
        userId,
      );
      logger.info(
        {
          requestId,
          noteId: result.id,
          title: metadata.title || "Untitled",
          rule: "Rule 4 (MIME-based)",
        },
        "Note created",
      );
      return c.json(result, 201);
    }
    // Rule 5: Image MIME types -> Photos
    else if (PHOTO_MIMES.includes(verifiedMimeType)) {
      const extractedMetadata = await extractAndGeocode(contentBuffer);
      const result = await createPhoto(
        {
          ...servicePayload,
          content: contentBuffer,
          extractedMetadata,
          metadata: {
            ...metadata,
            originalFilename: metadata.originalFilename || contentPart.name,
          },
        },
        userId,
      );
      logger.info(
        {
          requestId,
          photoId: result.id,
          filename: metadata.originalFilename || contentPart.name,
          rule: "Rule 5 (MIME-based)",
        },
        "Photo created",
      );
      return c.json(result, 201);
    }
    // Rule 6: Document MIME types -> Documents
    else if (
      DOCUMENT_MIMES.SET.has(verifiedMimeType) ||
      verifiedMimeType.startsWith(DOCUMENT_MIMES.OPENXML_PREFIX)
    ) {
      const result = await createDocument(
        {
          ...servicePayload,
          content: contentBuffer,
          metadata: {
            ...metadata,
            originalFilename: metadata.originalFilename || contentPart.name,
          },
        },
        userId,
      );
      logger.info(
        {
          requestId,
          documentId: result.id,
          filename: metadata.originalFilename || contentPart.name,
          rule: "Rule 6 (MIME-based)",
        },
        "Document created",
      );
      return c.json(result, 201);
    }
    // Rule 7: Reject if no rules matched
    else {
      return c.json(
        {
          error: "Unsupported content type or invalid data.",
          message: `Could not classify content with verified MIME type: ${verifiedMimeType}`,
        },
        400,
      );
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
      "Error in POST /api/all endpoint:",
    );
    if (error instanceof z.ZodError) {
      return c.json(
        { error: "Invalid metadata format", details: error.issues },
        400,
      );
    }
    return c.json({ error: "Failed to process request" }, 500);
  }
});
