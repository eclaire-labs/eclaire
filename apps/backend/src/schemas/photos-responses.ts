// schemas/photos-responses.ts
import z from "zod/v4";

// Re-export the shared response schema from @eclaire/api-types
export {
  PhotoResponseSchema,
  PhotosListResponseSchema,
} from "@eclaire/api-types/photos";

import { PhotoResponseSchema } from "@eclaire/api-types/photos";

// Created photo response (for POST requests) — minimal subset of PhotoResponseSchema
export const CreatedPhotoResponseSchema = PhotoResponseSchema.pick({
  id: true,
  title: true,
  description: true,
  tags: true,
  createdAt: true,
  dueDate: true,
  mimeType: true,
  fileSize: true,
})
  .extend({
    originalFilename: z.string().nullable().meta({
      description: "Original filename of the uploaded photo",
    }),
  })
  .meta({ ref: "CreatedPhotoResponse" });

// Photo not found error
export const PhotoNotFoundSchema = z
  .object({
    error: z.literal("Photo not found").meta({
      description: "Photo with the specified ID was not found",
    }),
  })
  .meta({ ref: "PhotoNotFound" });

// File not found error (for asset endpoints)
export const PhotoFileNotFoundSchema = z
  .object({
    error: z.string().meta({
      description: "Error message indicating the photo file was not found",
      examples: [
        "Photo file not found in storage",
        "Thumbnail file not found in storage",
      ],
    }),
  })
  .meta({ ref: "PhotoFileNotFound" });
