// schemas/media-routes.ts
import { resolver } from "hono-openapi";
import {
  commonErrors,
  commonErrorsWithValidation,
  flagColorUpdateSchema,
  isPinnedUpdateSchema,
  notFoundError,
  requestBodyResolver,
  reviewStatusUpdateSchema,
} from "./common.js";

// Request schemas for review/flag/pin status updates
export const MediaReviewUpdateSchema = reviewStatusUpdateSchema(
  "media",
  "MediaReviewUpdate",
);
export const MediaFlagUpdateSchema = flagColorUpdateSchema(
  "media",
  "MediaFlagUpdate",
);
export const MediaPinUpdateSchema = isPinnedUpdateSchema(
  "media",
  "MediaPinUpdate",
);
import {
  MediaSchema,
  MediaImportSchema,
  PartialMediaSchema,
} from "./media-params.js";
import {
  CreatedMediaResponseSchema,
  MediaFileNotFoundSchema,
  MediaNotFoundSchema,
  MediaResponseSchema,
  MediaListResponseSchema,
} from "./media-responses.js";

// GET /api/media - Get all media or search media
export const getMediaRouteDescription = {
  tags: ["Media"],
  summary: "Get all media or search media",
  description:
    "Retrieve all media for the authenticated user, or search media with optional filters",
  responses: {
    200: {
      description: "List of media or search results",
      content: {
        "application/json": {
          schema: resolver(MediaListResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
  },
};

// POST /api/media - Upload new media
export const postMediaRouteDescription = {
  tags: ["Media"],
  summary: "Upload new media",
  description:
    "Upload a new media file (audio or video) with optional metadata. The file will be processed and metadata extracted.",
  requestBody: {
    description: "Media file with metadata",
    content: {
      "multipart/form-data": {
        schema: {
          type: "object" as const,
          properties: {
            content: {
              type: "string" as const,
              format: "binary" as const,
              description: "Media file (MP3, WAV, MP4, WebM, etc.)",
            },
            metadata: {
              type: "string" as const,
              description: "JSON string containing media metadata",
              example:
                '{"title": "My Recording", "description": "Interview recording", "tags": ["interview", "meeting"], "reviewStatus": "pending"}',
            },
          },
          required: ["content" as const],
        },
      },
    },
  },
  responses: {
    201: {
      description: "Media uploaded successfully",
      content: {
        "application/json": {
          schema: resolver(CreatedMediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
  },
};

// POST /api/media/import - Import media from URL
export const postMediaImportRouteDescription = {
  tags: ["Media"],
  summary: "Import media from URL",
  description:
    "Import media from a URL (YouTube, Vimeo, SoundCloud, direct file link, etc.). The media will be downloaded and processed in the background.",
  requestBody: {
    description: "URL and optional metadata",
    content: {
      "application/json": {
        schema: requestBodyResolver(MediaImportSchema),
      },
    },
  },
  responses: {
    201: {
      description: "Media import started",
      content: {
        "application/json": {
          schema: resolver(CreatedMediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
  },
};

// GET /api/media/:id - Get a specific media item
export const getMediaByIdRouteDescription = {
  tags: ["Media"],
  summary: "Get media by ID",
  description: "Retrieve a specific media item by its unique identifier",
  responses: {
    200: {
      description: "Media details",
      content: {
        "application/json": {
          schema: resolver(MediaResponseSchema),
        },
      },
    },
    ...commonErrors,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};

// PUT /api/media/:id - Update a media item (full)
export const putMediaRouteDescription = {
  tags: ["Media"],
  summary: "Update media metadata (full)",
  description:
    "Completely update a media item's metadata with new data. All fields are required.",
  requestBody: {
    description: "Complete media metadata",
    content: {
      "application/json": {
        schema: requestBodyResolver(MediaSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Media updated successfully",
      content: {
        "application/json": {
          schema: resolver(MediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};

// PATCH /api/media/:id - Update a media item (partial)
export const patchMediaRouteDescription = {
  tags: ["Media"],
  summary: "Update media metadata (partial)",
  description:
    "Partially update a media item's metadata. Only provided fields will be updated.",
  requestBody: {
    description: "Partial media metadata",
    content: {
      "application/json": {
        schema: requestBodyResolver(PartialMediaSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Media updated successfully",
      content: {
        "application/json": {
          schema: resolver(MediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};

// DELETE /api/media/:id - Delete a media item
export const deleteMediaRouteDescription = {
  tags: ["Media"],
  summary: "Delete media",
  description:
    "Delete a media item from the database and optionally from storage. By default, both database entries and storage files are deleted.",
  parameters: [
    {
      name: "deleteStorage",
      in: "query" as const,
      description:
        "Whether to delete associated storage files. Defaults to true.",
      required: false,
      schema: {
        type: "boolean" as const,
        default: true,
      },
    },
  ],
  responses: {
    204: {
      description: "Media deleted successfully",
    },
    ...commonErrors,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};

// GET /api/media/:id/stream - Stream media file
export const getMediaStreamRouteDescription = {
  tags: ["Media Assets"],
  summary: "Stream media file",
  description:
    "Retrieve the original media file for streaming. Supports range requests for audio/video playback.",
  responses: {
    200: {
      description: "Media file",
      content: {
        "audio/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
        "video/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    ...commonErrors,
    404: notFoundError("Media file", MediaFileNotFoundSchema),
  },
};

// GET /api/media/:id/thumbnail - Get media thumbnail
export const getMediaThumbnailRouteDescription = {
  tags: ["Media Assets"],
  summary: "Get media thumbnail",
  description: "Retrieve the thumbnail image for a media item",
  responses: {
    200: {
      description: "Media thumbnail file",
      content: {
        "image/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    ...commonErrors,
    404: notFoundError("Thumbnail", MediaFileNotFoundSchema),
  },
};

// GET /api/media/:id/analysis - Get AI analysis JSON
export const getMediaAnalysisRouteDescription = {
  tags: ["Media Assets"],
  summary: "Get AI analysis",
  description: "Retrieve the AI analysis JSON file for a media item",
  responses: {
    200: {
      description: "AI analysis JSON file",
      content: {
        "application/json": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    ...commonErrors,
    404: notFoundError("AI analysis", MediaFileNotFoundSchema),
  },
};

// GET /api/media/:id/content - Get content markdown
export const getMediaContentRouteDescription = {
  tags: ["Media Assets"],
  summary: "Get analysis content",
  description: "Retrieve the markdown content report for a media item",
  responses: {
    200: {
      description: "Analysis content markdown file",
      content: {
        "text/markdown": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    ...commonErrors,
    404: notFoundError("Content", MediaFileNotFoundSchema),
  },
};

// PATCH /api/media/:id/review - Update media review status
export const patchMediaReviewRouteDescription = {
  tags: ["Media"],
  summary: "Update media review status",
  description: "Update the review status of a media item",
  requestBody: {
    description: "Review status update data",
    content: {
      "application/json": {
        schema: requestBodyResolver(MediaReviewUpdateSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Media review status updated successfully",
      content: {
        "application/json": {
          schema: resolver(MediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};

// PATCH /api/media/:id/flag - Update media flag color
export const patchMediaFlagRouteDescription = {
  tags: ["Media"],
  summary: "Update media flag color",
  description: "Update the flag color of a media item",
  requestBody: {
    description: "Flag color update data",
    content: {
      "application/json": {
        schema: requestBodyResolver(MediaFlagUpdateSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Media flag color updated successfully",
      content: {
        "application/json": {
          schema: resolver(MediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};

// PATCH /api/media/:id/pin - Update media pin status
export const patchMediaPinRouteDescription = {
  tags: ["Media"],
  summary: "Update media pin status",
  description: "Pin or unpin a media item",
  requestBody: {
    description: "Pin status update data",
    content: {
      "application/json": {
        schema: requestBodyResolver(MediaPinUpdateSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Media pin status updated successfully",
      content: {
        "application/json": {
          schema: resolver(MediaResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Media", MediaNotFoundSchema),
  },
};
