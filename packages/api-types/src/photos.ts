import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

export const PhotoResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    imageUrl: z.string(),
    thumbnailUrl: z.string().nullable(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    dueDate: z.string().nullable(),
    dateTaken: z.string().nullable(),
    deviceId: z.string().nullable(),
    originalFilename: z.string(),
    mimeType: z.string(),
    fileSize: z.number(),
    // EXIF
    cameraMake: z.string().nullable(),
    cameraModel: z.string().nullable(),
    lensModel: z.string().nullable(),
    iso: z.number().nullable(),
    fNumber: z.number().nullable(),
    exposureTime: z.number().nullable(),
    orientation: z.number().nullable(),
    imageWidth: z.number().nullable(),
    imageHeight: z.number().nullable(),
    // Location
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
    altitude: z.number().nullable().optional(),
    locationCity: z.string().nullable(),
    locationCountryIso2: z.string().nullable(),
    locationCountryName: z.string().nullable(),
    // AI
    photoType: z.string().nullable(),
    ocrText: z.string().nullable(),
    dominantColors: z.array(z.string()).nullable(),
    // Review
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    // Processing
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed", "retry_pending"])
      .nullable(),
    // Storage
    storageId: z.string(),
    thumbnailStorageId: z.string().nullable(),
    convertedJpgStorageId: z.string().nullable(),
    isOriginalViewable: z.boolean(),
    enabled: z.boolean(),
  })
  .meta({ ref: "PhotoResponse" });

export const PhotosListResponseSchema = paginatedResponseSchema(
  PhotoResponseSchema,
  "PhotosListResponse",
  "photos",
);

export type Photo = z.infer<typeof PhotoResponseSchema>;
export type PhotosListResponse = z.infer<typeof PhotosListResponseSchema>;
