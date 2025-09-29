import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi/zod";
import isUrl from "is-url";
import { z } from "zod";
import { getAuthenticatedUserId } from "@/lib/auth-utils";
import {
  type BookmarkAssetType,
  createBookmarkAndQueueJob, // Renamed for clarity
  deleteBookmark,
  getAllBookmarks,
  getBookmarkAssetDetails,
  getBookmarkById,
  reprocessBookmark,
  updateBookmark,
} from "@/lib/services/bookmarks";
import { objectStorage } from "@/lib/storage";
// Import schemas
import {
  BookmarkSchema,
  CreateBookmarkSchema,
  PartialBookmarkSchema,
} from "@/schemas/bookmarks-params";
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
} from "@/schemas/bookmarks-routes";
import type { RouteVariables } from "@/types/route-variables";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("bookmarks");

// Helper function to normalize URLs by adding protocol if missing
const normalizeUrl = (url: string): string => {
  const trimmedUrl = url.trim();

  // If URL already has a protocol, return as-is
  if (trimmedUrl.match(/^https?:\/\//i)) {
    return trimmedUrl;
  }

  // Add https:// prefix for URLs without protocol
  return `https://${trimmedUrl}`;
};

export const bookmarksRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/bookmarks - Get all bookmarks for the authenticated user
bookmarksRoutes.get(
  "/",
  describeRoute(getBookmarksRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const bookmarks = await getAllBookmarks(userId);
      return c.json(bookmarks);
    } catch (error) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
        },
        "Error fetching bookmarks",
      );
      return c.json({ error: "Failed to fetch bookmarks" }, 500);
    }
  },
);

// POST /api/bookmarks - Create a new bookmark and queue it for processing
bookmarksRoutes.post(
  "/",
  describeRoute(postBookmarksRouteDescription),
  zValidator("json", CreateBookmarkSchema),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const body = c.req.valid("json");
      const { url, title, description, tags, metadata, enabled } = body;

      // 1. Basic URL validation and normalization
      if (!url || !url.trim()) {
        return c.json({ error: "A valid URL is required." }, 400);
      }

      const normalizedUrl = normalizeUrl(url);
      if (!isUrl(normalizedUrl)) {
        return c.json({ error: "A valid URL is required." }, 400);
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
        url: normalizedUrl,
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
    } catch (error) {
      logger.error("Error creating bookmark:", error);
      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.errors },
          400,
        );
      }
      return c.json({ error: "Failed to create bookmark" }, 500);
    }
  },
);

// GET /api/bookmarks/:id - Get a specific bookmark by ID
bookmarksRoutes.get(
  "/:id",
  describeRoute(getBookmarkByIdRouteDescription),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      try {
        const bookmark = await getBookmarkById(id, userId);

        if (!bookmark) {
          return c.json({ error: "Bookmark not found" }, 404);
        }

        return c.json(bookmark);
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error fetching bookmark:", error);
      return c.json({ error: "Failed to fetch bookmark" }, 500);
    }
  },
);

// PUT /api/bookmarks/:id - Update a bookmark (full update)
bookmarksRoutes.put(
  "/:id",
  describeRoute(putBookmarkRouteDescription),
  zValidator("json", BookmarkSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      try {
        const updatedBookmark = await updateBookmark(id, validatedData, userId);

        if (!updatedBookmark) {
          return c.json({ error: "Bookmark not found" }, 404);
        }

        return c.json(updatedBookmark);
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating bookmark:", error);

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.errors },
          400,
        );
      }

      return c.json({ error: "Failed to update bookmark" }, 500);
    }
  },
);

// PATCH /api/bookmarks/:id - Update a bookmark (partial update)
bookmarksRoutes.patch(
  "/:id",
  describeRoute(patchBookmarkRouteDescription),
  zValidator("json", PartialBookmarkSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      try {
        const updatedBookmark = await updateBookmark(id, validatedData, userId);

        if (!updatedBookmark) {
          return c.json({ error: "Bookmark not found" }, 404);
        }

        return c.json(updatedBookmark);
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating bookmark:", error);

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.errors },
          400,
        );
      }

      return c.json({ error: "Failed to update bookmark" }, 500);
    }
  },
);

// DELETE /api/bookmarks/:id - Delete a bookmark
bookmarksRoutes.delete(
  "/:id",
  describeRoute(deleteBookmarkRouteDescription),
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
        await deleteBookmark(id, userId, deleteStorage);
        return new Response(null, { status: 204 });
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error deleting bookmark:", error);
      return c.json({ error: "Failed to delete bookmark" }, 500);
    }
  },
);

// Helper function to serve a bookmark asset
const serveBookmarkAsset = async (c: any, assetType: BookmarkAssetType) => {
  try {
    const bookmarkId = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { storageId, mimeType } = await getBookmarkAssetDetails(
      bookmarkId,
      userId,
      assetType,
    );

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
    // Set aggressive caching for favicons and screenshots
    if (assetType === "favicon" || assetType === "screenshot") {
      headers.set("Cache-Control", "public, max-age=604800, immutable"); // Cache for 1 week
    } else {
      headers.set("Cache-Control", "private, max-age=3600");
    }

    return new Response(stream as any, { status: 200, headers });
  } catch (error: any) {
    logger.error(`Error serving bookmark asset (${assetType}):`, error);
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
    (c) => serveBookmarkAsset(c, assetType),
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
      reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
        description: "New review status for the bookmark",
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
        const updatedBookmark = await updateBookmark(
          id,
          { reviewStatus },
          userId,
        );

        if (!updatedBookmark) {
          return c.json({ error: "Bookmark not found" }, 404);
        }

        return c.json(updatedBookmark);
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating bookmark review status:", error);
      return c.json({ error: "Failed to update bookmark review status" }, 500);
    }
  },
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
        .openapi({
          description: "Flag color for the bookmark (null to remove flag)",
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
        const updatedBookmark = await updateBookmark(id, { flagColor }, userId);

        if (!updatedBookmark) {
          return c.json({ error: "Bookmark not found" }, 404);
        }

        return c.json(updatedBookmark);
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating bookmark flag:", error);
      return c.json({ error: "Failed to update bookmark flag" }, 500);
    }
  },
);

// PATCH /api/bookmarks/:id/pin - Toggle pin status
bookmarksRoutes.patch(
  "/:id/pin",
  describeRoute(patchBookmarkPinRouteDescription),
  zValidator(
    "json",
    z.object({
      isPinned: z.boolean().openapi({
        description: "Whether to pin or unpin the bookmark",
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
        const updatedBookmark = await updateBookmark(id, { isPinned }, userId);

        if (!updatedBookmark) {
          return c.json({ error: "Bookmark not found" }, 404);
        }

        return c.json(updatedBookmark);
      } catch (error) {
        if ((error as Error).message === "Bookmark not found") {
          return c.json({ error: "Bookmark not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating bookmark pin status:", error);
      return c.json({ error: "Failed to update bookmark pin status" }, 500);
    }
  },
);

// POST /api/bookmarks/:id/reprocess - Re-process an existing bookmark
bookmarksRoutes.post("/:id/reprocess", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

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
    } else {
      return c.json({ error: result.error }, 400);
    }
  } catch (error) {
    logger.error("Error reprocessing bookmark:", error);
    return c.json({ error: "Failed to reprocess bookmark" }, 500);
  }
});

// POST /api/bookmarks/import - Import bookmarks from file
bookmarksRoutes.post(
  "/import",
  describeRoute(postBookmarksImportRouteDescription),
  async (c) => {
    try {
      const userId = await getAuthenticatedUserId(c);
      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

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
      let bookmarkData;
      try {
        bookmarkData = JSON.parse(fileContent);
      } catch (error) {
        return c.json(
          {
            error:
              "Invalid file format. Please upload a Chrome or Brave bookmark file.",
          },
          400,
        );
      }

      // Import bookmarks using the service
      const { importBookmarkFile } = await import("@/lib/services/bookmarks");
      const result = await importBookmarkFile(userId, bookmarkData);

      return c.json({
        message: "Bookmarks imported successfully",
        imported: result.imported,
        queued: result.queued,
        errors: result.errors,
      });
    } catch (error) {
      logger.error("Error importing bookmarks:", error);
      return c.json({ error: "Failed to import bookmarks" }, 500);
    }
  },
);
