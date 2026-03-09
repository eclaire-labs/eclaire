// schemas/all-responses.ts
import z from "zod/v4";
import { paginatedResponseSchema } from "./common.js";

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
      .enum(["pending", "accepted", "rejected"])
      .nullable()
      .meta({ description: "Review status of the item" }),
    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({ description: "Color flag for the item" }),
    isPinned: z.boolean().meta({ description: "Whether the item is pinned" }),
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
    processingEnabled: z
      .boolean()
      .nullable()
      .meta({
        description: "Whether background processing is enabled for the item",
      }),
  })
  .meta({ ref: "BaseItem" });

// Search results response
export const SearchResponseSchema = paginatedResponseSchema(
  BaseItemSchema,
  "SearchResponse",
  "items",
);

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
      .enum(["pending", "accepted", "rejected"])
      .nullable()
      .meta({ description: "Review status of the created item" }),
    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({ description: "Color flag for the created item" }),
    isPinned: z
      .boolean()
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
    processingEnabled: z
      .boolean()
      .nullable()
      .meta({
        description:
          "Whether background processing is enabled for the created item",
      }),
  })
  .meta({ ref: "CreatedItem" });

// Error response schemas (extracted to error-schemas.ts to break circular dependency with common.ts)
export {
  ValidationErrorSchema,
  ErrorResponseSchema,
  UnauthorizedSchema,
} from "./error-schemas.js";
