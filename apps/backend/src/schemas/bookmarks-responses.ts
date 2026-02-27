// schemas/bookmarks-responses.ts
import z from "zod/v4";

// Re-export the shared response schema from @eclaire/api-types
export {
  BookmarkResponseSchema,
  BookmarksListResponseSchema,
} from "@eclaire/api-types/bookmarks";

import { BookmarkResponseSchema } from "@eclaire/api-types/bookmarks";

// Created bookmark response (for POST requests) — derives from BookmarkResponseSchema
// with processingStatus restricted to initial states
export const CreatedBookmarkResponseSchema = BookmarkResponseSchema.omit({
  processingStatus: true,
})
  .extend({
    processingStatus: z.enum(["pending", "processing"]).meta({
      description:
        "Initial processing status - background jobs will populate additional metadata",
    }),
  })
  .meta({ ref: "CreatedBookmarkResponse" });

// Asset not found error (for asset endpoints)
export const AssetNotFoundSchema = z
  .object({
    error: z.string().meta({
      description: "Error message indicating the asset was not found",
      examples: ["Favicon not found", "Screenshot not available"],
    }),
  })
  .meta({ ref: "AssetNotFound" });

// Bookmark not found error
export const BookmarkNotFoundSchema = z
  .object({
    error: z.literal("Bookmark not found").meta({
      description: "Bookmark with the specified ID was not found",
    }),
  })
  .meta({ ref: "BookmarkNotFound" });
