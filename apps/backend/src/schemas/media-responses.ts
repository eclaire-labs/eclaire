// schemas/media-responses.ts
import z from "zod/v4";

// Re-export the shared response schema from @eclaire/api-types
export {
  MediaResponseSchema,
  MediaListResponseSchema,
} from "@eclaire/api-types/media";

import { MediaResponseSchema } from "@eclaire/api-types/media";

// Created media response (for POST requests) — minimal subset of MediaResponseSchema
export const CreatedMediaResponseSchema = MediaResponseSchema.pick({
  id: true,
  title: true,
  description: true,
  tags: true,
  createdAt: true,
  dueDate: true,
  mimeType: true,
  fileSize: true,
  mediaType: true,
  duration: true,
})
  .extend({
    originalFilename: z.string().nullable().meta({
      description: "Original filename of the uploaded media",
    }),
  })
  .meta({ ref: "CreatedMediaResponse" });

// Media not found error
export const MediaNotFoundSchema = z
  .object({
    error: z.literal("Media not found").meta({
      description: "Media with the specified ID was not found",
    }),
  })
  .meta({ ref: "MediaNotFound" });

// File not found error (for asset endpoints)
export const MediaFileNotFoundSchema = z
  .object({
    error: z.string().meta({
      description: "Error message indicating the media file was not found",
      examples: [
        "Media file not found in storage",
        "Thumbnail file not found in storage",
      ],
    }),
  })
  .meta({ ref: "MediaFileNotFound" });
