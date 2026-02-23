// schemas/photos-routes.ts
import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import { requestBodyResolver } from "./common.js";
import { PartialPhotoSchema, PhotoSchema } from "./photos-params.js";
import {
  CreatedPhotoResponseSchema,
  PhotoFileNotFoundSchema,
  PhotoNotFoundSchema,
  PhotoResponseSchema,
  PhotoSearchResponseSchema,
} from "./photos-responses.js";

// GET /api/photos - Get all photos or search photos
export const getPhotosRouteDescription = {
  tags: ["Photos"],
  summary: "Get all photos or search photos",
  description:
    "Retrieve all photos for the authenticated user, or search photos with optional filters",
  parameters: [
    {
      name: "text",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Text search across photo titles and descriptions",
    },
    {
      name: "tags",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Comma-separated list of tags to filter by",
    },
    {
      name: "startDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "Start date for filtering photos (YYYY-MM-DD format)",
    },
    {
      name: "endDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "End date for filtering photos (YYYY-MM-DD format)",
    },
    {
      name: "locationCity",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Filter photos by city name",
    },
    {
      name: "dateField",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: ["createdAt", "dateTaken"],
        default: "createdAt",
      },
      description: "Which date field to use for date range filtering",
    },
    {
      name: "dueDateStart",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "Start date for due date filtering (YYYY-MM-DD format)",
    },
    {
      name: "dueDateEnd",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "End date for due date filtering (YYYY-MM-DD format)",
    },
    {
      name: "deviceId",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Filter photos by device ID",
    },
    {
      name: "limit",
      in: "query" as const,
      required: false,
      schema: {
        type: "integer" as const,
        minimum: 1,
        maximum: 100,
        default: 50,
      },
      description: "Maximum number of photos to return",
    },
  ],
  responses: {
    200: {
      description: "List of photos or search results",
      content: {
        "application/json": {
          schema: resolver(PhotoSearchResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    400: {
      description: "Invalid search parameters",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// POST /api/photos - Upload a new photo
export const postPhotosRouteDescription = {
  tags: ["Photos"],
  summary: "Upload a new photo",
  description:
    "Upload a new photo file with optional metadata. The file will be processed and thumbnails generated.",
  requestBody: {
    description: "Photo file with metadata",
    content: {
      "multipart/form-data": {
        schema: {
          type: "object" as const,
          properties: {
            content: {
              type: "string" as const,
              format: "binary" as const,
              description: "Photo file (JPEG, PNG, WebP, etc.)",
            },
            metadata: {
              type: "string" as const,
              description: "JSON string containing photo metadata",
              example:
                '{"title": "My Photo", "description": "A beautiful photo", "tags": ["nature", "landscape"], "deviceId": "iphone-12-pro", "reviewStatus": "pending"}',
            },
          },
          required: ["content" as const],
        },
      },
    },
  },
  responses: {
    201: {
      description: "Photo uploaded successfully",
      content: {
        "application/json": {
          schema: resolver(CreatedPhotoResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data or file type",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/photos/:id - Get a specific photo
export const getPhotoByIdRouteDescription = {
  tags: ["Photos"],
  summary: "Get photo by ID",
  description: "Retrieve a specific photo by its unique identifier",
  responses: {
    200: {
      description: "Photo details",
      content: {
        "application/json": {
          schema: resolver(PhotoResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/photos/:id - Update a photo (full)
export const putPhotoRouteDescription = {
  tags: ["Photos"],
  summary: "Update photo metadata (full)",
  description:
    "Completely update a photo's metadata with new data. All fields are required.",
  requestBody: {
    description: "Complete photo metadata",
    content: {
      "application/json": {
        schema: requestBodyResolver(PhotoSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Photo updated successfully",
      content: {
        "application/json": {
          schema: resolver(PhotoResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/photos/:id - Update a photo (partial)
export const patchPhotoRouteDescription = {
  tags: ["Photos"],
  summary: "Update photo metadata (partial)",
  description:
    "Partially update a photo's metadata. Only provided fields will be updated.",
  requestBody: {
    description: "Partial photo metadata",
    content: {
      "application/json": {
        schema: requestBodyResolver(PartialPhotoSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Photo updated successfully",
      content: {
        "application/json": {
          schema: resolver(PhotoResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// DELETE /api/photos/:id - Delete a photo
export const deletePhotoRouteDescription = {
  tags: ["Photos"],
  summary: "Delete photo",
  description:
    "Delete a photo from the database and optionally from storage. By default, both database entries and storage files are deleted.",
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
      description: "Photo deleted successfully",
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/photos/:id/view - Get photo file
export const getPhotoViewRouteDescription = {
  tags: ["Photo Assets"],
  summary: "Get photo file",
  description: "Retrieve the original photo file for viewing",
  responses: {
    200: {
      description: "Photo file",
      content: {
        "image/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo file not found",
      content: {
        "application/json": {
          schema: resolver(PhotoFileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/photos/:id/thumbnail - Get photo thumbnail
export const getPhotoThumbnailRouteDescription = {
  tags: ["Photo Assets"],
  summary: "Get photo thumbnail",
  description: "Retrieve the thumbnail image for a photo",
  responses: {
    200: {
      description: "Photo thumbnail file",
      content: {
        "image/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Thumbnail not found",
      content: {
        "application/json": {
          schema: resolver(PhotoFileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/photos/:id/analysis - Get AI analysis JSON
export const getPhotoAnalysisRouteDescription = {
  tags: ["Photo Assets"],
  summary: "Get AI analysis",
  description: "Retrieve the AI analysis JSON file for a photo",
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
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "AI analysis not found or not yet generated",
      content: {
        "application/json": {
          schema: resolver(PhotoFileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/photos/:id/content - Get content markdown
export const getPhotoContentRouteDescription = {
  tags: ["Photo Assets"],
  summary: "Get analysis content",
  description: "Retrieve the markdown content report for a photo",
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
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Content not found or not yet generated",
      content: {
        "application/json": {
          schema: resolver(PhotoFileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/photos/:id/review - Update photo review status
export const patchPhotoReviewRouteDescription = {
  tags: ["Photos"],
  summary: "Update photo review status",
  description: "Update the review status of a photo",
  requestBody: {
    description: "Review status update data",
    content: {
      "application/json": {
        schema: {
          type: "object" as const,
          properties: {
            reviewStatus: {
              type: "string" as const,
              enum: ["pending", "accepted", "rejected"],
              description: "New review status for the photo",
            },
          },
          required: ["reviewStatus"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Photo review status updated successfully",
      content: {
        "application/json": {
          schema: resolver(PhotoResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/photos/:id/flag - Update photo flag color
export const patchPhotoFlagRouteDescription = {
  tags: ["Photos"],
  summary: "Update photo flag color",
  description: "Update the flag color of a photo",
  requestBody: {
    description: "Flag color update data",
    content: {
      "application/json": {
        schema: {
          type: "object" as const,
          properties: {
            flagColor: {
              type: "string" as const,
              enum: ["red", "yellow", "orange", "green", "blue"],
              nullable: true,
              description: "Flag color for the photo (null to remove flag)",
            },
          },
          required: ["flagColor"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Photo flag color updated successfully",
      content: {
        "application/json": {
          schema: resolver(PhotoResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/photos/:id/pin - Update photo pin status
export const patchPhotoPinRouteDescription = {
  tags: ["Photos"],
  summary: "Update photo pin status",
  description: "Pin or unpin a photo",
  requestBody: {
    description: "Pin status update data",
    content: {
      "application/json": {
        schema: {
          type: "object" as const,
          properties: {
            isPinned: {
              type: "boolean" as const,
              description: "Whether to pin or unpin the photo",
            },
          },
          required: ["isPinned"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Photo pin status updated successfully",
      content: {
        "application/json": {
          schema: resolver(PhotoResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Photo not found",
      content: {
        "application/json": {
          schema: resolver(PhotoNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};
