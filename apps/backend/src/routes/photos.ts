import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { parseDeleteStorage, parseSearchFields } from "../lib/search-params.js";
import {
  createPhoto,
  deletePhoto,
  extractAndGeocode,
  findPhotosPaginated,
  getAnalysisStream,
  getContentStream,
  getConvertedStream,
  getOriginalStream,
  getPhotoById,
  getThumbnailStream,
  getViewStream,
  reprocessPhoto,
  updatePhotoMetadata,
} from "../lib/services/photos.js";
import {
  detectAndVerifyMimeType,
  parseUploadMetadata,
} from "../lib/upload-helpers.js";
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
import type { RouteVariables } from "../types/route-variables.js";
import { createAssetResponse } from "./asset-response.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";

const logger = createChildLogger("photos");

export const photosRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/photos - Get all photos or search photos
photosRoutes.get(
  "/",
  describeRoute(getPhotosRouteDescription),
  withAuth(async (c, userId) => {
    const params = PhotoSearchParamsSchema.parse(c.req.query());
    const { tags, startDate, endDate, dueDateStart, dueDateEnd } =
      parseSearchFields(params);

    const result = await findPhotosPaginated({
      userId,
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

// POST /api/photos - Create a new photo (file upload)
photosRoutes.post(
  "/",
  describeRoute(postPhotosRouteDescription),
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
    if (!PHOTO_MIMES.includes(finalMimeType)) {
      return c.json(
        {
          error: `Invalid content type for a photo. Received ${finalMimeType}, expected an image type.`,
        },
        400,
      );
    }

    const metadata = PhotoMetadataSchema.parse(
      parseUploadMetadata(formData.get("metadata")),
    );

    const extractedMetadata = await extractAndGeocode(contentBuffer);

    const newPhoto = await createPhoto(
      {
        content: contentBuffer,
        metadata: {
          ...metadata,
          title: metadata.title || contentPart.name || "Untitled Photo",
          originalFilename: metadata.originalFilename || contentPart.name,
        },
        originalMimeType: finalMimeType,
        userAgent: c.req.header("User-Agent") || "",
        extractedMetadata,
      },
      userId,
      { userId, actor: "user" },
    );
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

    const updatedPhoto = await updatePhotoMetadata(id, validatedData, {
      userId,
      actor: "user",
    });

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

    const updatedPhoto = await updatePhotoMetadata(id, validatedData, {
      userId,
      actor: "user",
    });

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
    await deletePhoto(
      id,
      userId,
      { userId, actor: "user" },
      parseDeleteStorage(c),
    );
    return new Response(null, { status: 204 });
  }, logger),
);

// GET /api/photos/:id/view - Serve the photo file for viewing
photosRoutes.get(
  "/:id/view",
  describeRoute(getPhotoViewRouteDescription),
  withAuth(async (c, userId) => {
    const { stream, metadata } = await getViewStream(c.req.param("id"), userId);
    return createAssetResponse(c, {
      stream,
      contentType: metadata.contentType,
      contentLength: metadata.size,
      cacheControl: "private, max-age=3600",
    });
  }, logger),
);

// GET /api/photos/:id/thumbnail - Serve the photo thumbnail
photosRoutes.get(
  "/:id/thumbnail",
  describeRoute(getPhotoThumbnailRouteDescription),
  withAuth(async (c, userId) => {
    const { stream, metadata } = await getThumbnailStream(
      c.req.param("id"),
      userId,
    );
    return createAssetResponse(c, {
      stream,
      contentType: metadata.contentType,
      contentLength: metadata.size,
      cacheControl: "public, max-age=604800",
    });
  }, logger),
);

// GET /api/photos/:id/analysis - Serve the AI analysis JSON file
photosRoutes.get(
  "/:id/analysis",
  describeRoute(getPhotoAnalysisRouteDescription),
  withAuth(async (c, userId) => {
    const { stream, metadata, filename } = await getAnalysisStream(
      c.req.param("id"),
      userId,
    );
    return createAssetResponse(c, {
      stream,
      contentType: `${metadata.contentType}; charset=utf-8`,
      contentLength: metadata.size,
      cacheControl: "no-cache, no-store, must-revalidate",
      disposition: { type: "auto", filename },
      extraHeaders: { Pragma: "no-cache", Expires: "0" },
    });
  }, logger),
);

// GET /api/photos/:id/original - Serve the original photo file
photosRoutes.get(
  "/:id/original",
  withAuth(async (c, userId) => {
    const { stream, metadata, filename } = await getOriginalStream(
      c.req.param("id"),
      userId,
    );
    return createAssetResponse(c, {
      stream,
      contentType: metadata.contentType,
      contentLength: metadata.size,
      cacheControl: "private, max-age=3600",
      disposition: { type: "auto", filename },
    });
  }, logger),
);

// GET /api/photos/:id/converted - Serve the converted JPG file
photosRoutes.get(
  "/:id/converted",
  withAuth(async (c, userId) => {
    const { stream, metadata, filename } = await getConvertedStream(
      c.req.param("id"),
      userId,
    );
    return createAssetResponse(c, {
      stream,
      contentType: metadata.contentType,
      contentLength: metadata.size,
      cacheControl: "private, max-age=3600",
      disposition: { type: "inline", filename },
    });
  }, logger),
);

// GET /api/photos/:id/content - Serve the content markdown file
photosRoutes.get(
  "/:id/content",
  describeRoute(getPhotoContentRouteDescription),
  withAuth(async (c, userId) => {
    const { stream, metadata, filename } = await getContentStream(
      c.req.param("id"),
      userId,
    );
    return createAssetResponse(c, {
      stream,
      contentType: `${metadata.contentType}; charset=utf-8`,
      contentLength: metadata.size,
      cacheControl: "private, max-age=3600",
      disposition: { type: "auto", filename },
    });
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
