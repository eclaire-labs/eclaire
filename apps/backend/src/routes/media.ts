import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import { NotFoundError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import { parseDeleteStorage, parseSearchFields } from "../lib/search-params.js";
import {
  createMedia,
  deleteMedia,
  findMediaPaginated,
  getAnalysisStream,
  getContentStream,
  getMediaById,
  getMediaStream,
  getThumbnailStream,
  reprocessMedia,
  updateMedia,
} from "../lib/services/media.js";
import { principalCaller } from "../lib/services/types.js";
import {
  detectAndVerifyMimeType,
  parseUploadMetadata,
} from "../lib/upload-helpers.js";
import { withAuth } from "../middleware/with-auth.js";
// Import schemas
import {
  MediaMetadataSchema,
  MediaSchema,
  MediaSearchParamsSchema,
  PartialMediaSchema,
} from "../schemas/media-params.js";
// Import route descriptions
import {
  deleteMediaRouteDescription,
  getMediaAnalysisRouteDescription,
  getMediaByIdRouteDescription,
  getMediaContentRouteDescription,
  getMediaRouteDescription,
  getMediaStreamRouteDescription,
  getMediaThumbnailRouteDescription,
  patchMediaFlagRouteDescription,
  patchMediaPinRouteDescription,
  patchMediaReviewRouteDescription,
  patchMediaRouteDescription,
  postMediaRouteDescription,
  putMediaRouteDescription,
} from "../schemas/media-routes.js";
import { MEDIA_AUDIO_MIMES } from "../types/mime-types.js";
import type { RouteVariables } from "../types/route-variables.js";
import { createAssetResponse } from "./asset-response.js";
import { registerCommonEndpoints } from "./shared-endpoints.js";

const logger = createChildLogger("media");

export const mediaRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/media - Get all media or search media
mediaRoutes.get(
  "/",
  describeRoute(getMediaRouteDescription),
  zValidator("query", MediaSearchParamsSchema),
  withAuth(async (c, userId) => {
    const params = c.req.valid("query");
    const { tags, startDate, endDate, dueDateStart, dueDateEnd } =
      parseSearchFields(params);

    const result = await findMediaPaginated({
      userId,
      text: params.text,
      tags,
      startDate,
      endDate,
      mediaType: params.mediaType,
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

// POST /api/media - Create a new media item (file upload)
mediaRoutes.post(
  "/",
  describeRoute(postMediaRouteDescription),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
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
    if (!MEDIA_AUDIO_MIMES.includes(finalMimeType)) {
      return c.json(
        {
          error: `Invalid content type for media. Received ${finalMimeType}, expected an audio type.`,
        },
        400,
      );
    }

    const metadata = MediaMetadataSchema.parse(
      parseUploadMetadata(formData.get("metadata")),
    );

    const newMedia = await createMedia(
      {
        content: contentBuffer,
        metadata: {
          ...metadata,
          title: metadata.title || contentPart.name || "Untitled Media",
          originalFilename: metadata.originalFilename || contentPart.name,
        },
        originalMimeType: finalMimeType,
        userAgent: c.req.header("User-Agent") || "",
      },
      userId,
      caller,
    );
    return c.json(newMedia, 201);
  }, logger),
);

// GET /api/media/:id - Get a specific media item by ID
mediaRoutes.get(
  "/:id",
  describeRoute(getMediaByIdRouteDescription),
  withAuth(async (c, userId) => {
    const id = c.req.param("id");
    const media = await getMediaById(id, userId);

    if (!media) {
      throw new NotFoundError("Media");
    }

    return c.json(media);
  }, logger),
);

// PUT /api/media/:id - Update a media item (full update)
mediaRoutes.put(
  "/:id",
  describeRoute(putMediaRouteDescription),
  zValidator("json", MediaSchema),
  withAuth(async (c, _userId, principal) => {
    const caller = principalCaller(principal);
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");

    const updatedMedia = await updateMedia(id, validatedData, caller);

    if (!updatedMedia) {
      throw new NotFoundError("Media");
    }

    return c.json(updatedMedia);
  }, logger),
);

// PATCH /api/media/:id - Update a media item (partial update)
mediaRoutes.patch(
  "/:id",
  describeRoute(patchMediaRouteDescription),
  zValidator("json", PartialMediaSchema),
  withAuth(async (c, _userId, principal) => {
    const caller = principalCaller(principal);
    const id = c.req.param("id");
    const validatedData = c.req.valid("json");

    const updatedMedia = await updateMedia(id, validatedData, caller);

    if (!updatedMedia) {
      throw new NotFoundError("Media");
    }

    return c.json(updatedMedia);
  }, logger),
);

// DELETE /api/media/:id - Delete a media item
mediaRoutes.delete(
  "/:id",
  describeRoute(deleteMediaRouteDescription),
  withAuth(async (c, userId, principal) => {
    const caller = principalCaller(principal);
    const id = c.req.param("id");
    await deleteMedia(id, userId, caller, parseDeleteStorage(c));
    return new Response(null, { status: 204 });
  }, logger),
);

// GET /api/media/:id/stream - Serve the original media file with Content-Type
mediaRoutes.get(
  "/:id/stream",
  describeRoute(getMediaStreamRouteDescription),
  withAuth(async (c, userId) => {
    const { stream, metadata, filename } = await getMediaStream(
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

// GET /api/media/:id/thumbnail - Serve the waveform thumbnail
mediaRoutes.get(
  "/:id/thumbnail",
  describeRoute(getMediaThumbnailRouteDescription),
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

// GET /api/media/:id/analysis - Serve the extracted analysis JSON
mediaRoutes.get(
  "/:id/analysis",
  describeRoute(getMediaAnalysisRouteDescription),
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

// GET /api/media/:id/content - Serve the extracted markdown content
mediaRoutes.get(
  "/:id/content",
  describeRoute(getMediaContentRouteDescription),
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
registerCommonEndpoints(mediaRoutes, {
  resourceName: "Media",
  idKeyName: "mediaId",
  updateFn: updateMedia,
  reprocessFn: reprocessMedia,
  routeDescriptions: {
    review: patchMediaReviewRouteDescription,
    flag: patchMediaFlagRouteDescription,
    pin: patchMediaPinRouteDescription,
  },
  logger,
});
