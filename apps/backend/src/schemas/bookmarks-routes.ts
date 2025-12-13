// schemas/bookmarks-routes.ts
import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import {
  BookmarkSchema,
  CreateBookmarkSchema,
  PartialBookmarkSchema,
} from "./bookmarks-params.js";
import {
  AssetNotFoundSchema,
  BookmarkNotFoundSchema,
  BookmarkResponseSchema,
  BookmarksListResponseSchema,
  CreatedBookmarkResponseSchema,
} from "./bookmarks-responses.js";

// GET /api/bookmarks - Get all bookmarks
export const getBookmarksRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Get all bookmarks",
  description: "Retrieve all bookmarks for the authenticated user",
  responses: {
    200: {
      description: "List of bookmarks",
      content: {
        "application/json": {
          schema: resolver(BookmarksListResponseSchema),
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

// POST /api/bookmarks - Create a new bookmark
export const postBookmarksRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Create a new bookmark",
  description:
    "Create a new bookmark from a URL. The bookmark will be queued for background processing to extract metadata, capture screenshots, and generate other assets.",
  requestBody: {
    description: "Bookmark creation data",
    content: {
      "application/json": {
        schema: resolver(CreateBookmarkSchema) as any,
      },
    },
  },
  responses: {
    202: {
      description: "Bookmark created and queued for processing",
      content: {
        "application/json": {
          schema: resolver(CreatedBookmarkResponseSchema),
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

// GET /api/bookmarks/:id - Get a specific bookmark
export const getBookmarkByIdRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Get bookmark by ID",
  description: "Retrieve a specific bookmark by its unique identifier",
  responses: {
    200: {
      description: "Bookmark details",
      content: {
        "application/json": {
          schema: resolver(BookmarkResponseSchema),
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(BookmarkNotFoundSchema),
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

// PUT /api/bookmarks/:id - Update a bookmark (full)
export const putBookmarkRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Update bookmark (full)",
  description:
    "Completely update a bookmark with new data. All fields are required.",
  requestBody: {
    description: "Complete bookmark data",
    content: {
      "application/json": {
        schema: resolver(BookmarkSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark updated successfully",
      content: {
        "application/json": {
          schema: resolver(BookmarkResponseSchema),
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(BookmarkNotFoundSchema),
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

// PATCH /api/bookmarks/:id - Update a bookmark (partial)
export const patchBookmarkRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Update bookmark (partial)",
  description:
    "Partially update a bookmark. Only provided fields will be updated.",
  requestBody: {
    description: "Partial bookmark data",
    content: {
      "application/json": {
        schema: resolver(PartialBookmarkSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark updated successfully",
      content: {
        "application/json": {
          schema: resolver(BookmarkResponseSchema),
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(BookmarkNotFoundSchema),
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

// DELETE /api/bookmarks/:id - Delete a bookmark
export const deleteBookmarkRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Delete bookmark",
  description:
    "Delete a bookmark from the database and optionally from storage. By default, both database entries and storage files are deleted.",
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
      description: "Bookmark deleted successfully",
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(BookmarkNotFoundSchema),
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

// Asset endpoint description generator
export const createAssetRouteDescription = (
  assetType: string,
  description: string,
  mimeType: string,
) => ({
  tags: ["Bookmark Assets"],
  summary: `Get bookmark ${assetType}`,
  description: description,
  responses: {
    200: {
      description: `${assetType} file`,
      content: {
        [mimeType]: {
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
      description: "Asset not found",
      content: {
        "application/json": {
          schema: resolver(AssetNotFoundSchema),
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
});

// POST /api/bookmarks/import - Import bookmarks from file
export const postBookmarksImportRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Import bookmarks from file",
  description: "Import bookmarks from a browser export file (HTML format)",
  requestBody: {
    description: "Bookmark import file",
    content: {
      "multipart/form-data": {
        schema: {
          type: "object" as const,
          properties: {
            file: {
              type: "string" as const,
              format: "binary" as const,
              description: "HTML bookmark export file",
            },
          },
          required: ["file" as const],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Bookmarks imported successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              imported: {
                type: "number" as const,
                description: "Number of bookmarks imported",
              },
              duplicates: {
                type: "number" as const,
                description: "Number of duplicate bookmarks skipped",
              },
            },
          },
        },
      },
    },
    400: {
      description: "Invalid file or format",
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

// PATCH /api/bookmarks/:id/review - Update bookmark review status
export const patchBookmarkReviewRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Update bookmark review status",
  description: "Update the review status of a bookmark",
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
              description: "New review status for the bookmark",
            },
          },
          required: ["reviewStatus"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark review status updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              id: { type: "string" as const },
              reviewStatus: { type: "string" as const },
            },
          },
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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

// PATCH /api/bookmarks/:id/flag - Update bookmark flag color
export const patchBookmarkFlagRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Update bookmark flag color",
  description: "Update the flag color of a bookmark",
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
              description: "Flag color for the bookmark (null to remove flag)",
            },
          },
          required: ["flagColor"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark flag color updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              id: { type: "string" as const },
              flagColor: {
                type: "string" as const,
                nullable: true,
              },
            },
          },
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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

// PATCH /api/bookmarks/:id/pin - Update bookmark pin status
export const patchBookmarkPinRouteDescription = {
  tags: ["Bookmarks"],
  summary: "Update bookmark pin status",
  description: "Pin or unpin a bookmark",
  requestBody: {
    description: "Pin status update data",
    content: {
      "application/json": {
        schema: {
          type: "object" as const,
          properties: {
            isPinned: {
              type: "boolean" as const,
              description: "Whether to pin or unpin the bookmark",
            },
          },
          required: ["isPinned"],
        },
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark pin status updated successfully",
      content: {
        "application/json": {
          schema: {
            type: "object" as const,
            properties: {
              id: { type: "string" as const },
              isPinned: { type: "boolean" as const },
            },
          },
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
      description: "Bookmark not found",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
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
