import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

export const MediaResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    mediaType: z.enum(["audio", "video"]),
    mediaUrl: z.string(),
    sourceUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    dueDate: z.string().nullable(),
    originalFilename: z.string(),
    mimeType: z.string(),
    fileSize: z.number(),
    // Audio-specific metadata
    duration: z.number().nullable(),
    channels: z.number().nullable(),
    sampleRate: z.number().nullable(),
    bitrate: z.number().nullable(),
    codec: z.string().nullable(),
    language: z.string().nullable(),
    // Video-specific metadata
    width: z.number().nullable(),
    height: z.number().nullable(),
    frameRate: z.number().nullable(),
    videoCodec: z.string().nullable(),
    // Extracted content
    extractedText: z.string().nullable(),
    contentUrl: z.string().nullable(),
    // Review
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    // Processing
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed", "retry_pending"])
      .nullable(),
    processingEnabled: z.boolean(),
    // Storage
    storageId: z.string(),
    thumbnailStorageId: z.string().nullable(),
  })
  .meta({ ref: "MediaResponse" });

export const MediaListResponseSchema = paginatedResponseSchema(
  MediaResponseSchema,
  "MediaListResponse",
  "media",
);

export type Media = z.infer<typeof MediaResponseSchema>;
export type MediaListResponse = z.infer<typeof MediaListResponseSchema>;
