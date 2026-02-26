// schemas/all-routes.ts
import { resolver } from "hono-openapi";
import { CreatedItemSchema, SearchResponseSchema } from "./all-responses.js";
import { commonErrorsWithValidation } from "./common.js";

export const getAllRouteDescription = {
  tags: ["All Content"],
  summary: "Search across all content types",
  description:
    "Search for bookmarks, notes, photos, and documents using various filters. Returns paginated results with metadata.",
  responses: {
    200: {
      description: "Successful search results",
      content: {
        "application/json": {
          schema: resolver(SearchResponseSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
  },
};

export const postAllRouteDescription = {
  tags: ["All Content"],
  summary: "Create content of any type",
  description:
    "Upload and create bookmarks, notes, photos, or documents. Content type is automatically detected based on MIME type and content, or can be explicitly specified.",
  requestBody: {
    description: "Multipart form data with content and optional metadata",
    content: {
      "multipart/form-data": {
        schema: {
          type: "object" as const,
          properties: {
            content: {
              type: "string" as const,
              format: "binary" as const,
              description: "The content file or data to upload",
            },
            metadata: {
              type: "string" as const,
              description: "JSON string containing metadata for the content",
              example: JSON.stringify({
                title: "My Document",
                description: "Important meeting notes",
                tags: ["work", "meeting"],
                assetType: "note",
              }),
            },
          },
          required: ["content" as const],
        },
      },
    },
  },
  responses: {
    201: {
      description: "Content created successfully",
      content: {
        "application/json": {
          schema: resolver(CreatedItemSchema),
        },
      },
    },
    ...commonErrorsWithValidation,
  },
};
