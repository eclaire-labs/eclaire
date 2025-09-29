// schemas/all-responses.ts
import { z } from "zod";
import "zod-openapi/extend";

// Base item schema - represents any content type in search results
const BaseItemSchema = z
  .object({
    id: z.string().openapi({ description: "Unique identifier for the item" }),
    type: z
      .enum(["bookmark", "note", "photo", "document", "task"])
      .openapi({ description: "Type of content" }),
    title: z.string().nullable().openapi({ description: "Title of the item" }),
    description: z
      .string()
      .nullable()
      .openapi({ description: "Description of the item" }),
    tags: z
      .array(z.string())
      .openapi({ description: "Tags associated with the item" }),
    createdAt: z
      .string()
      .openapi({ description: "ISO 8601 timestamp when item was created" }),
    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when item was last updated",
    }),
    url: z.string().nullable().openapi({
      description: "URL for bookmarks or source URL for other types",
    }),
    mimeType: z
      .string()
      .nullable()
      .openapi({ description: "MIME type of the content" }),
    fileSize: z
      .number()
      .nullable()
      .openapi({ description: "File size in bytes" }),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .openapi({ description: "Processing status of the item" }),
    dueDate: z
      .string()
      .nullable()
      .openapi({ description: "Due date for the item (ISO 8601 format)" }),
    reviewStatus: z
      .enum(["unreviewed", "reviewed", "flagged"])
      .nullable()
      .openapi({ description: "Review status of the item" }),
    flagColor: z
      .string()
      .nullable()
      .openapi({ description: "Color flag for the item" }),
    isPinned: z
      .boolean()
      .nullable()
      .openapi({ description: "Whether the item is pinned" }),
    content: z
      .string()
      .nullable()
      .openapi({ description: "Text content of the item" }),
    originalFilename: z
      .string()
      .nullable()
      .openapi({ description: "Original filename for uploaded files" }),
    extractedText: z
      .string()
      .nullable()
      .openapi({ description: "Extracted text content from the item" }),
    thumbnailUrl: z
      .string()
      .nullable()
      .openapi({ description: "URL for item thumbnail" }),
    fileUrl: z.string().nullable().openapi({ description: "URL for the file" }),
    contentUrl: z
      .string()
      .nullable()
      .openapi({ description: "URL for the content" }),
    status: z
      .string()
      .nullable()
      .openapi({ description: "Status field for tasks" }),
    assignedToId: z
      .string()
      .nullable()
      .openapi({ description: "ID of user assigned to task" }),
    enabled: z
      .boolean()
      .nullable()
      .openapi({ description: "Whether the item is enabled" }),
  })
  .openapi({ ref: "BaseItem" });

// Search results response
export const SearchResponseSchema = z
  .object({
    items: z
      .array(BaseItemSchema)
      .openapi({ description: "Array of found items" }),
    totalCount: z.number().openapi({
      description: "Total number of items matching the search criteria",
    }),
    limit: z
      .number()
      .openapi({ description: "Maximum number of results requested" }),
    offset: z.number().openapi({ description: "Number of results skipped" }),
  })
  .openapi({ ref: "SearchResponse" });

// Created item response (generic - actual response varies by type)
export const CreatedItemSchema = z
  .object({
    id: z
      .string()
      .openapi({ description: "Unique identifier for the created item" }),
    type: z
      .enum(["bookmark", "note", "photo", "document", "task"])
      .openapi({ description: "Type of content that was created" }),
    title: z
      .string()
      .nullable()
      .openapi({ description: "Title of the created item" }),
    description: z
      .string()
      .nullable()
      .openapi({ description: "Description of the created item" }),
    tags: z
      .array(z.string())
      .openapi({ description: "Tags associated with the created item" }),
    createdAt: z
      .string()
      .openapi({ description: "ISO 8601 timestamp when item was created" }),
    url: z.string().nullable().openapi({
      description: "URL for bookmarks or source URL for other types",
    }),
    mimeType: z
      .string()
      .nullable()
      .openapi({ description: "MIME type of the content" }),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .openapi({ description: "Processing status of the created item" }),
    dueDate: z.string().nullable().openapi({
      description: "Due date for the created item (ISO 8601 format)",
    }),
    reviewStatus: z
      .enum(["unreviewed", "reviewed", "flagged"])
      .nullable()
      .openapi({ description: "Review status of the created item" }),
    flagColor: z
      .string()
      .nullable()
      .openapi({ description: "Color flag for the created item" }),
    isPinned: z
      .boolean()
      .nullable()
      .openapi({ description: "Whether the created item is pinned" }),
    fileSize: z
      .number()
      .nullable()
      .openapi({ description: "File size in bytes" }),
    originalFilename: z
      .string()
      .nullable()
      .openapi({ description: "Original filename for uploaded files" }),
    status: z
      .string()
      .nullable()
      .openapi({ description: "Status field for tasks" }),
    assignedToId: z
      .string()
      .nullable()
      .openapi({ description: "ID of user assigned to task" }),
    enabled: z
      .boolean()
      .nullable()
      .openapi({ description: "Whether the created item is enabled" }),
  })
  .openapi({ ref: "CreatedItem" });

// Error response schemas
export const ValidationErrorSchema = z
  .object({
    error: z.string().openapi({ description: "Error message" }),
    details: z
      .array(
        z.object({
          code: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional()
      .openapi({ description: "Detailed validation errors" }),
  })
  .openapi({ ref: "ValidationError" });

export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({ description: "Error message" }),
    message: z
      .string()
      .optional()
      .openapi({ description: "Additional error details" }),
  })
  .openapi({ ref: "ErrorResponse" });

export const UnauthorizedSchema = z
  .object({
    error: z
      .literal("Unauthorized")
      .openapi({ description: "Authentication required" }),
  })
  .openapi({ ref: "Unauthorized" });
