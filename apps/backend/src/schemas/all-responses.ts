// schemas/all-responses.ts
import z from "zod/v4";

// Base item schema - represents any content type in search results
const BaseItemSchema = z
  .object({
    id: z.string().meta({ description: "Unique identifier for the item" }),
    type: z
      .enum(["bookmark", "note", "photo", "document", "task"])
      .meta({ description: "Type of content" }),
    title: z.string().nullable().meta({ description: "Title of the item" }),
    description: z
      .string()
      .nullable()
      .meta({ description: "Description of the item" }),
    tags: z
      .array(z.string())
      .meta({ description: "Tags associated with the item" }),
    createdAt: z
      .string()
      .meta({ description: "ISO 8601 timestamp when item was created" }),
    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when item was last updated",
    }),
    url: z.string().nullable().meta({
      description: "URL for bookmarks or source URL for other types",
    }),
    mimeType: z
      .string()
      .nullable()
      .meta({ description: "MIME type of the content" }),
    fileSize: z.number().nullable().meta({ description: "File size in bytes" }),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .meta({ description: "Processing status of the item" }),
    dueDate: z
      .string()
      .nullable()
      .meta({ description: "Due date for the item (ISO 8601 format)" }),
    reviewStatus: z
      .enum(["unreviewed", "reviewed", "flagged"])
      .nullable()
      .meta({ description: "Review status of the item" }),
    flagColor: z
      .string()
      .nullable()
      .meta({ description: "Color flag for the item" }),
    isPinned: z
      .boolean()
      .nullable()
      .meta({ description: "Whether the item is pinned" }),
    content: z
      .string()
      .nullable()
      .meta({ description: "Text content of the item" }),
    originalFilename: z
      .string()
      .nullable()
      .meta({ description: "Original filename for uploaded files" }),
    extractedText: z
      .string()
      .nullable()
      .meta({ description: "Extracted text content from the item" }),
    thumbnailUrl: z
      .string()
      .nullable()
      .meta({ description: "URL for item thumbnail" }),
    fileUrl: z.string().nullable().meta({ description: "URL for the file" }),
    contentUrl: z
      .string()
      .nullable()
      .meta({ description: "URL for the content" }),
    status: z
      .string()
      .nullable()
      .meta({ description: "Status field for tasks" }),
    assignedToId: z
      .string()
      .nullable()
      .meta({ description: "ID of user assigned to task" }),
    enabled: z
      .boolean()
      .nullable()
      .meta({ description: "Whether the item is enabled" }),
  })
  .meta({ ref: "BaseItem" });

// Search results response
export const SearchResponseSchema = z
  .object({
    items: z
      .array(BaseItemSchema)
      .meta({ description: "Array of found items" }),
    totalCount: z.number().meta({
      description: "Total number of items matching the search criteria",
    }),
    limit: z
      .number()
      .meta({ description: "Maximum number of results requested" }),
    offset: z.number().meta({ description: "Number of results skipped" }),
  })
  .meta({ ref: "SearchResponse" });

// Created item response (generic - actual response varies by type)
export const CreatedItemSchema = z
  .object({
    id: z
      .string()
      .meta({ description: "Unique identifier for the created item" }),
    type: z
      .enum(["bookmark", "note", "photo", "document", "task"])
      .meta({ description: "Type of content that was created" }),
    title: z
      .string()
      .nullable()
      .meta({ description: "Title of the created item" }),
    description: z
      .string()
      .nullable()
      .meta({ description: "Description of the created item" }),
    tags: z
      .array(z.string())
      .meta({ description: "Tags associated with the created item" }),
    createdAt: z
      .string()
      .meta({ description: "ISO 8601 timestamp when item was created" }),
    url: z.string().nullable().meta({
      description: "URL for bookmarks or source URL for other types",
    }),
    mimeType: z
      .string()
      .nullable()
      .meta({ description: "MIME type of the content" }),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .meta({ description: "Processing status of the created item" }),
    dueDate: z.string().nullable().meta({
      description: "Due date for the created item (ISO 8601 format)",
    }),
    reviewStatus: z
      .enum(["unreviewed", "reviewed", "flagged"])
      .nullable()
      .meta({ description: "Review status of the created item" }),
    flagColor: z
      .string()
      .nullable()
      .meta({ description: "Color flag for the created item" }),
    isPinned: z
      .boolean()
      .nullable()
      .meta({ description: "Whether the created item is pinned" }),
    fileSize: z.number().nullable().meta({ description: "File size in bytes" }),
    originalFilename: z
      .string()
      .nullable()
      .meta({ description: "Original filename for uploaded files" }),
    status: z
      .string()
      .nullable()
      .meta({ description: "Status field for tasks" }),
    assignedToId: z
      .string()
      .nullable()
      .meta({ description: "ID of user assigned to task" }),
    enabled: z
      .boolean()
      .nullable()
      .meta({ description: "Whether the created item is enabled" }),
  })
  .meta({ ref: "CreatedItem" });

// Error response schemas
export const ValidationErrorSchema = z
  .object({
    error: z.string().meta({ description: "Error message" }),
    details: z
      .array(
        z.object({
          code: z.string(),
          path: z.array(z.union([z.string(), z.number()])),
          message: z.string(),
        }),
      )
      .optional()
      .meta({ description: "Detailed validation errors" }),
  })
  .meta({ ref: "ValidationError" });

export const ErrorResponseSchema = z
  .object({
    error: z.string().meta({ description: "Error message" }),
    message: z
      .string()
      .optional()
      .meta({ description: "Additional error details" }),
  })
  .meta({ ref: "ErrorResponse" });

export const UnauthorizedSchema = z
  .object({
    error: z
      .literal("Unauthorized")
      .meta({ description: "Authentication required" }),
  })
  .meta({ ref: "Unauthorized" });
