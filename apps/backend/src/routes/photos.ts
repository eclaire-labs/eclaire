import { and, eq } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { validator as zValidator } from "hono-openapi";
import z from "zod/v4";
import { db, schema } from "@/db";
import { getAuthenticatedUserId } from "@/lib/auth-utils";

const { photos } = schema;
import {
  countPhotos,
  createPhoto,
  deletePhoto,
  extractAndGeocode,
  findPhotos,
  getAllPhotos,
  getPhotoById,
  getPhotoStreamDetailsForViewing,
  getThumbnailStreamDetails,
  reprocessPhoto,
  updatePhotoMetadata,
} from "@/lib/services/photos";
import { objectStorage } from "@/lib/storage";
// Import schemas
import {
  PartialPhotoSchema,
  PhotoMetadataSchema,
  PhotoSchema,
  PhotoSearchParamsSchema,
} from "@/schemas/photos-params";
// Import route descriptions
import {
  deletePhotoRouteDescription,
  getPhotoAnalysisRouteDescription,
  getPhotoByIdRouteDescription,
  getPhotoContentRouteDescription,
  getPhotosRouteDescription,
  getPhotoThumbnailRouteDescription,
  getPhotoViewRouteDescription,
  patchPhotoFlagRouteDescription,
  patchPhotoPinRouteDescription,
  patchPhotoReviewRouteDescription,
  patchPhotoRouteDescription,
  postPhotosRouteDescription,
  putPhotoRouteDescription,
} from "@/schemas/photos-routes";
import { PHOTO_MIMES } from "@/types/mime-types";
import type { RouteVariables } from "@/types/route-variables";
import { createChildLogger } from "../lib/logger";

const logger = createChildLogger("photos");

export const photosRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/photos - Get all photos or search photos
photosRoutes.get("/", describeRoute(getPhotosRouteDescription), async (c) => {
  try {
    const userId = await getAuthenticatedUserId(c);
    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const queryParams = c.req.query();

    // If no search parameters, return all photos
    if (Object.keys(queryParams).length === 0) {
      const photos = await getAllPhotos(userId);
      return c.json({
        photos,
        totalCount: photos.length,
        limit: photos.length,
      });
    }

    // Parse and validate search parameters
    try {
      const params = PhotoSearchParamsSchema.parse({
        text: queryParams.text || undefined,
        tags: queryParams.tags || undefined,
        startDate: queryParams.startDate || undefined,
        endDate: queryParams.endDate || undefined,
        limit: queryParams.limit || 50,
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

      // Search photos with provided criteria
      const photos = await findPhotos(
        userId,
        tagsList,
        startDate,
        endDate,
        undefined, // locationCity parameter
        "createdAt", // dateField parameter
        params.limit,
      );

      // Get total count for pagination
      const totalCount = await countPhotos(
        userId,
        tagsList,
        startDate,
        endDate,
        undefined, // locationCity parameter
        "createdAt", // dateField parameter
      );

      return c.json({
        photos,
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
      "Error getting photos:",
    );
    return c.json({ error: "Failed to fetch photos" }, 500);
  }
});

// POST /api/photos - Create a new photo (file upload)
photosRoutes.post("/", describeRoute(postPhotosRouteDescription), async (c) => {
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

    // Special handling for SVG files that might be detected as application/xml
    let finalMimeType = verifiedMimeType;
    if (
      (verifiedMimeType === "application/xml" ||
        verifiedMimeType === "text/xml") &&
      contentPart.name
    ) {
      const filename = contentPart.name.toLowerCase();
      if (filename.endsWith(".svg")) {
        finalMimeType = "image/svg+xml";
      }
    }

    // Validate content type for this specific endpoint
    if (!PHOTO_MIMES.includes(finalMimeType)) {
      return c.json(
        {
          error: `Invalid content type for a photo. Received ${finalMimeType}, expected an image type.`,
        },
        400,
      );
    }

    // Parse the raw metadata first (keep all fields for database storage)
    const rawMetadata = JSON.parse((metadataPart as string) || "{}");

    // Then validate only the fields we need for our internal logic
    const validatedMetadata = PhotoMetadataSchema.parse(rawMetadata);

    // Merge: use the raw metadata as base, but overlay our validated fields
    const metadata = { ...rawMetadata, ...validatedMetadata };

    const extractedMetadata = await extractAndGeocode(contentBuffer);

    const servicePayload = {
      content: contentBuffer,
      metadata: {
        ...metadata,
        title: metadata.title || contentPart.name || "Untitled Photo",
        originalFilename: metadata.originalFilename || contentPart.name,
      },
      originalMimeType: finalMimeType, // Use the corrected MIME type
      userAgent: c.req.header("User-Agent") || "",
      extractedMetadata,
    };

    const newPhoto = await createPhoto(servicePayload, userId);
    return c.json(newPhoto, 201);
  } catch (error) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating photo:",
    );

    if (error instanceof z.ZodError) {
      return c.json(
        { error: "Invalid metadata format", details: error.issues },
        400,
      );
    }

    return c.json({ error: "Failed to create photo" }, 500);
  }
});

// GET /api/photos/:id - Get a specific photo by ID
photosRoutes.get(
  "/:id",
  describeRoute(getPhotoByIdRouteDescription),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      try {
        const photo = await getPhotoById(id, userId);

        if (!photo) {
          return c.json({ error: "Photo not found" }, 404);
        }

        return c.json(photo);
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        if (error.name === "ForbiddenError") {
          return c.json({ error: "Access denied" }, 403);
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
        "Error fetching photo:",
      );
      return c.json({ error: "Failed to fetch photo" }, 500);
    }
  },
);

// PUT /api/photos/:id - Update a photo (full update)
photosRoutes.put(
  "/:id",
  describeRoute(putPhotoRouteDescription),
  zValidator("json", PhotoSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      try {
        const updatedPhoto = await updatePhotoMetadata(
          id,
          validatedData,
          userId,
        );

        if (!updatedPhoto) {
          return c.json({ error: "Photo not found" }, 404);
        }

        return c.json(updatedPhoto);
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        if (error.name === "ForbiddenError") {
          return c.json({ error: "Access denied" }, 403);
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
        "Error updating photo:",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.issues },
          400,
        );
      }

      return c.json({ error: "Failed to update photo" }, 500);
    }
  },
);

// PATCH /api/photos/:id - Update a photo (partial update)
photosRoutes.patch(
  "/:id",
  describeRoute(patchPhotoRouteDescription),
  zValidator("json", PartialPhotoSchema),
  async (c) => {
    try {
      const id = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const validatedData = c.req.valid("json");

      try {
        const updatedPhoto = await updatePhotoMetadata(
          id,
          validatedData,
          userId,
        );

        if (!updatedPhoto) {
          return c.json({ error: "Photo not found" }, 404);
        }

        return c.json(updatedPhoto);
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        if (error.name === "ForbiddenError") {
          return c.json({ error: "Access denied" }, 403);
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
        "Error updating photo:",
      );

      if (error instanceof z.ZodError) {
        return c.json(
          { error: "Invalid request data", details: error.issues },
          400,
        );
      }

      return c.json({ error: "Failed to update photo" }, 500);
    }
  },
);

// POST /api/photos/:id/reprocess - Re-process an existing photo
photosRoutes.post("/:id/reprocess", async (c) => {
  try {
    const id = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Parse body for optional force parameter
    const body = await c.req.json().catch(() => ({}));
    const force = body.force === true;

    const result = await reprocessPhoto(id, userId, force);

    if (result.success) {
      return c.json(
        {
          message: "Photo queued for reprocessing successfully",
          photoId: id,
        },
        202,
      ); // 202 Accepted: The request has been accepted for processing
    } else {
      return c.json({ error: result.error }, 400);
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
      "Error reprocessing photo:",
    );
    return c.json({ error: "Failed to reprocess photo" }, 500);
  }
});

// DELETE /api/photos/:id - Delete a photo
photosRoutes.delete(
  "/:id",
  describeRoute(deletePhotoRouteDescription),
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
        await deletePhoto(id, userId, deleteStorage);
        return new Response(null, { status: 204 });
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        if (error.name === "ForbiddenError") {
          return c.json({ error: "Access denied" }, 403);
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
        "Error deleting photo:",
      );
      return c.json({ error: "Failed to delete photo" }, 500);
    }
  },
);

// GET /api/photos/:id/view - Serve the photo file for viewing
photosRoutes.get(
  "/:id/view",
  describeRoute(getPhotoViewRouteDescription),
  async (c) => {
    try {
      const photoId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (!photoId) {
        return c.json({ error: "Photo ID missing" }, 400);
      }

      // Get stream details from the service layer
      const { storageId, mimeType } = await getPhotoStreamDetailsForViewing(
        photoId,
        userId,
      );

      // Get the file stream from ObjectStorage
      const { stream, contentLength } =
        await objectStorage.getStream(storageId);

      // Set response headers
      const headers = new Headers();
      headers.set("Content-Type", mimeType);
      if (contentLength !== undefined) {
        headers.set("Content-Length", String(contentLength));
      }
      headers.set("Cache-Control", "private, max-age=3600");

      // Return the file stream
      return new Response(stream, { status: 200, headers });
    } catch (error: any) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          photoId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          errorCode: error.code,
        },
        "Error serving photo (/view)",
      );

      if (error.name === "NotFoundError") {
        return c.json({ error: error.message }, 404);
      }
      if (error.name === "ForbiddenError") {
        return c.json({ error: error.message }, 403);
      }
      if (error.code === "ENOENT") {
        return c.json({ error: "File not found in storage" }, 404);
      }

      return c.json({ error: "Internal Server Error" }, 500);
    }
  },
);

// GET /api/photos/:id/thumbnail - Serve the photo thumbnail
photosRoutes.get(
  "/:id/thumbnail",
  describeRoute(getPhotoThumbnailRouteDescription),
  async (c) => {
    try {
      const photoId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (!photoId) {
        return c.json({ error: "Photo ID missing" }, 400);
      }

      // Get thumbnail stream details from the service layer
      const { storageId, mimeType } = await getThumbnailStreamDetails(
        photoId,
        userId,
      );

      // Get the thumbnail stream from ObjectStorage
      const { stream, contentLength } =
        await objectStorage.getStream(storageId);

      // Set response headers
      const headers = new Headers();
      headers.set("Content-Type", mimeType);
      if (contentLength !== undefined) {
        headers.set("Content-Length", String(contentLength));
      }
      headers.set("Cache-Control", "public, max-age=86400");

      // Return the thumbnail stream
      return new Response(stream, { status: 200, headers });
    } catch (error: any) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          photoId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          errorCode: error.code,
        },
        "Error serving thumbnail for photo",
      );

      if (error.name === "NotFoundError") {
        return c.json({ error: error.message }, 404);
      }
      if (error.name === "ForbiddenError") {
        return c.json({ error: error.message }, 403);
      }
      if (error.code === "ENOENT") {
        return c.json({ error: "Thumbnail file not found in storage" }, 404);
      }

      return c.json({ error: "Internal Server Error" }, 500);
    }
  },
);

// GET /api/photos/:id/analysis - Serve the AI analysis JSON file
photosRoutes.get(
  "/:id/analysis",
  describeRoute(getPhotoAnalysisRouteDescription),
  async (c) => {
    try {
      const photoId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (!photoId) {
        return c.json({ error: "Photo ID missing" }, 400);
      }

      // Verify photo ownership
      const photo = await db.query.photos.findFirst({
        columns: { id: true, userId: true },
        where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
      });

      if (!photo) {
        return c.json({ error: "Photo not found or access denied" }, 404);
      }

      try {
        // Try to get the extracted analysis file (created by the worker)
        const analysisStorageId = `${userId}/photos/${photoId}/extracted.json`;
        const { stream, contentLength } =
          await objectStorage.getStream(analysisStorageId);

        // Set response headers
        const headers = new Headers();
        headers.set("Content-Type", "application/json; charset=utf-8");
        if (contentLength !== undefined) {
          headers.set("Content-Length", String(contentLength));
        }
        // Disable caching since analysis can be updated when photos are reprocessed
        headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
        headers.set("Pragma", "no-cache");
        headers.set("Expires", "0");

        // Check if inline viewing is requested
        const viewParam = c.req.query("view");
        const isInlineView = viewParam === "inline";

        const filename = `${photo.id}-analysis.json`;
        if (isInlineView) {
          headers.set("Content-Disposition", `inline; filename="${filename}"`);
        } else {
          headers.set(
            "Content-Disposition",
            `attachment; filename="${filename}"`,
          );
        }

        return new Response(stream, { status: 200, headers });
      } catch (storageError: any) {
        if (storageError.code === "ENOENT") {
          return c.json(
            { error: "AI analysis not found or not yet generated" },
            404,
          );
        }
        throw storageError;
      }
    } catch (error: any) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          photoId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          errorCode: error.code,
        },
        "Error serving AI analysis for photo",
      );

      return c.json({ error: "Internal Server Error" }, 500);
    }
  },
);

// GET /api/photos/:id/original - Serve the original photo file
photosRoutes.get("/:id/original", async (c) => {
  try {
    const photoId = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!photoId) {
      return c.json({ error: "Photo ID missing" }, 400);
    }

    // Get the photo details to access original storage ID
    const photo = await db.query.photos.findFirst({
      columns: {
        id: true,
        userId: true,
        storageId: true,
        mimeType: true,
        originalFilename: true,
      },
      where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
    });

    if (!photo) {
      return c.json({ error: "Photo not found or access denied" }, 404);
    }

    if (!photo.storageId) {
      return c.json({ error: "Original file not found" }, 404);
    }

    // Get the file stream from ObjectStorage
    const { stream, contentLength } = await objectStorage.getStream(
      photo.storageId,
    );

    // Set response headers
    const headers = new Headers();
    headers.set("Content-Type", photo.mimeType || "application/octet-stream");
    if (contentLength !== undefined) {
      headers.set("Content-Length", String(contentLength));
    }
    headers.set("Cache-Control", "private, max-age=3600");

    // Set filename for download
    const filename = photo.originalFilename || `${photo.id}-original`;
    headers.set("Content-Disposition", `inline; filename="${filename}"`);

    return new Response(stream, { status: 200, headers });
  } catch (error: any) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        photoId: c.req.param("id"),
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        errorCode: error.code,
      },
      "Error serving original photo",
    );

    if (error.code === "ENOENT") {
      return c.json({ error: "Original file not found in storage" }, 404);
    }

    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// GET /api/photos/:id/converted - Serve the converted JPG file
photosRoutes.get("/:id/converted", async (c) => {
  try {
    const photoId = c.req.param("id");
    const userId = await getAuthenticatedUserId(c);

    if (!userId) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!photoId) {
      return c.json({ error: "Photo ID missing" }, 400);
    }

    // Get the photo details to access converted storage ID
    const photo = await db.query.photos.findFirst({
      columns: {
        id: true,
        userId: true,
        convertedJpgStorageId: true,
        originalFilename: true,
      },
      where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
    });

    if (!photo) {
      return c.json({ error: "Photo not found or access denied" }, 404);
    }

    if (!photo.convertedJpgStorageId) {
      return c.json({ error: "Converted JPG file not available" }, 404);
    }

    // Get the file stream from ObjectStorage
    const { stream, contentLength } = await objectStorage.getStream(
      photo.convertedJpgStorageId,
    );

    // Set response headers
    const headers = new Headers();
    headers.set("Content-Type", "image/jpeg");
    if (contentLength !== undefined) {
      headers.set("Content-Length", String(contentLength));
    }
    headers.set("Cache-Control", "private, max-age=3600");

    // Set filename for download
    const baseFilename =
      photo.originalFilename?.replace(/\.[^/.]+$/, "") || photo.id;
    const filename = `${baseFilename}-converted.jpg`;
    headers.set("Content-Disposition", `inline; filename="${filename}"`);

    return new Response(stream, { status: 200, headers });
  } catch (error: any) {
    const requestId = c.get("requestId");
    logger.error(
      {
        requestId,
        photoId: c.req.param("id"),
        userId: await getAuthenticatedUserId(c),
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        errorCode: error.code,
      },
      "Error serving converted photo",
    );

    if (error.code === "ENOENT") {
      return c.json({ error: "Converted file not found in storage" }, 404);
    }

    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// GET /api/photos/:id/content - Serve the content markdown file
photosRoutes.get(
  "/:id/content",
  describeRoute(getPhotoContentRouteDescription),
  async (c) => {
    try {
      const photoId = c.req.param("id");
      const userId = await getAuthenticatedUserId(c);

      if (!userId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      if (!photoId) {
        return c.json({ error: "Photo ID missing" }, 400);
      }

      // Verify photo ownership
      const photo = await db.query.photos.findFirst({
        columns: { id: true, userId: true, title: true },
        where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
      });

      if (!photo) {
        return c.json({ error: "Photo not found or access denied" }, 404);
      }

      try {
        // Try to get the content markdown file
        const contentStorageId = `${userId}/photos/${photoId}/content.md`;
        const { stream, contentLength } =
          await objectStorage.getStream(contentStorageId);

        // Set response headers
        const headers = new Headers();
        headers.set("Content-Type", "text/markdown; charset=utf-8");
        if (contentLength !== undefined) {
          headers.set("Content-Length", String(contentLength));
        }
        headers.set("Cache-Control", "private, max-age=3600");

        // Check if inline viewing is requested
        const viewParam = c.req.query("view");
        const isInlineView = viewParam === "inline";

        const filename = `${photo.title || photo.id}-content.md`;
        if (isInlineView) {
          headers.set("Content-Disposition", `inline; filename="${filename}"`);
        } else {
          headers.set(
            "Content-Disposition",
            `attachment; filename="${filename}"`,
          );
        }

        return new Response(stream, { status: 200, headers });
      } catch (storageError: any) {
        if (storageError.code === "ENOENT") {
          return c.json(
            { error: "Content not found or not yet generated" },
            404,
          );
        }
        throw storageError;
      }
    } catch (error: any) {
      const requestId = c.get("requestId");
      logger.error(
        {
          requestId,
          photoId: c.req.param("id"),
          userId: await getAuthenticatedUserId(c),
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          errorCode: error.code,
        },
        "Error serving content for photo",
      );

      return c.json({ error: "Internal Server Error" }, 500);
    }
  },
);

// PATCH /api/photos/:id/review - Update review status
photosRoutes.patch(
  "/:id/review",
  describeRoute(patchPhotoReviewRouteDescription),
  zValidator(
    "json",
    z.object({
      reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
        description: "New review status for the photo",
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
        const updatedPhoto = await updatePhotoMetadata(
          id,
          { reviewStatus },
          userId,
        );

        if (!updatedPhoto) {
          return c.json({ error: "Photo not found" }, 404);
        }

        return c.json(updatedPhoto);
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating photo review status:", error);
      return c.json({ error: "Failed to update photo review status" }, 500);
    }
  },
);

// PATCH /api/photos/:id/flag - Update flag color
photosRoutes.patch(
  "/:id/flag",
  describeRoute(patchPhotoFlagRouteDescription),
  zValidator(
    "json",
    z.object({
      flagColor: z
        .enum(["red", "yellow", "orange", "green", "blue"])
        .nullable()
        .meta({
          description: "Flag color for the photo (null to remove flag)",
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
        const updatedPhoto = await updatePhotoMetadata(
          id,
          { flagColor },
          userId,
        );

        if (!updatedPhoto) {
          return c.json({ error: "Photo not found" }, 404);
        }

        return c.json(updatedPhoto);
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating photo flag:", error);
      return c.json({ error: "Failed to update photo flag" }, 500);
    }
  },
);

// PATCH /api/photos/:id/pin - Toggle pin status
photosRoutes.patch(
  "/:id/pin",
  describeRoute(patchPhotoPinRouteDescription),
  zValidator(
    "json",
    z.object({
      isPinned: z.boolean().meta({
        description: "Whether to pin or unpin the photo",
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
        const updatedPhoto = await updatePhotoMetadata(
          id,
          { isPinned },
          userId,
        );

        if (!updatedPhoto) {
          return c.json({ error: "Photo not found" }, 404);
        }

        return c.json(updatedPhoto);
      } catch (error: any) {
        if (error.name === "NotFoundError") {
          return c.json({ error: "Photo not found" }, 404);
        }
        throw error;
      }
    } catch (error) {
      logger.error("Error updating photo pin status:", error);
      return c.json({ error: "Failed to update photo pin status" }, 500);
    }
  },
);
