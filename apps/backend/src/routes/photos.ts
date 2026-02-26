import { fileTypeFromBuffer } from "file-type";
import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";
import {
  // CRUD functions
  countPhotos,
  createPhoto,
  deletePhoto,
  extractAndGeocode,
  findPhotos,
  getAllPhotos,
  getAnalysisStream,
  getContentStream,
  getConvertedStream,
  getOriginalStream,
  getPhotoById,
  getThumbnailStream,
  // Stream functions (return streams directly)
  getViewStream,
  reprocessPhoto,
  updatePhotoMetadata,
} from "../lib/services/photos.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import {
  PartialPhotoSchema,
  PhotoMetadataSchema,
  PhotoSchema,
  PhotoSearchParamsSchema,
} from "../schemas/photos-params.js";
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
} from "../schemas/photos-routes.js";
import { PHOTO_MIMES } from "../types/mime-types.js";
import { parseSearchFields } from "../lib/search-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("photos");

export const photosRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/photos - Get all photos or search photos
photosRoutes.get(
  "/",
  describeRoute(getPhotosRouteDescription),
  withAuth(async (c, userId) => {
    const queryParams = c.req.query();

    // If no search parameters, return all photos
    if (Object.keys(queryParams).length === 0) {
      const photos = await getAllPhotos(userId);
      return c.json({
        items: photos,
        totalCount: photos.length,
        limit: photos.length,
        offset: 0,
      });
    }

    // Parse and validate search parameters
    const params = PhotoSearchParamsSchema.parse({
      text: queryParams.text || undefined,
      tags: queryParams.tags || undefined,
      startDate: queryParams.startDate || undefined,
      endDate: queryParams.endDate || undefined,
      limit: queryParams.limit || 50,
    });

    const { tags, startDate, endDate } = parseSearchFields(params);

    const photos = await findPhotos({
      userId,
      tags,
      startDate,
      endDate,
      limit: params.limit,
    });

    const totalCount = await countPhotos({
      userId,
      tags,
      startDate,
      endDate,
    });

    return c.json({
      items: photos,
      totalCount,
      limit: params.limit,
      offset: 0,
    });
  }, logger),
);

// POST /api/photos - Create a new photo (file upload)
photosRoutes.post(
  "/",
  describeRoute(postPhotosRouteDescription),
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
  }, logger),
);

// GET /api/photos/:id - Get a specific photo by ID
photosRoutes.get(
  "/:id",
  describeRoute(getPhotoByIdRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const photo = await getPhotoById(id, userId);

    if (!photo) {
      throw new NotFoundError("Photo");
    }

    return c.json(photo);
  }, logger),
);

// PUT /api/photos/:id - Update a photo (full update)
photosRoutes.put(
  "/:id",
  describeRoute(putPhotoRouteDescription),
  zValidator("json", PhotoSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");

    const updatedPhoto = await updatePhotoMetadata(id, validatedData, userId);

    if (!updatedPhoto) {
      throw new NotFoundError("Photo");
    }

    return c.json(updatedPhoto);
  }, logger),
);

// PATCH /api/photos/:id - Update a photo (partial update)
photosRoutes.patch(
  "/:id",
  describeRoute(patchPhotoRouteDescription),
  zValidator("json", PartialPhotoSchema),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");

    const updatedPhoto = await updatePhotoMetadata(id, validatedData, userId);

    if (!updatedPhoto) {
      throw new NotFoundError("Photo");
    }

    return c.json(updatedPhoto);
  }, logger),
);

// DELETE /api/photos/:id - Delete a photo
photosRoutes.delete(
  "/:id",
  describeRoute(deletePhotoRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");

    // Parse the optional deleteStorage query parameter (defaults to true)
    const deleteStorageParam = c.req.query("deleteStorage");
    const deleteStorage = deleteStorageParam !== "false";

    await deletePhoto(id, userId, deleteStorage);
    return new Response(null, { status: 204 });
  }, logger),
);

// GET /api/photos/:id/view - Serve the photo file for viewing
photosRoutes.get(
  "/:id/view",
  describeRoute(getPhotoViewRouteDescription),
  withAuth(async (c, userId) => {
    const photoId = c.req.param("id");
    const { stream, metadata } = await getViewStream(photoId, userId);

    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType);
    headers.set("Content-Length", String(metadata.size));
    headers.set("Cache-Control", "private, max-age=3600");

    return new Response(stream, { status: 200, headers });
  }, logger),
);

// GET /api/photos/:id/thumbnail - Serve the photo thumbnail
photosRoutes.get(
  "/:id/thumbnail",
  describeRoute(getPhotoThumbnailRouteDescription),
  withAuth(async (c, userId) => {
    const photoId = c.req.param("id");
    const { stream, metadata } = await getThumbnailStream(photoId, userId);

    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType);
    headers.set("Content-Length", String(metadata.size));
    headers.set("Cache-Control", "public, max-age=86400");

    return new Response(stream, { status: 200, headers });
  }, logger),
);

// GET /api/photos/:id/analysis - Serve the AI analysis JSON file
photosRoutes.get(
  "/:id/analysis",
  describeRoute(getPhotoAnalysisRouteDescription),
  withAuth(async (c, userId) => {
    const photoId = c.req.param("id");
    const { stream, metadata, filename } = await getAnalysisStream(
      photoId,
      userId,
    );

    const headers = new Headers();
    headers.set("Content-Type", `${metadata.contentType}; charset=utf-8`);
    headers.set("Content-Length", String(metadata.size));
    // Disable caching since analysis can be updated when photos are reprocessed
    headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");

    // Check if inline viewing is requested
    const viewParam = c.req.query("view");
    const isInlineView = viewParam === "inline";

    if (isInlineView) {
      headers.set("Content-Disposition", `inline; filename="${filename}"`);
    } else {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
    }

    return new Response(stream, { status: 200, headers });
  }, logger),
);

// GET /api/photos/:id/original - Serve the original photo file
photosRoutes.get(
  "/:id/original",
  withAuth(async (c, userId) => {
    const photoId = c.req.param("id");
    const { stream, metadata, filename } = await getOriginalStream(
      photoId,
      userId,
    );

    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType);
    headers.set("Content-Length", String(metadata.size));
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Content-Disposition", `inline; filename="${filename}"`);

    return new Response(stream, { status: 200, headers });
  }, logger),
);

// GET /api/photos/:id/converted - Serve the converted JPG file
photosRoutes.get(
  "/:id/converted",
  withAuth(async (c, userId) => {
    const photoId = c.req.param("id");
    const { stream, metadata, filename } = await getConvertedStream(
      photoId,
      userId,
    );

    const headers = new Headers();
    headers.set("Content-Type", metadata.contentType);
    headers.set("Content-Length", String(metadata.size));
    headers.set("Cache-Control", "private, max-age=3600");
    headers.set("Content-Disposition", `inline; filename="${filename}"`);

    return new Response(stream, { status: 200, headers });
  }, logger),
);

// GET /api/photos/:id/content - Serve the content markdown file
photosRoutes.get(
  "/:id/content",
  describeRoute(getPhotoContentRouteDescription),
  withAuth(async (c, userId) => {
    const photoId = c.req.param("id");
    const { stream, metadata, filename } = await getContentStream(
      photoId,
      userId,
    );

    const headers = new Headers();
    headers.set("Content-Type", `${metadata.contentType}; charset=utf-8`);
    headers.set("Content-Length", String(metadata.size));
    headers.set("Cache-Control", "private, max-age=3600");

    // Check if inline viewing is requested
    const viewParam = c.req.query("view");
    const isInlineView = viewParam === "inline";

    if (isInlineView) {
      headers.set("Content-Disposition", `inline; filename="${filename}"`);
    } else {
      headers.set(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
    }

    return new Response(stream, { status: 200, headers });
  }, logger),
);

// Common endpoints: PATCH review/flag/pin + POST reprocess
registerCommonEndpoints(photosRoutes, {
  resourceName: "Photo",
  idKeyName: "photoId",
  updateFn: updatePhotoMetadata,
  reprocessFn: reprocessPhoto,
  routeDescriptions: {
    review: patchPhotoReviewRouteDescription,
    flag: patchPhotoFlagRouteDescription,
    pin: patchPhotoPinRouteDescription,
  },
  logger,
});
