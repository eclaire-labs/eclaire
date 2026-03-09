// schemas/bookmarks-routes.ts
import { resolver } from "hono-openapi";
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
export const BookmarkReviewUpdateSchema = reviewStatusUpdateSchema(
  "bookmark",
  "BookmarkReviewUpdate",
);
export const BookmarkFlagUpdateSchema = flagColorUpdateSchema(
  "bookmark",
  "BookmarkFlagUpdate",
);
export const BookmarkPinUpdateSchema = isPinnedUpdateSchema(
  "bookmark",
  "BookmarkPinUpdate",
);

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
    ...commonErrors,
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
        schema: requestBodyResolver(CreateBookmarkSchema),
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
    ...commonErrorsWithValidation,
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
    ...commonErrors,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
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
        schema: requestBodyResolver(BookmarkSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
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
        schema: requestBodyResolver(PartialBookmarkSchema),
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
    ...commonErrorsWithValidation,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
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
    ...commonErrors,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
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
    ...commonErrors,
    404: notFoundError("Asset", AssetNotFoundSchema),
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
    ...commonErrorsWithValidation,
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
        schema: requestBodyResolver(BookmarkReviewUpdateSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark review status updated successfully",
      content: {
        "application/json": {
          schema: resolver(BookmarkResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
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
        schema: requestBodyResolver(BookmarkFlagUpdateSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark flag color updated successfully",
      content: {
        "application/json": {
          schema: resolver(BookmarkResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
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
        schema: requestBodyResolver(BookmarkPinUpdateSchema),
      },
    },
  },
  responses: {
    200: {
      description: "Bookmark pin status updated successfully",
      content: {
        "application/json": {
          schema: resolver(BookmarkResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
    404: notFoundError("Bookmark", BookmarkNotFoundSchema),
  },
};
