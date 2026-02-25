import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import {
  type BookmarkAssetType,
  createBookmarkAndQueueJob,
  deleteBookmark,
  getAllBookmarks,
  getBookmarkAssetDetails,
  getBookmarkById,
  reprocessBookmark,
  updateBookmark,
  validateAndNormalizeBookmarkUrl,
} from "../lib/services/bookmarks.js";
import { getStorage } from "../lib/storage/index.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import {
  BookmarkSchema,
  CreateBookmarkSchema,
  PartialBookmarkSchema,
} from "../schemas/bookmarks-params.js";
import {
  createAssetRouteDescription,
  deleteBookmarkRouteDescription,
  getBookmarkByIdRouteDescription,
  getBookmarksRouteDescription,
  patchBookmarkFlagRouteDescription,
  patchBookmarkPinRouteDescription,
  patchBookmarkReviewRouteDescription,
  patchBookmarkRouteDescription,
  postBookmarksImportRouteDescription,
  postBookmarksRouteDescription,
  putBookmarkRouteDescription,
} from "../schemas/bookmarks-routes.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("bookmarks");

export const bookmarksRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/bookmarks - Get all bookmarks for the authenticated user
bookmarksRoutes.get(
  "/",
  describeRoute(getBookmarksRouteDescription),
  withAuth(async (c, userId) => {
    const bookmarks = await getAllBookmarks(userId);
    return c.json(bookmarks);
  }, logger),
);

// POST /api/bookmarks - Create a new bookmark and queue it for processing
bookmarksRoutes.post(
  "/",
  describeRoute(postBookmarksRouteDescription),
  zValidator("json", CreateBookmarkSchema),
  withAuth(async (c, userId) => {
    const body = c.req.valid("json");
    const { url, title, description, tags, metadata, enabled } = body;

    // 1. Basic URL validation and normalization
    const urlValidation = validateAndNormalizeBookmarkUrl(url);
    if (!urlValidation.valid) {
      return c.json({ error: urlValidation.error }, 400);
    }

    // 2. Prepare metadata with core fields and additional metadata
    const enrichedMetadata = {
      title,
      description,
      tags,
      enabled,
      ...metadata, // Additional metadata if provided
    };

    // 3. Call the service to create the DB entries and queue the job
    const result = await createBookmarkAndQueueJob({
      // biome-ignore lint/style/noNonNullAssertion: guarded by validation check above
      url: urlValidation.normalizedUrl!,
      userId: userId,
      rawMetadata: enrichedMetadata,
      userAgent: c.req.header("User-Agent") || "",
    });

    if (!result.success) {
      return c.json(
        { error: result.error || "Failed to create bookmark" },
        500,
      );
    }

    // 4. Return the initial bookmark data immediately
    return c.json(result.bookmark, 202); // 202 Accepted: The request has been accepted for processing
  }, logger),
);

// GET /api/bookmarks/:id - Get a specific bookmark by ID
bookmarksRoutes.get(
  "/:id",
  describeRoute(getBookmarkByIdRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const bookmark = await getBookmarkById(id, userId);

    if (!bookmark) {
      throw new NotFoundError("Bookmark");
    }

    return c.json(bookmark);
  }, logger),
);

// PUT /api/bookmarks/:id - Update a bookmark (full update)
bookmarksRoutes.put(
  "/:id",
  describeRoute(putBookmarkRouteDescription),
  zValidator("json", BookmarkSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedBookmark = await updateBookmark(id, validatedData, userId);

    if (!updatedBookmark) {
      throw new NotFoundError("Bookmark");
    }

    return c.json(updatedBookmark);
  }, logger),
);

// PATCH /api/bookmarks/:id - Update a bookmark (partial update)
bookmarksRoutes.patch(
  "/:id",
  describeRoute(patchBookmarkRouteDescription),
  zValidator("json", PartialBookmarkSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");
    const updatedBookmark = await updateBookmark(id, validatedData, userId);

    if (!updatedBookmark) {
      throw new NotFoundError("Bookmark");
    }

    return c.json(updatedBookmark);
  }, logger),
);

// DELETE /api/bookmarks/:id - Delete a bookmark
bookmarksRoutes.delete(
  "/:id",
  describeRoute(deleteBookmarkRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");

    // Parse the optional deleteStorage query parameter (defaults to true)
    const deleteStorageParam = c.req.query("deleteStorage");
    const deleteStorage = deleteStorageParam !== "false";

    await deleteBookmark(id, userId, deleteStorage);
    return new Response(null, { status: 204 });
  }, logger),
);

// Helper function to serve a bookmark asset
const serveBookmarkAsset = (assetType: BookmarkAssetType) =>
  withAuth(async (c, userId) => {
    const bookmarkId = c.req.param("id");

    const { storageId, mimeType } = await getBookmarkAssetDetails(
      bookmarkId,
      userId,
      assetType,
    );

    const storage = getStorage();
    const { stream, metadata } = await storage.read(storageId);

    const headers = new Headers();
    // Add charset for text-based content types
    const textTypes = ["text/", "application/json", "application/xml"];
    const needsCharset = textTypes.some((type) => mimeType.startsWith(type));
    headers.set(
      "Content-Type",
      needsCharset ? `${mimeType}; charset=utf-8` : mimeType,
    );
    headers.set("Content-Length", String(metadata.size));
    // Set aggressive caching for favicons and screenshots
    if (assetType === "favicon" || assetType === "screenshot") {
      headers.set("Cache-Control", "public, max-age=604800, immutable"); // Cache for 1 week
    } else {
      headers.set("Cache-Control", "private, max-age=3600");
    }

    return new Response(stream, { status: 200, headers });
  }, logger);

// Asset endpoints with OpenAPI documentation
const createAssetEndpoint = (
  path: string,
  assetType: BookmarkAssetType,
  description: string,
  mimeType: string,
) => {
  return bookmarksRoutes.get(
    path,
    describeRoute(
      createAssetRouteDescription(assetType, description, mimeType),
    ),
    serveBookmarkAsset(assetType),
  );
};

// Create all asset endpoints
createAssetEndpoint(
  "/:id/favicon",
  "favicon",
  "Get the favicon image for a bookmark",
  "image/x-icon",
);
createAssetEndpoint(
  "/:id/screenshot",
  "screenshot",
  "Get the desktop screenshot of a bookmark",
  "image/jpeg",
);
// Add thumbnail endpoint for lower resolution thumbnail
createAssetEndpoint(
  "/:id/thumbnail",
  "thumbnail",
  "Get the thumbnail of a bookmark",
  "image/jpeg",
);
createAssetEndpoint(
  "/:id/screenshot-mobile",
  "screenshotMobile",
  "Get the mobile screenshot of a bookmark",
  "image/jpeg",
);
createAssetEndpoint(
  "/:id/screenshot-fullpage",
  "screenshotFullPage",
  "Get the full-page screenshot of a bookmark",
  "image/jpeg",
);
createAssetEndpoint(
  "/:id/pdf",
  "pdf",
  "Get the PDF version of a bookmark",
  "application/pdf",
);
createAssetEndpoint(
  "/:id/readable",
  "readable",
  "Get the readable content extract of a bookmark",
  "text/html",
);
createAssetEndpoint(
  "/:id/raw",
  "raw",
  "Get the raw HTML content of a bookmark",
  "text/html",
);
createAssetEndpoint(
  "/:id/extracted-md",
  "extractedMd",
  "Get the extracted markdown content of a bookmark",
  "text/markdown",
);
createAssetEndpoint(
  "/:id/extracted-txt",
  "extractedTxt",
  "Get the extracted plain text content of a bookmark",
  "text/plain",
);
// Add content alias for consistency (defaults to markdown if available)
createAssetEndpoint(
  "/:id/content",
  "extractedMd",
  "Get the extracted content of a bookmark (markdown)",
  "text/markdown",
);
createAssetEndpoint(
  "/:id/readme",
  "readme",
  "Get the README content of a GitHub repository bookmark",
  "text/markdown",
);

// PATCH /api/bookmarks/:id/review - Update review status
bookmarksRoutes.patch(
  "/:id/review",
  describeRoute(patchBookmarkReviewRouteDescription),
  zValidator(
    "json",
    z.object({
      reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
        description: "New review status for the bookmark",
        examples: ["accepted", "rejected"],
      }),
    }),
  ),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const { reviewStatus } = c.req.valid("json");
    const updatedBookmark = await updateBookmark(id, { reviewStatus }, userId);

    if (!updatedBookmark) {
      throw new NotFoundError("Bookmark");
    }

    return c.json(updatedBookmark);
  }, logger),
);

// PATCH /api/bookmarks/:id/flag - Update flag color
bookmarksRoutes.patch(
  "/:id/flag",
  describeRoute(patchBookmarkFlagRouteDescription),
  zValidator(
    "json",
    z.object({
      flagColor: z
        .enum(["red", "yellow", "orange", "green", "blue"])
        .nullable()
        .meta({
          description: "Flag color for the bookmark (null to remove flag)",
          examples: ["red", "green", null],
        }),
    }),
  ),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const { flagColor } = c.req.valid("json");
    const updatedBookmark = await updateBookmark(id, { flagColor }, userId);

    if (!updatedBookmark) {
      throw new NotFoundError("Bookmark");
    }

    return c.json(updatedBookmark);
  }, logger),
);

// PATCH /api/bookmarks/:id/pin - Toggle pin status
bookmarksRoutes.patch(
  "/:id/pin",
  describeRoute(patchBookmarkPinRouteDescription),
  zValidator(
    "json",
    z.object({
      isPinned: z.boolean().meta({
        description: "Whether to pin or unpin the bookmark",
        examples: [true, false],
      }),
    }),
  ),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const { isPinned } = c.req.valid("json");
    const updatedBookmark = await updateBookmark(id, { isPinned }, userId);

    if (!updatedBookmark) {
      throw new NotFoundError("Bookmark");
    }

    return c.json(updatedBookmark);
  }, logger),
);

// POST /api/bookmarks/:id/reprocess - Re-process an existing bookmark
bookmarksRoutes.post(
  "/:id/reprocess",
  withAuth(async (c, userId) => {
    const id = c.req.param("id");

    // Parse body for optional force parameter
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;

    const result = await reprocessBookmark(id, userId, force);

    if (result.success) {
      return c.json(
        {
          message: "Bookmark queued for reprocessing successfully",
          bookmarkId: id,
        },
        202,
      ); // 202 Accepted: The request has been accepted for processing
    }
    return c.json({ error: result.error }, 400);
  }, logger),
);

// POST /api/bookmarks/import - Import bookmarks from file
bookmarksRoutes.post(
  "/import",
  describeRoute(postBookmarksImportRouteDescription),
  withAuth(async (c, userId) => {
    const body = await c.req.parseBody();
    const file = body.file as File;

    if (!file) {
      return c.json({ error: "No file uploaded" }, 400);
    }

    // Chrome/Brave bookmark files are typically named "Bookmarks" without extension
    // We'll validate the JSON format after parsing

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return c.json({ error: "File too large. Maximum size is 5MB." }, 400);
    }

    // Read and parse file content
    const fileContent = await file.text();
    let bookmarkData: unknown;
    try {
      bookmarkData = JSON.parse(fileContent);
    } catch (_error) {
      return c.json(
        {
          error:
            "Invalid file format. Please upload a Chrome or Brave bookmark file.",
        },
        400,
      );
    }

    // Import bookmarks using the service
    const { importBookmarkFile } = await import(
      "../lib/services/bookmarks.js"
    );
    const result = await importBookmarkFile(userId, bookmarkData);

    return c.json({
      message: "Bookmarks imported successfully",
      imported: result.imported,
      queued: result.queued,
      errors: result.errors,
    });
  }, logger),
);
