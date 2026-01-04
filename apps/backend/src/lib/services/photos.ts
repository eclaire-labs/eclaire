import type { Buffer } from "buffer"; // Node.js Buffer
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lte,
  type SQL,
  sql,
} from "drizzle-orm";
import exifr from "exifr"; // <-- Import exifr
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { Readable } from "stream";
import { db, txManager, schema, queueJobs } from "../../db/index.js";
import { formatToISO8601, getOrCreateTags } from "../db-helpers.js";

const {
  photos,
  photosTags,
  tags,
  users,
} = schema;

import { getQueue, QueueNames, getQueueAdapter } from "../queue/index.js";
import { getStorage, buildKey, assetPrefix } from "../storage/index.js";
import { generateHistoryId, generatePhotoId } from "@eclaire/core";

import { createChildLogger } from "../logger.js";
import { recordHistory } from "./history.js"; // Assuming this service exists and is configured
import { createOrUpdateProcessingJob } from "./processing-status.js";

const logger = createChildLogger("services:photos");

// ============================================================================
// Error Classes
// ============================================================================

export class PhotoNotFoundError extends Error {
  constructor(message = "Photo not found") {
    super(message);
    this.name = "PhotoNotFoundError";
  }
}

export class PhotoForbiddenError extends Error {
  constructor(message = "Access denied") {
    super(message);
    this.name = "PhotoForbiddenError";
  }
}

export class PhotoFileNotFoundError extends Error {
  constructor(message = "File not found in storage") {
    super(message);
    this.name = "PhotoFileNotFoundError";
  }
}

// ============================================================================
// Interfaces
// ============================================================================

// Photo interface for API responses
export interface Photo {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string; // Points to /api/photos/[id]/view (smart serving)
  thumbnailUrl: string | null; // Points to /api/photos/[id]/thumbnail
  originalUrl: string; // Points to /api/photos/[id]/original (direct access to original file)
  convertedJpgUrl: string | null; // Points to /api/photos/[id]/converted (when available)

  originalFilename: string;
  mimeType: string; // Original MIME type of the uploaded file
  fileSize: number;

  createdAt: string; // ISO String from API
  updatedAt: string; // ISO String from API
  dateTaken: string | null; // ISO String or null from API

  deviceId: string | null;
  tags: string[];

  // EXIF Data
  cameraMake: string | null;
  cameraModel: string | null;
  lensModel: string | null;
  iso: number | null;
  fNumber: number | null;
  exposureTime: number | null;
  orientation: number | null;
  imageWidth: number | null;
  imageHeight: number | null;

  // Location Data
  latitude: number | null;
  longitude: number | null;
  altitude?: number | null;
  locationCity: string | null;
  locationCountryIso2: string | null;
  locationCountryName: string | null;

  // AI Generated Data
  photoType: string | null;
  ocrText: string | null;
  dominantColors: string[] | null; // Array of color names

  // Processing control
  enabled: boolean;

  // Optional fields from backend service for client-side hints
  isOriginalViewable?: boolean;
}

// Edit photo state interface
export interface EditPhotoState {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  deviceId: string | null;
}

// Upload file interface
export interface UploadingFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "success" | "error";
  error?: string;
  photoId?: string;
}

// Interface for file information passed from API route
export interface FileInfo {
  fileBuffer: Buffer; // Pass the buffer for easier processing
  contentType: string;
  originalFilename: string;
  fileSize: number; // in bytes
}

// Interface for extracted metadata (internal use)
interface ExtractedMetadata {
  exif?: Record<string, any>; // Raw EXIF data from exifr
  location?: {
    cityName?: string;
    countryIso2?: string;
    countryName?: string;
  };
}

// Interface for creating a new photo record
export interface CreatePhotoData {
  content: Buffer;
  metadata: {
    title?: string;
    description?: string;
    dueDate?: string;
    tags?: string[];
    originalFilename?: string;
    deviceId?: string;
    reviewStatus?: "pending" | "accepted" | "rejected";
    flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
    isPinned?: boolean;
    [key: string]: any;
  };
  originalMimeType: string;
  userAgent: string;
  extractedMetadata: ExtractedMetadata;
}

// Interface for updating photo metadata (user-editable fields)
export interface UpdatePhotoParams {
  title?: string;
  description?: string | null;
  dueDate?: string | null;
  tags?: string[];
  deviceId?: string | null;
  reviewStatus?: "pending" | "accepted" | "rejected";
  flagColor?: "red" | "yellow" | "orange" | "green" | "blue" | null;
  isPinned?: boolean;
  // Maybe allow manual location override?
  // locationCity?: string | null;
  // locationCountryName?: string | null;
}

export interface PhotoStreamDetails {
  storageId: string;
  mimeType: string;
  userId: string; // For verification, though primary auth is done before calling this
}

// --- Background Job Queuing Functions ---

/**
 * Queues background processing jobs for a newly created photo.
 * Now uses a single unified processor instead of separate conversion and AI queues.
 * @param photoData - The photo data returned from createPhoto
 * @param userId - The user ID
 * @param originalMimeType - The original MIME type of the uploaded file
 * @param originalFilename - The original filename
 */
async function queuePhotoBackgroundJobs(
  photoData: any,
  userId: string,
  originalMimeType: string,
  originalFilename: string,
): Promise<void> {
  try {
    // Queue unified image processing job for ALL images
    // The worker will handle conversion, thumbnails, and AI analysis as needed
    try {
      const queueAdapter = await getQueueAdapter();
      await queueAdapter.enqueueImage({
        imageId: photoData.id,
        photoId: photoData.id, // Worker expects 'photoId'
        storageId: photoData.storageId,
        mimeType: originalMimeType,
        originalFilename: originalFilename,
        userId: userId,
      });

      logger.info({ photoId: photoData.id }, "Enqueued unified image processing job for photo");
    } catch (innerError) {
      logger.error(
        {
          photoId: photoData.id,
          error: innerError instanceof Error ? innerError.message : "Unknown error",
        },
        `Failed to enqueue image processing job`,
      );
    }
  } catch (error) {
    // Log the error but don't fail the photo creation
    logger.error(
      { err: error, photoId: photoData.id },
      "Error queueing unified processing job for photo",
    );
  }
}

// --- Core CRUD Functions ---

/**
 * Creates a new photo record in the database and stores the file using ObjectStorage.
 * Assumes EXIF/Location data is already extracted and passed via CreatePhotoParams.
 * @param data - Metadata, file buffer, and extracted EXIF/location info.
 * @param userId - The ID of the user creating the photo.
 * @returns The newly created photo details including its access URL.
 */
export async function createPhoto(data: CreatePhotoData, userId: string) {
  // Generate photo ID first so we can use it for storage
  const photoId = generatePhotoId();
  const { metadata, content, originalMimeType, userAgent, extractedMetadata } =
    data;

  let storageInfo: { storageId: string } | undefined;
  try {
    // Use the originalMimeType passed from the route (already corrected for SVG)
    // as it may have been corrected by the route handler for special cases like SVG
    const verifiedMimeType = originalMimeType;
    const fileSize = content.length;
    const originalFilename = metadata.originalFilename || "untitled.jpg";

    logger.debug(
      {
        originalMimeType,
        verifiedMimeType,
        originalFilename,
        photoId,
      },
      "Photo creation - MIME type handling",
    );

    // Check if background processing is enabled (default true if not specified)
    const enabled = metadata.enabled !== false; // Will be true unless explicitly set to false

    // 1. Prepare EXIF and Location data for DB insertion
    const exif = extractedMetadata?.exif || {};
    const location = extractedMetadata?.location || {};

    logger.info({
      originalFilename,
      hasExtractedMetadata: !!extractedMetadata,
      hasExifData: !!extractedMetadata?.exif,
      exifKeys: extractedMetadata?.exif
        ? Object.keys(extractedMetadata.exif)
        : [],
      hasLocationData: !!extractedMetadata?.location,
      locationData: extractedMetadata?.location,
      exifSample: extractedMetadata?.exif
        ? {
            Make: extractedMetadata.exif.Make,
            Model: extractedMetadata.exif.Model,
            ISO: extractedMetadata.exif.ISO,
            latitude: extractedMetadata.exif.latitude,
            longitude: extractedMetadata.exif.longitude,
            DateTimeOriginal: extractedMetadata.exif.DateTimeOriginal,
          }
        : null,
    }, "[DB] Preparing EXIF data for photo");

    // Convert EXIF date to Date object if available
    let dateTakenValue: Date | null = null;
    if (
      exif.DateTimeOriginal instanceof Date &&
      !isNaN(exif.DateTimeOriginal.getTime())
    ) {
      dateTakenValue = exif.DateTimeOriginal;
      logger.info({ dateTimeOriginal: exif.DateTimeOriginal }, "[DB] Using DateTimeOriginal");
    } else if (
      exif.CreateDate instanceof Date &&
      !isNaN(exif.CreateDate.getTime())
    ) {
      // Fallback to CreateDate if DateTimeOriginal is missing
      dateTakenValue = exif.CreateDate;
      logger.info({ createDate: exif.CreateDate }, "[DB] Using CreateDate fallback");
    } else {
      logger.info(
        { dateTimeOriginal: exif.DateTimeOriginal, createDate: exif.CreateDate },
        "[DB] No valid date found",
      );
    }

    // Convert dueDate string to Date object
    const dueDateValue = metadata.dueDate ? new Date(metadata.dueDate) : null;

    // 2. Save the file to storage first using the pre-generated ID
    const fileExtension = originalFilename.includes(".")
      ? originalFilename.split(".").pop()?.toLowerCase()
      : "jpg";

    const storage = getStorage();
    const storageKey = buildKey(userId, "photos", photoId, `original.${fileExtension}`);
    await storage.write(storageKey, Readable.from(content) as unknown as NodeJS.ReadableStream, {
      contentType: verifiedMimeType,
    });

    // Create storageInfo for backward compatibility
    storageInfo = {
      storageId: storageKey,
    };

    // 3. Now create the photo record with the actual storage ID in a single operation
    const [newPhoto] = await db
      .insert(photos)
      .values({
        id: photoId, // Use the pre-generated ID
        userId: userId,
        title: metadata.title || originalFilename,
        description: metadata.description || null,
        dueDate: dueDateValue,
        originalFilename: originalFilename,
        storageId: storageKey, // Use the actual storage ID from the save operation
        mimeType: verifiedMimeType,
        fileSize: fileSize,
        deviceId: metadata.deviceId || null,

        rawMetadata: metadata,
        originalMimeType: originalMimeType,
        userAgent: userAgent,

        // --- EXIF ---
        dateTaken: dateTakenValue,
        cameraMake: exif.Make || null,
        cameraModel: exif.Model || null,
        lensModel: exif.LensModel || null,
        iso: typeof exif.ISO === "number" ? exif.ISO : null,
        fNumber: typeof exif.FNumber === "number" ? exif.FNumber : null,
        exposureTime:
          typeof exif.ExposureTime === "number" ? exif.ExposureTime : null,
        orientation:
          typeof exif.Orientation === "number" ? exif.Orientation : null,
        imageWidth:
          typeof exif.ExifImageWidth === "number"
            ? exif.ExifImageWidth
            : typeof exif.ImageWidth === "number"
              ? exif.ImageWidth
              : null,
        imageHeight:
          typeof exif.ExifImageHeight === "number"
            ? exif.ExifImageHeight
            : typeof exif.ImageHeight === "number"
              ? exif.ImageHeight
              : null,

        // --- Location ---
        latitude: typeof exif.latitude === "number" ? exif.latitude : null,
        longitude: typeof exif.longitude === "number" ? exif.longitude : null,
        altitude: typeof exif.altitude === "number" ? exif.altitude : null,
        locationCity: location.cityName || null,
        locationCountryIso2: location.countryIso2 || null,
        locationCountryName: location.countryName || null,

        // --- AI Generated Data (initially null, populated by AI worker) ---
        photoType: null,
        ocrText: null,
        dominantColors: null,

        // --- Generated Files (initially null, populated by background worker) ---
        thumbnailStorageId: null,
        convertedJpgStorageId: null,

        // --- New fields for review, flagging, and pinning ---
        reviewStatus: metadata.reviewStatus || "pending",
        flagColor: metadata.flagColor || null,
        isPinned: metadata.isPinned || false,

        enabled: enabled, // Set the enabled flag based on metadata
      } as any)
      .returning();

    // 4. Handle tags
    const tags = metadata.tags || [];
    if (tags.length > 0) {
      await addTagsToPhoto(photoId, tags, userId);
    }

    // 5. Record history
    await recordHistory({
      action: "create",
      itemType: "photo",
      itemId: photoId,
      itemName: metadata.title || originalFilename,
      afterData: {
        id: photoId,
        title: metadata.title,
        originalFilename: originalFilename,
        storageId: storageInfo.storageId,
        tags: tags,
      },
      actor: "user",
      userId: userId,
    });

    // 6. Initialize processing job status tracking
    if (enabled) {
      // Determine processing stages based on image type
      const needsHeicConversion =
        originalMimeType === "image/heic" || originalMimeType === "image/heif";

      const stages: string[] = [];
      if (needsHeicConversion) {
        stages.push("image_conversion", "ai_analysis");
      } else {
        stages.push("ai_analysis");
      }

      await createOrUpdateProcessingJob(
        "photos",
        photoId,
        userId,
        stages,
      ).catch((error) => {
        logger.error(
          { photoId, userId, error: error.message },
          "Failed to initialize processing job for photo",
        );
        // Don't fail photo creation if processing job initialization fails
      });
    }

    // 7. Queue background processing jobs (HEIC conversion and AI analysis) only if enabled
    if (enabled) {
      await queuePhotoBackgroundJobs(
        newPhoto, // Use the photo data we already have instead of fetching it again
        userId,
        originalMimeType,
        metadata.originalFilename || "untitled.jpg",
      );
      logger.info(
        { photoId, userId, enabled: true },
        "Queued photo background processing jobs",
      );
    } else {
      logger.info(
        { photoId, userId, enabled: false },
        "Skipped queuing photo background processing jobs",
      );
    }

    // 8. Get the newly created photo details for return
    const newPhotoDetails = await getPhotoWithDetails(photoId, userId);
    return newPhotoDetails;
  } catch (error) {
    logger.error(
      {
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error creating photo",
    );
    // Attempt cleanup if storage succeeded but DB failed
    if (storageInfo?.storageId) {
      try {
        const storageForCleanup = getStorage();
        await storageForCleanup.delete(storageInfo.storageId);
      } catch (cleanupError) {
        logger.error(
          {
            cleanupError:
              cleanupError instanceof Error
                ? cleanupError.message
                : "Unknown error",
            stack:
              cleanupError instanceof Error ? cleanupError.stack : undefined,
          },
          "Cleanup failed",
        );
      }
    }
    handleServiceError(error, "Failed to create photo");
  }
}

/**
 * Updates the user-editable metadata (title, description, tags, etc.) of an existing photo.
 * Does NOT update EXIF/location derived from the file.
 * @param id - The ID of the photo to update.
 * @param photoData - The metadata fields to update.
 * @param userId - The ID of the user performing the update (for authorization).
 * @returns The updated photo details.
 */
export async function updatePhotoMetadata(
  id: string,
  photoData: UpdatePhotoParams,
  userId: string,
) {
  try {
    // 1. Fetch existing photo for authorization and history
    // Fetch all relevant fields for history comparison
    const existingPhoto = await db.query.photos.findFirst({
      where: and(eq(photos.id, id), eq(photos.userId, userId)),
    });
    if (!existingPhoto) throw new PhotoNotFoundError();

    const currentPhotoTags = await getPhotoTags(id); // For history

    // 2. Prepare update data, excluding tags and dueDate for now
    const { tags: tagNames, dueDate, ...photoUpdateData } = photoData;

    // Handle dueDate conversion if provided
    const filteredUpdateData = Object.entries(photoUpdateData).reduce(
      (acc, [key, value]) => {
        if (value !== undefined) {
          // @ts-ignore - Trusting the structure for now
          acc[key] = value;
        }
        return acc;
      },
      {} as Partial<typeof photos.$inferInsert>,
    );

    // Add dueDate conversion if it was provided
    if (Object.hasOwn(photoData, "dueDate")) {
      const dueDateValue = dueDate ? new Date(dueDate) : null;
      filteredUpdateData.dueDate = dueDateValue;
    }

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // 3. Atomic transaction: update photo, handle tags, and record history together
    await txManager.withTransaction(async (tx) => {
      // Perform the database update for user-editable fields
      if (Object.keys(filteredUpdateData).length > 0 || tagNames !== undefined) {
        await tx.photos.update(
          and(eq(photos.id, id), eq(photos.userId, userId)),
          { ...filteredUpdateData, updatedAt: new Date() },
        );
      }

      // Handle tags update if tags were provided
      if (tagNames !== undefined) {
        await tx.photosTags.delete(eq(photosTags.photoId, id));
        if (tagNames.length > 0) {
          const tagList = await tx.getOrCreateTags(tagNames, userId);
          for (const tag of tagList) {
            await tx.photosTags.insert({ photoId: id, tagId: tag.id });
          }
        }
      }

      // Record history - atomic with the update
      await tx.history.insert({
        id: historyId,
        action: "update",
        itemType: "photo",
        itemId: id,
        itemName: photoData.title || existingPhoto.title,
        beforeData: { ...existingPhoto, tags: currentPhotoTags },
        afterData: {
          ...existingPhoto,
          ...photoData,
          tags: tagNames ?? currentPhotoTags,
        },
        actor: "user",
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // 6. Return the updated photo details
    return getPhotoWithDetails(id, userId);
  } catch (error) {
    handleServiceError(error, "Failed to update photo metadata");
  }
}

/**
 * Deletes a photo record from the database and its corresponding file(s)
 * (original, thumbnail, converted JPG) from ObjectStorage.
 * @param id - The ID of the photo to delete.
 * @param userId - The ID of the user performing the deletion (for authorization).
 * @param deleteStorage - Optional flag to control storage deletion. Defaults to true.
 * @returns An object indicating success.
 */
export async function deletePhoto(
  id: string,
  userId: string,
  deleteStorage: boolean = true,
) {
  try {
    // 1. Fetch existing photo for authorization/history
    const existingPhoto = await db.query.photos.findFirst({
      columns: {
        title: true, // for history
        // Include other fields needed for history 'beforeData'
        userId: true,
        description: true,
        originalFilename: true,
        mimeType: true,
        fileSize: true,
        deviceId: true,
        dateTaken: true,
        cameraMake: true,
        cameraModel: true,
        // ... add other fields as needed for history
      },
      where: and(eq(photos.id, id), eq(photos.userId, userId)),
    });
    if (!existingPhoto) throw new PhotoNotFoundError();

    const photoTags = await getPhotoTags(id); // For history

    // Pre-generate history ID for transaction
    const historyId = generateHistoryId();

    // Atomic transaction: delete all DB records and record history together
    await txManager.withTransaction(async (tx) => {
      // Delete photo-tag relationships first
      await tx.photosTags.delete(eq(photosTags.photoId, id));

      // Delete the photo record from the database
      await tx.photos.delete(
        and(eq(photos.id, id), eq(photos.userId, userId)),
      );

      // Record history - atomic with the delete
      await tx.history.insert({
        id: historyId,
        action: "delete",
        itemType: "photo",
        itemId: id,
        itemName: existingPhoto.title || "Untitled Photo",
        beforeData: { ...existingPhoto, tags: photoTags },
        afterData: null,
        actor: "user",
        userId: userId,
        metadata: null,
        timestamp: new Date(),
      });
    });

    // Delete queue job outside transaction (non-critical, like storage)
    await db.delete(queueJobs).where(eq(queueJobs.key, `photos:${id}`));

    // Delete the entire asset folder if deleteStorage is true
    // (outside transaction - external side-effect)
    if (deleteStorage) {
      try {
        const storageForDelete = getStorage();
        await storageForDelete.deletePrefix(assetPrefix(userId, "photos", id));
        logger.info({ photoId: id, userId }, "Successfully deleted storage for photo");
      } catch (storageError) {
        // Log that storage deletion failed but DB entry is gone. Don't fail the whole operation.
        logger.warn(
          {
            photoId: id,
            storageError:
              storageError instanceof Error
                ? storageError.message
                : "Unknown error",
            stack:
              storageError instanceof Error ? storageError.stack : undefined,
          },
          "DB record deleted, but failed to delete asset folder for photo",
        );
      }
    } else {
      logger.info({ photoId: id, userId }, "Storage deletion skipped for photo - deleteStorage flag set to false");
    }

    return { success: true };
  } catch (error) {
    handleServiceError(error, "Failed to delete photo");
  }
}

// --- Read Functions ---

/**
 * Retrieves details for a single photo, including tags, URLs, EXIF, and location.
 * Performs authorization check.
 * @param photoId - The ID of the photo to retrieve.
 * @param userId - The ID of the user requesting the photo (for authorization).
 * @returns The photo details.
 * @throws {NotFoundError} If the photo is not found or user is not authorized.
 */
async function getPhotoWithDetails(photoId: string, userId: string) {
  const [result] = await db
    .select({
      photo: photos,
      status: queueJobs.status,
    })
    .from(photos)
    .leftJoin(
      queueJobs,
      eq(queueJobs.key, sql`'photos:' || ${photos.id}`),
    )
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)));

  if (!result) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  const photo = result.photo;

  const tags = await getPhotoTags(photoId);

  // The main `imageUrl` will now always point to the smart `/view` endpoint.
  const imageUrl = `/api/photos/${photo.id}/view`; // Simplified

  const thumbnailUrl = photo.thumbnailStorageId
    ? `/api/photos/${photo.id}/thumbnail`
    : null;

  // URL for direct access to the original file
  const originalUrl = `/api/photos/${photo.id}/original`;

  // URL for converted JPG (when applicable, like for HEIC files)
  const convertedJpgUrl = photo.convertedJpgStorageId
    ? `/api/photos/${photo.id}/converted`
    : null;

  return {
    id: photo.id,
    title: photo.title,
    description: photo.description,
    dueDate: photo.dueDate ? formatToISO8601(photo.dueDate) : null,
    imageUrl: imageUrl, // This is the primary URL for display (smart serving)
    thumbnailUrl: thumbnailUrl,
    originalUrl: originalUrl, // Direct access to original file
    convertedJpgUrl: convertedJpgUrl, // Access to converted JPG when available
    originalFilename: photo.originalFilename || "",
    mimeType: photo.mimeType || "", // Original MIME type
    fileSize: photo.fileSize || 0,
    createdAt: formatToISO8601(photo.createdAt),
    updatedAt: formatToISO8601(photo.updatedAt),
    dateTaken: photo.dateTaken ? formatToISO8601(photo.dateTaken) : null,
    deviceId: photo.deviceId,
    tags: tags,
    // EXIF Data
    cameraMake: photo.cameraMake,
    cameraModel: photo.cameraModel,
    lensModel: photo.lensModel,
    iso: photo.iso,
    fNumber: photo.fNumber,
    exposureTime: photo.exposureTime,
    orientation: photo.orientation,
    imageWidth: photo.imageWidth,
    imageHeight: photo.imageHeight,
    // Location Data
    latitude: photo.latitude,
    longitude: photo.longitude,
    altitude: photo.altitude,
    locationCity: photo.locationCity,
    locationCountryIso2: photo.locationCountryIso2,
    locationCountryName: photo.locationCountryName,

    // --- AI Generated Data ---
    photoType: photo.photoType,
    ocrText: photo.ocrText,
    dominantColors: photo.dominantColors,

    // For client-side logic, it might be useful to know if a conversion *should* exist
    // or if the original is directly viewable.
    isOriginalViewable: !["image/heic", "image/heif"].includes(
      photo.mimeType || "",
    ),

    // Processing status
    processingStatus: result.status || null,

    // Review, flagging, and pinning
    reviewStatus: photo.reviewStatus || "pending",
    flagColor: photo.flagColor,
    isPinned: photo.isPinned || false,
    enabled: photo.enabled || false,
  };
}

/**
 * Retrieves all photos belonging to a specific user, including new fields.
 * @param userId - The ID of the user whose photos to retrieve.
 * @returns An array of photo details.
 */
export async function getAllPhotos(userId: string) {
  try {
    // Use single query with LEFT JOIN to include processing status
    const entriesList = await db
      .select({
        photo: photos,
        status: queueJobs.status,
      })
      .from(photos)
      .leftJoin(
        queueJobs,
        eq(queueJobs.key, sql`'photos:' || ${photos.id}`),
      )
      .where(eq(photos.userId, userId))
      .orderBy(desc(photos.createdAt)); // Order by creation date

    // Process results to include tags and processing status
    const entriesWithTags = await Promise.all(
      entriesList.map(async (result) => {
        const photo = result.photo;
        const tags = await getPhotoTags(photo.id);

        // The main `imageUrl` will now always point to the smart `/view` endpoint.
        const imageUrl = `/api/photos/${photo.id}/view`; // Simplified

        const thumbnailUrl = photo.thumbnailStorageId
          ? `/api/photos/${photo.id}/thumbnail`
          : null;

        // URL for direct access to the original file
        const originalUrl = `/api/photos/${photo.id}/original`;

        // URL for converted JPG (when applicable, like for HEIC files)
        const convertedJpgUrl = photo.convertedJpgStorageId
          ? `/api/photos/${photo.id}/converted`
          : null;

        return {
          id: photo.id,
          title: photo.title,
          description: photo.description,
          dueDate: photo.dueDate ? formatToISO8601(photo.dueDate) : null,
          imageUrl: imageUrl, // This is the primary URL for display (smart serving)
          thumbnailUrl: thumbnailUrl,
          originalUrl: originalUrl, // Direct access to original file
          convertedJpgUrl: convertedJpgUrl, // Access to converted JPG when available
          originalFilename: photo.originalFilename || "",
          mimeType: photo.mimeType || "", // Original MIME type
          fileSize: photo.fileSize || 0,
          createdAt: formatToISO8601(photo.createdAt),
          updatedAt: formatToISO8601(photo.updatedAt),
          dateTaken: photo.dateTaken ? formatToISO8601(photo.dateTaken) : null,
          deviceId: photo.deviceId,
          tags: tags,
          // EXIF Data
          cameraMake: photo.cameraMake,
          cameraModel: photo.cameraModel,
          lensModel: photo.lensModel,
          iso: photo.iso,
          fNumber: photo.fNumber,
          exposureTime: photo.exposureTime,
          orientation: photo.orientation,
          imageWidth: photo.imageWidth,
          imageHeight: photo.imageHeight,
          // Location Data
          latitude: photo.latitude,
          longitude: photo.longitude,
          altitude: photo.altitude,
          locationCity: photo.locationCity,
          locationCountryIso2: photo.locationCountryIso2,
          locationCountryName: photo.locationCountryName,

          // --- AI Generated Data ---
          photoType: photo.photoType,
          ocrText: photo.ocrText,
          dominantColors: photo.dominantColors,

          // For client-side logic, it might be useful to know if a conversion *should* exist
          // or if the original is directly viewable.
          isOriginalViewable: !["image/heic", "image/heif"].includes(
            photo.mimeType || "",
          ),

          // Processing status
          processingStatus: result.status || null,

          // Review, flagging, and pinning
          reviewStatus: photo.reviewStatus || "pending",
          flagColor: photo.flagColor,
          isPinned: photo.isPinned || false,
          enabled: photo.enabled || false,
        };
      }),
    );

    return entriesWithTags;
  } catch (error) {
    handleServiceError(error, "Failed to fetch photos");
  }
}

/**
 * Retrieves a single photo by its ID, ensuring the user is authorized.
 * @param photoId - The ID of the photo to retrieve.
 * @param userId - The ID of the user requesting the photo.
 * @returns The photo details including new fields.
 */
export async function getPhotoById(photoId: string, userId: string) {
  try {
    // Use the helper which includes authorization and all fields
    return await getPhotoWithDetails(photoId, userId);
  } catch (error) {
    handleServiceError(error, "Failed to fetch photo");
  }
}

// --- Search and Count Functions ---

/**
 * Builds the common query conditions for finding/counting photos based on user, date range,
 * and potentially new filterable fields (e.g., location).
 * @param userId - The ID of the user.
 * @param startDate - Optional start date (for created_at or dateTaken).
 * @param endDate - Optional end date (for created_at or dateTaken).
 * @param locationCity - Optional location city filter.
 * @param dateField - Which date field to filter on ('created_at' or 'dateTaken'). Default 'created_at'.
 * @param dueDateStart - Optional start due date filter.
 * @param dueDateEnd - Optional end due date filter.
 * @returns An array of Drizzle SQL conditions.
 */
function _buildPhotoQueryConditions(
  userId: string,
  startDate?: Date,
  endDate?: Date,
  locationCity?: string,
  dateField: "createdAt" | "dateTaken" = "createdAt",
  dueDateStart?: Date,
  dueDateEnd?: Date,
): SQL<unknown>[] {
  const definedConditions: SQL<unknown>[] = [eq(photos.userId, userId)];
  const dateColumn =
    dateField === "dateTaken" ? photos.dateTaken : photos.createdAt;

  if (startDate) {
    if (!isNaN(startDate.getTime())) {
      // Ensure the date column is not null when filtering dateTaken
      if (dateField === "dateTaken") {
        definedConditions.push(
          and(
            sql`${dateColumn} IS NOT NULL`,
            gte(dateColumn, startDate),
          ) as SQL<unknown>,
        );
      } else {
        definedConditions.push(gte(dateColumn, startDate));
      }
    } else {
      logger.warn({ startDate }, "Invalid start date provided for photo query");
    }
  }

  if (endDate) {
    if (!isNaN(endDate.getTime())) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (dateField === "dateTaken") {
        definedConditions.push(
          and(
            sql`${dateColumn} IS NOT NULL`,
            lte(dateColumn, endOfDay),
          ) as SQL<unknown>,
        );
      } else {
        definedConditions.push(lte(dateColumn, endOfDay));
      }
    } else {
      logger.warn({ endDate }, "Invalid end date provided for photo query");
    }
  }

  if (locationCity && locationCity.trim()) {
    // Use case-insensitive comparison if needed (depends on DB collation)
    // Example for SQLite (case-insensitive LIKE):
    // definedConditions.push(like(photos.locationCity, `%${locationCity.trim()}%`));
    // Exact match (case-sensitive depends on collation):
    definedConditions.push(eq(photos.locationCity, locationCity.trim()));
  }

  // Add due date filtering conditions
  if (dueDateStart) {
    definedConditions.push(gte(photos.dueDate, dueDateStart));
  }

  if (dueDateEnd) {
    definedConditions.push(lte(photos.dueDate, dueDateEnd));
  }

  return definedConditions;
}

/**
 * Finds photos matching specific criteria (tags, date range, location).
 * @param userId - The ID of the user.
 * @param tagsList - Optional array of tags (photo must have ALL specified tags).
 * @param startDate - Optional start date.
 * @param endDate - Optional end date.
 * @param locationCity - Optional location city filter.
 * @param dateField - Which date field to filter on ('created_at' or 'dateTaken').
 * @param limit - Optional maximum number of results.
 * @param dueDateStart - Optional start due date filter.
 * @param dueDateEnd - Optional end due date filter.
 * @returns An array of matching photo details.
 */
export async function findPhotos(
  userId: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  locationCity?: string,
  dateField: "createdAt" | "dateTaken" = "createdAt",
  limit = 50,
  dueDateStart?: Date,
  dueDateEnd?: Date,
) {
  try {
    const conditions = _buildPhotoQueryConditions(
      userId,
      startDate,
      endDate,
      locationCity,
      dateField,
      dueDateStart,
      dueDateEnd,
    );
    let finalPhotoIds: string[];
    const orderByColumn =
      dateField === "dateTaken" ? photos.dateTaken : photos.createdAt;

    // If filtering by tags:
    if (tagsList && tagsList.length > 0) {
      // Find photos matching base conditions (user, date, location)
      const baseMatchedPhotos = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(...conditions));

      const basePhotoIds = baseMatchedPhotos.map((p) => p.id);
      if (basePhotoIds.length === 0) return []; // No photos match base criteria

      // Find which of those photos have ALL the required tags
      const photosWithAllTags = await db
        .select({ photoId: photosTags.photoId })
        .from(photosTags)
        .innerJoin(tags, eq(photosTags.tagId, tags.id))
        .where(
          and(
            inArray(photosTags.photoId, basePhotoIds),
            eq(tags.userId, userId),
            inArray(tags.name, tagsList),
          ),
        )
        .groupBy(photosTags.photoId)
        .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);

      const taggedPhotoIds = photosWithAllTags.map((p) => p.photoId);

      // Need to re-query to apply ordering and limit *after* tag filtering
      if (taggedPhotoIds.length === 0) return [];
      const finalPhotos = await db
        .select({ id: photos.id })
        .from(photos)
        .where(inArray(photos.id, taggedPhotoIds)) // Filter by IDs that have the tags
        .orderBy(desc(orderByColumn)) // Order the final set
        .limit(limit);
      finalPhotoIds = finalPhotos.map((p) => p.id);
    } else {
      // No tag filter, just apply base conditions and limit/order
      const matchedPhotos = await db
        .select({ id: photos.id })
        .from(photos)
        .where(and(...conditions))
        .orderBy(desc(orderByColumn)) // Order before limiting
        .limit(limit);
      finalPhotoIds = matchedPhotos.map((p) => p.id);
    }

    if (finalPhotoIds.length === 0) return [];

    // Fetch full details with processing status using single query with JOIN
    const entriesList = await db
      .select({
        photo: photos,
        status: queueJobs.status,
      })
      .from(photos)
      .leftJoin(
        queueJobs,
        eq(queueJobs.key, sql`'photos:' || ${photos.id}`),
      )
      .where(inArray(photos.id, finalPhotoIds))
      .orderBy(desc(orderByColumn)); // Maintain the same ordering

    // Process results to include tags and processing status
    const entriesWithTags = await Promise.all(
      entriesList.map(async (result) => {
        const photo = result.photo;
        const tags = await getPhotoTags(photo.id);

        // The main `imageUrl` will now always point to the smart `/view` endpoint.
        const imageUrl = `/api/photos/${photo.id}/view`; // Simplified

        const thumbnailUrl = photo.thumbnailStorageId
          ? `/api/photos/${photo.id}/thumbnail`
          : null;

        // URL for direct access to the original file
        const originalUrl = `/api/photos/${photo.id}/original`;

        // URL for converted JPG (when applicable, like for HEIC files)
        const convertedJpgUrl = photo.convertedJpgStorageId
          ? `/api/photos/${photo.id}/converted`
          : null;

        return {
          id: photo.id,
          title: photo.title,
          description: photo.description,
          dueDate: photo.dueDate ? formatToISO8601(photo.dueDate) : null,
          imageUrl: imageUrl, // This is the primary URL for display (smart serving)
          thumbnailUrl: thumbnailUrl,
          originalUrl: originalUrl, // Direct access to original file
          convertedJpgUrl: convertedJpgUrl, // Access to converted JPG when available
          originalFilename: photo.originalFilename || "",
          mimeType: photo.mimeType || "", // Original MIME type
          fileSize: photo.fileSize || 0,
          createdAt: formatToISO8601(photo.createdAt),
          updatedAt: formatToISO8601(photo.updatedAt),
          dateTaken: photo.dateTaken ? formatToISO8601(photo.dateTaken) : null,
          deviceId: photo.deviceId,
          tags: tags,
          // EXIF Data
          cameraMake: photo.cameraMake,
          cameraModel: photo.cameraModel,
          lensModel: photo.lensModel,
          iso: photo.iso,
          fNumber: photo.fNumber,
          exposureTime: photo.exposureTime,
          orientation: photo.orientation,
          imageWidth: photo.imageWidth,
          imageHeight: photo.imageHeight,
          // Location Data
          latitude: photo.latitude,
          longitude: photo.longitude,
          altitude: photo.altitude,
          locationCity: photo.locationCity,
          locationCountryIso2: photo.locationCountryIso2,
          locationCountryName: photo.locationCountryName,

          // --- AI Generated Data ---
          photoType: photo.photoType,
          ocrText: photo.ocrText,
          dominantColors: photo.dominantColors,

          // For client-side logic, it might be useful to know if a conversion *should* exist
          // or if the original is directly viewable.
          isOriginalViewable: !["image/heic", "image/heif"].includes(
            photo.mimeType || "",
          ),

          // Processing status
          processingStatus: result.status || null,

          // Review, flagging, and pinning
          reviewStatus: photo.reviewStatus || "pending",
          flagColor: photo.flagColor,
          isPinned: photo.isPinned || false,
          enabled: photo.enabled || false,
        };
      }),
    );

    return entriesWithTags;
  } catch (error) {
    handleServiceError(error, "Failed to search photos");
  }
}

// --- Helper Functions ---

/**
 * Counts photos matching specific criteria.
 * @param userId - The ID of the user.
 * @param tagsList - Optional array of tags (photo must have ALL specified tags).
 * @param startDate - Optional start date.
 * @param endDate - Optional end date.
 * @param locationCity - Optional location city filter.
 * @param dateField - Which date field to filter on ('created_at' or 'dateTaken').
 * @param dueDateStart - Optional start due date filter.
 * @param dueDateEnd - Optional end due date filter.
 * @returns The total count of matching photos.
 */
export async function countPhotos(
  userId: string,
  tagsList?: string[],
  startDate?: Date,
  endDate?: Date,
  locationCity?: string,
  dateField: "createdAt" | "dateTaken" = "createdAt",
  dueDateStart?: Date,
  dueDateEnd?: Date,
): Promise<number> {
  try {
    const conditions = _buildPhotoQueryConditions(
      userId,
      startDate,
      endDate,
      locationCity,
      dateField,
      dueDateStart,
      dueDateEnd,
    );

    // If no tag filter, count directly
    if (!tagsList || tagsList.length === 0) {
      const countResult = await db
        .select({ value: count() })
        .from(photos)
        .where(and(...conditions));
      return countResult[0]?.value ?? 0;
    }

    // With tag filter, need to find matching IDs first, then count
    const baseMatchedPhotos = await db
      .select({ id: photos.id })
      .from(photos)
      .where(and(...conditions));

    const basePhotoIds = baseMatchedPhotos.map((p) => p.id);
    if (basePhotoIds.length === 0) return 0;

    const photosWithAllTags = await db
      .select({ photoId: photosTags.photoId })
      .from(photosTags)
      .innerJoin(tags, eq(photosTags.tagId, tags.id))
      .where(
        and(
          inArray(photosTags.photoId, basePhotoIds),
          eq(tags.userId, userId),
          inArray(tags.name, tagsList),
        ),
      )
      .groupBy(photosTags.photoId)
      .having(sql`COUNT(DISTINCT ${tags.name}) = ${tagsList.length}`);

    return photosWithAllTags.length; // The count is the number of photos having all tags
  } catch (error) {
    handleServiceError(error, "Failed to count photos");
  }
}

// --- Helper Functions (getPhotoTags, addTagsToPhoto, Error Handling) ---
// These remain largely the same, ensure they handle errors appropriately.

/**
 * Retrieves the names of tags associated with a specific photo.
 * @param photoId - The ID of the photo.
 * @returns An array of tag names.
 */
async function getPhotoTags(photoId: string): Promise<string[]> {
  try {
    const photoTagsJoin = await db
      .select({ name: tags.name })
      .from(photosTags)
      .innerJoin(tags, eq(photosTags.tagId, tags.id))
      .where(eq(photosTags.photoId, photoId));

    return photoTagsJoin.map((tag) => tag.name);
  } catch (error) {
    logger.error(
      {
        photoId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error getting tags for photo",
    );
    return [];
  }
}

/**
 * Associates a list of tags with a photo. Creates tags if they don't exist.
 * @param photoId - The ID of the photo.
 * @param tagNames - An array of tag names to associate.
 * @param userId - The ID of the user who owns the photo.
 */
async function addTagsToPhoto(
  photoId: string,
  tagNames: string[],
  userId: string,
) {
  if (!tagNames || tagNames.length === 0) return;

  try {
    const tagRecords = await getOrCreateTags(tagNames, userId); // Scoped to user
    if (tagRecords.length > 0) {
      await db
        .insert(photosTags)
        .values(
          tagRecords.map((tag) => ({
            photoId: photoId,
            tagId: tag.id,
          })),
        )
        .onConflictDoNothing();
    }
  } catch (error) {
    logger.error(
      {
        photoId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error adding tags to photo",
    );
    throw new Error("Failed to add tags to photo");
  }
}

/** Standardizes error handling for service functions */
function handleServiceError(error: unknown, defaultMessage: string): never {
  if (
    error instanceof PhotoNotFoundError ||
    error instanceof PhotoForbiddenError ||
    error instanceof PhotoFileNotFoundError
  ) {
    throw error;
  }
  logger.error(
    {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    },
    defaultMessage,
  );
  // Consider logging the original error for more details in production
  throw new Error(defaultMessage); // Generic message for client
}

// --- NEW: Function to extract EXIF and Geocode ---
/**
 * Extracts EXIF data and performs reverse geocoding if GPS coordinates are present.
 * @param fileBuffer - The buffer containing the image file data.
 * @returns An object containing extracted EXIF and location data.
 */
export async function extractAndGeocode(
  fileBuffer: Buffer,
): Promise<ExtractedMetadata> {
  let exifData: Record<string, any> | undefined;
  let locationData: ExtractedMetadata["location"] | undefined;

  try {
    logger.debug(
      { bufferSize: fileBuffer.length },
      "[EXIF] Starting extraction",
    );

    // Check the actual file type from the buffer
    const fileTypeResult = await fileTypeFromBuffer(fileBuffer);
    logger.debug(
      {
        detectedMime: fileTypeResult?.mime,
        detectedExt: fileTypeResult?.ext,
      },
      "[EXIF] File type detection result",
    );

    // Primary method: Use Sharp for EXIF extraction (handles HEIC well)
    try {
      logger.debug("[EXIF] Attempting Sharp-based extraction");
      const image = sharp(fileBuffer);
      const metadata = await image.metadata();

      logger.debug(
        {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          hasExif: !!metadata.exif,
          exifLength: metadata.exif?.length,
        },
        "[EXIF] Sharp metadata",
      );

      // Build exifData from Sharp's metadata
      exifData = {};

      // Basic image properties from Sharp
      if (metadata.width) exifData.ImageWidth = metadata.width;
      if (metadata.height) exifData.ImageHeight = metadata.height;
      if (metadata.orientation) exifData.Orientation = metadata.orientation;
      if (metadata.density) exifData.XResolution = metadata.density;
      if (metadata.format) exifData.FileType = metadata.format;
      if (metadata.space) exifData.ColorSpace = metadata.space;
      if (metadata.channels) exifData.Channels = metadata.channels;
      if (metadata.hasProfile) exifData.HasColorProfile = metadata.hasProfile;

      logger.debug(
        {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          exifBufferSize: metadata.exif?.length || 0,
        },
        "[EXIF] Sharp metadata extraction",
      );

      // Try multiple EXIF extraction methods for HEIC files
      if (metadata.exif) {
        logger.debug(
          "[EXIF] Sharp found EXIF buffer, trying enhanced HEIC parsing",
        );

        // Method 1: Try comprehensive exifr parsing with HEIC-optimized options
        try {
          const parsedExif = await exifr.parse(metadata.exif, {
            tiff: true,
            exif: true,
            gps: true,
            iptc: true,
            icc: true,
            translateKeys: true,
            translateValues: true,
            reviveValues: true,
            sanitize: false, // Key: Don't sanitize - can remove useful HEIC data
            mergeOutput: true,
          });

          if (parsedExif && Object.keys(parsedExif).length > 0) {
            logger.debug(
              {
                fieldCount: Object.keys(parsedExif).length,
                keys: Object.keys(parsedExif).sort(),
              },
              "[EXIF] SUCCESS! Parsed EXIF from Sharp buffer",
            );
            // Merge parsed EXIF with what we already have
            exifData = { ...exifData, ...parsedExif };
          } else {
            logger.debug(
              "[EXIF] No usable EXIF data from comprehensive parsing",
            );
          }
        } catch (exifrError: any) {
          logger.debug(
            { error: exifrError?.message },
            "[EXIF] Comprehensive EXIF parsing failed",
          );

          // Method 2: Try alternative EXIF parsing (skip "Exif\0\0" header if present)
          try {
            logger.debug("[EXIF] Trying alternative EXIF parsing for HEIC");

            // Check if EXIF buffer starts with "Exif\0\0" header
            const exifHeader = metadata.exif.subarray(0, 6);
            const exifHeaderStr = exifHeader.toString("ascii");

            let bufferToTry = metadata.exif;
            if (exifHeaderStr.startsWith("Exif")) {
              logger.debug(
                "[EXIF] Found standard EXIF header, trying TIFF portion",
              );
              bufferToTry = metadata.exif.subarray(6); // Skip "Exif\0\0"
            }

            const altParsedExif = await exifr.parse(bufferToTry, {
              tiff: true,
              exif: true,
              gps: true,
              translateKeys: true,
              translateValues: true,
              reviveValues: true,
              sanitize: false,
              mergeOutput: true,
            });

            if (altParsedExif && Object.keys(altParsedExif).length > 0) {
              logger.debug(
                { fieldCount: Object.keys(altParsedExif).length },
                "[EXIF] SUCCESS! Alternative parsing found",
              );
              exifData = { ...exifData, ...altParsedExif };
            } else {
              logger.debug("[EXIF] Alternative parsing found no data");
            }
          } catch (altError: any) {
            logger.debug(
              { error: altError?.message },
              "[EXIF] Alternative EXIF parsing also failed",
            );
            logger.debug("[EXIF] Using Sharp metadata only for this HEIC file");
          }
        }
      }

      logger.debug(
        { fieldCount: Object.keys(exifData || {}).length },
        "[EXIF] Sharp extraction completed",
      );
    } catch (sharpError: any) {
      logger.debug(
        { error: sharpError?.message },
        "[EXIF] Sharp extraction failed",
      );

      // Fallback: Try exifr directly on the buffer
      logger.debug("[EXIF] Falling back to exifr direct parsing");
      try {
        exifData = await exifr.parse(fileBuffer, { gps: true });
        logger.debug("[EXIF] exifr fallback successful");
      } catch (exifrError: any) {
        logger.debug(
          { error: exifrError?.message },
          "[EXIF] exifr fallback also failed",
        );
        exifData = undefined;
      }
    }

    logger.debug(
      {
        hasData: !!exifData,
        fieldCount: exifData ? Object.keys(exifData).length : 0,
        keys: exifData ? Object.keys(exifData).sort() : [],
        sampleData: exifData
          ? Object.fromEntries(Object.entries(exifData).slice(0, 8))
          : null,
      },
      "[EXIF] Final EXIF data",
    );

    // Extract GPS data for reverse geocoding
    const latitude = exifData?.latitude || exifData?.GPSLatitude;
    const longitude = exifData?.longitude || exifData?.GPSLongitude;

    if (latitude && longitude) {
      logger.debug({ latitude, longitude }, "[EXIF] GPS coordinates found");

      // Perform reverse geocoding
      try {
        // We import here to avoid ES module load issues
        const { getNearestCity } = await import("offline-geocode-city");

        const nearestCity = getNearestCity(latitude, longitude);
        if (nearestCity) {
          locationData = {
            cityName: nearestCity.cityName,
            countryIso2: nearestCity.countryIso2,
            countryName: nearestCity.countryName,
          };
          logger.debug({ locationData }, "[EXIF] Reverse geocoding successful");
        } else {
          logger.debug(
            { latitude, longitude },
            "[EXIF] No city found for coordinates",
          );
        }
      } catch (geocodeError) {
        logger.debug({ geocodeError }, "[EXIF] Reverse geocoding failed");
      }
    } else {
      logger.debug("[EXIF] No GPS coordinates found in EXIF data");
    }
  } catch (error) {
    logger.debug({ error }, "[EXIF] EXIF parsing failed");
    // Return empty metadata object on error
    exifData = undefined;
    locationData = undefined;
  }

  logger.debug(
    {
      hasExif: !!exifData,
      exifKeyCount: exifData ? Object.keys(exifData).length : 0,
      hasLocation: !!locationData,
      location: locationData,
    },
    "[EXIF] Final extraction result",
  );

  return {
    exif: exifData,
    location: locationData,
  };
}

// Note: Consider adding functions for updating photo content (replacing the file)
// if that's a required feature. It would involve deleting the old file via ObjectStorage
// and saving the new one, then updating the storageId, mimeType, fileSize etc. in the DB.

/**
 * Updates the photo record with artifact results (thumbnails, converted images, AI data).
 * This function only updates the actual results/artifacts, not status tracking.
 * Status tracking is handled by the asset_processing_jobs table.
 * @param photoId - The ID of the photo to update
 * @param artifacts - The artifacts to save (thumbnail, converted image, AI data, etc.)
 * @returns boolean indicating if the update was successful
 */
export async function updatePhotoArtifacts(
  photoId: string,
  artifacts: {
    thumbnailStorageId?: string;
    convertedJpgStorageId?: string;
    description?: string | null;
    photoType?: string | null;
    ocrText?: string | null;
    dominantColors?: string[] | null;
    tags?: string[];
  },
): Promise<boolean> {
  try {
    logger.info({ photoId, artifacts }, "Updating photo artifacts");

    const updatePayload: Partial<typeof photos.$inferInsert> = {
      updatedAt: new Date(),
    };

    // Handle storage artifacts
    if (artifacts.thumbnailStorageId !== undefined) {
      updatePayload.thumbnailStorageId = artifacts.thumbnailStorageId;
    }
    if (artifacts.convertedJpgStorageId !== undefined) {
      updatePayload.convertedJpgStorageId = artifacts.convertedJpgStorageId;
    }

    // Handle AI-generated content
    if (artifacts.description !== undefined) {
      updatePayload.description = artifacts.description;
    }
    if (artifacts.photoType !== undefined) {
      updatePayload.photoType = artifacts.photoType;
    }
    if (artifacts.ocrText !== undefined) {
      updatePayload.ocrText = artifacts.ocrText;
    }
    if (artifacts.dominantColors !== undefined) {
      updatePayload.dominantColors = artifacts.dominantColors;
    }

    // Get or create tags BEFORE transaction if tags are provided
    let tagRecords: { id: string; name: string }[] = [];
    if (artifacts.tags !== undefined && artifacts.tags.length > 0) {
      // Get the photo's userId for tag scoping
      const photo = await db
        .select({ userId: photos.userId })
        .from(photos)
        .where(eq(photos.id, photoId));

      if (photo.length > 0 && photo[0]) {
        tagRecords = await getOrCreateTags(artifacts.tags, photo[0].userId);
      }
    }

    // Execute transaction
    await txManager.withTransaction(async (tx) => {
      await tx.photos.update(eq(photos.id, photoId), updatePayload);

      // Handle AI-generated tags if provided
      if (artifacts.tags !== undefined) {
        await tx.photosTags.delete(eq(photosTags.photoId, photoId));
        if (tagRecords.length > 0) {
          for (const tag of tagRecords) {
            await tx.photosTags.insert({
              photoId: photoId,
              tagId: tag.id,
            });
          }
        }
      }
    });

    logger.info({ photoId }, "Successfully updated photo artifacts");
    return true;
  } catch (error) {
    logger.error(
      {
        photoId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Database error updating photo artifacts",
    );
    throw new Error(`Database error updating photo artifacts for ${photoId}`);
  }
}

/**
 * Gets the necessary details to stream a photo, intelligently choosing
 * between original and converted JPG for browser compatibility.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with storageId and mimeType for the file to be served.
 * @throws {NotFoundError} if photo not found or user not authorized.
 * @throws {Error} if essential storageId is missing.
 */
// Internal helper - use getViewStream() for external access
async function getPhotoStreamDetailsForViewing(
  photoId: string,
  userId: string,
): Promise<PhotoStreamDetails> {
  // Use LEFT JOIN to get photo data along with processing status
  const [result] = await db
    .select({
      photo: {
        storageId: photos.storageId,
        userId: photos.userId,
        mimeType: photos.mimeType,
        convertedJpgStorageId: photos.convertedJpgStorageId,
      },
      status: queueJobs.status,
    })
    .from(photos)
    .leftJoin(
      queueJobs,
      eq(queueJobs.key, sql`'photos:' || ${photos.id}`),
    )
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
    .limit(1);

  if (!result || !result.photo) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  const photoMeta = result.photo;
  const processingStatus = result.status;

  if (photoMeta.userId !== userId) {
    // Double check, though query should handle
    throw new PhotoForbiddenError("Access denied");
  }

  // If the photo has failed processing and has no storageId, return a specific error
  if (processingStatus === "failed" && !photoMeta.storageId) {
    throw new PhotoFileNotFoundError(
      "Photo processing failed and file is not available",
    );
  }

  const originalMimeType = photoMeta.mimeType || "application/octet-stream";

  // If it's HEIC/HEIF and a converted JPG exists, serve the JPG
  if (
    (originalMimeType === "image/heic" || originalMimeType === "image/heif") &&
    photoMeta.convertedJpgStorageId
  ) {
    return {
      storageId: photoMeta.convertedJpgStorageId,
      mimeType: "image/jpeg",
      userId: photoMeta.userId,
    };
  }

  // AVIF can be served directly - Sharp handles it natively
  if (originalMimeType === "image/avif") {
    if (!photoMeta.storageId) {
      logger.error({ photoId }, "AVIF photo is missing its primary storageId");
      throw new Error("File reference missing for AVIF photo.");
    }
    return {
      storageId: photoMeta.storageId,
      mimeType: "image/avif",
      userId: photoMeta.userId,
    };
  }

  // SVG can be served directly - browser native support
  if (originalMimeType === "image/svg+xml") {
    if (!photoMeta.storageId) {
      logger.error({ photoId }, "SVG photo is missing its primary storageId");
      throw new Error("File reference missing for SVG photo.");
    }
    return {
      storageId: photoMeta.storageId,
      mimeType: "image/svg+xml",
      userId: photoMeta.userId,
    };
  }

  // Otherwise, serve the original
  if (!photoMeta.storageId) {
    logger.error({ photoId }, "Photo is missing its primary storageId");
    throw new Error("File reference missing for original photo.");
  }
  return {
    storageId: photoMeta.storageId,
    mimeType: originalMimeType,
    userId: photoMeta.userId,
  };
}

/**
 * Gets the necessary details to stream a photo's thumbnail.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with storageId and mimeType for the thumbnail.
 * @throws {NotFoundError} if photo/thumbnail not found or user not authorized.
 */
// Internal helper - use getThumbnailStream() for external access
async function getThumbnailStreamDetails(
  photoId: string,
  userId: string,
): Promise<PhotoStreamDetails> {
  const photoMeta = await db.query.photos.findFirst({
    columns: { thumbnailStorageId: true, userId: true },
    where: and(eq(photos.id, photoId), eq(photos.userId, userId)), // Auth check
  });

  if (!photoMeta) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }
  if (photoMeta.userId !== userId) {
    throw new PhotoForbiddenError("Access denied");
  }
  if (!photoMeta.thumbnailStorageId) {
    throw new PhotoFileNotFoundError("Thumbnail not available for this photo");
  }

  // Assuming thumbnails are JPEGs. If not, you might need to store thumbnailMimeType
  // or derive it more reliably.
  return {
    storageId: photoMeta.thumbnailStorageId,
    mimeType: "image/jpeg", // Or derive from thumbnailStorageId extension
    userId: photoMeta.userId,
  };
}

/**
 * Re-processes an existing photo by using the existing retry logic.
 * This allows users to refresh processing results without knowing about processing jobs.
 */
export async function reprocessPhoto(
  photoId: string,
  userId: string,
  force: boolean = false,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Get the existing photo to ensure it exists and user has access
    const photo = await getPhotoById(photoId, userId);
    if (!photo) {
      return { success: false, error: "Photo not found" };
    }

    // 2. Use the existing retry logic with force parameter to properly handle job deduplication
    const { retryAssetProcessing } = await import("./processing-status.js");
    const result = await retryAssetProcessing("photos", photoId, userId, force);

    if (result.success) {
      logger.info(
        { photoId, userId },
        "Successfully queued photo for reprocessing using retry logic",
      );
    } else {
      logger.error(
        { photoId, userId, error: result.error },
        "Failed to reprocess photo using retry logic",
      );
    }

    return result;
  } catch (error) {
    logger.error(
      {
        photoId,
        userId,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      "Error reprocessing photo",
    );
    return { success: false, error: "Failed to reprocess photo" };
  }
}

// ============================================================================
// Stream Functions (for route layer - returns streams directly)
// ============================================================================

export interface PhotoStreamResult {
  stream: ReadableStream<Uint8Array>;
  metadata: { size: number; contentType: string };
  filename: string;
}

/**
 * Gets the original photo file as a stream.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with stream, metadata, and filename.
 * @throws {PhotoNotFoundError} if photo not found or user not authorized.
 * @throws {PhotoFileNotFoundError} if file not found in storage.
 */
export async function getOriginalStream(
  photoId: string,
  userId: string,
): Promise<PhotoStreamResult> {
  const photo = await db.query.photos.findFirst({
    columns: {
      id: true,
      userId: true,
      storageId: true,
      mimeType: true,
      originalFilename: true,
    },
    where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
  });

  if (!photo) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  if (!photo.storageId) {
    throw new PhotoFileNotFoundError("Original file not found");
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(photo.storageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: photo.mimeType || "application/octet-stream",
      },
      filename: photo.originalFilename || `${photo.id}-original`,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new PhotoFileNotFoundError("Original file not found in storage");
    }
    throw error;
  }
}

/**
 * Gets the converted JPG file as a stream.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with stream, metadata, and filename.
 * @throws {PhotoNotFoundError} if photo not found or user not authorized.
 * @throws {PhotoFileNotFoundError} if converted file not available.
 */
export async function getConvertedStream(
  photoId: string,
  userId: string,
): Promise<PhotoStreamResult> {
  const photo = await db.query.photos.findFirst({
    columns: {
      id: true,
      userId: true,
      convertedJpgStorageId: true,
      originalFilename: true,
    },
    where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
  });

  if (!photo) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  if (!photo.convertedJpgStorageId) {
    throw new PhotoFileNotFoundError("Converted JPG file not available");
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(photo.convertedJpgStorageId);

    const baseFilename = photo.originalFilename?.replace(/\.[^/.]+$/, "") || photo.id;

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: "image/jpeg",
      },
      filename: `${baseFilename}-converted.jpg`,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new PhotoFileNotFoundError("Converted file not found in storage");
    }
    throw error;
  }
}

/**
 * Gets the AI analysis JSON file as a stream.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with stream, metadata, and filename.
 * @throws {PhotoNotFoundError} if photo not found or user not authorized.
 * @throws {PhotoFileNotFoundError} if analysis file not found.
 */
export async function getAnalysisStream(
  photoId: string,
  userId: string,
): Promise<PhotoStreamResult> {
  const photo = await db.query.photos.findFirst({
    columns: { id: true, userId: true },
    where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
  });

  if (!photo) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  try {
    const analysisStorageId = `${userId}/photos/${photoId}/extracted.json`;
    const storage = getStorage();
    const { stream, metadata } = await storage.read(analysisStorageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: "application/json",
      },
      filename: `${photo.id}-analysis.json`,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new PhotoFileNotFoundError("AI analysis not found or not yet generated");
    }
    throw error;
  }
}

/**
 * Gets the content markdown file as a stream.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with stream, metadata, filename, and title.
 * @throws {PhotoNotFoundError} if photo not found or user not authorized.
 * @throws {PhotoFileNotFoundError} if content file not found.
 */
export async function getContentStream(
  photoId: string,
  userId: string,
): Promise<PhotoStreamResult & { title: string }> {
  const photo = await db.query.photos.findFirst({
    columns: { id: true, userId: true, title: true },
    where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
  });

  if (!photo) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  try {
    const contentStorageId = `${userId}/photos/${photoId}/content.md`;
    const storage = getStorage();
    const { stream, metadata } = await storage.read(contentStorageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: "text/markdown",
      },
      filename: `${photo.title || photo.id}-content.md`,
      title: photo.title,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new PhotoFileNotFoundError("Content not found or not yet generated");
    }
    throw error;
  }
}

/**
 * Gets the photo file as a stream, intelligently choosing between original
 * and converted JPG for browser compatibility (HEIC → JPG, etc.).
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with stream, metadata, and filename.
 * @throws {PhotoNotFoundError} if photo not found or user not authorized.
 * @throws {PhotoForbiddenError} if access denied.
 * @throws {PhotoFileNotFoundError} if file not found in storage.
 */
export async function getViewStream(
  photoId: string,
  userId: string,
): Promise<PhotoStreamResult> {
  // Use LEFT JOIN to get photo data along with processing status
  const [result] = await db
    .select({
      photo: {
        storageId: photos.storageId,
        userId: photos.userId,
        mimeType: photos.mimeType,
        convertedJpgStorageId: photos.convertedJpgStorageId,
        originalFilename: photos.originalFilename,
      },
      status: queueJobs.status,
    })
    .from(photos)
    .leftJoin(
      queueJobs,
      eq(queueJobs.key, sql`'photos:' || ${photos.id}`),
    )
    .where(and(eq(photos.id, photoId), eq(photos.userId, userId)))
    .limit(1);

  if (!result || !result.photo) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  const photoMeta = result.photo;
  const processingStatus = result.status;

  if (photoMeta.userId !== userId) {
    throw new PhotoForbiddenError("Access denied");
  }

  // If the photo has failed processing and has no storageId, return a specific error
  if (processingStatus === "failed" && !photoMeta.storageId) {
    throw new PhotoFileNotFoundError("Photo processing failed and file is not available");
  }

  const originalMimeType = photoMeta.mimeType || "application/octet-stream";
  let storageId: string;
  let mimeType: string;

  // If it's HEIC/HEIF and a converted JPG exists, serve the JPG
  if (
    (originalMimeType === "image/heic" || originalMimeType === "image/heif") &&
    photoMeta.convertedJpgStorageId
  ) {
    storageId = photoMeta.convertedJpgStorageId;
    mimeType = "image/jpeg";
  } else if (!photoMeta.storageId) {
    logger.error({ photoId }, "Photo is missing its primary storageId");
    throw new PhotoFileNotFoundError("File reference missing for photo");
  } else {
    storageId = photoMeta.storageId;
    mimeType = originalMimeType;
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(storageId);

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: mimeType,
      },
      filename: photoMeta.originalFilename || `${photoId}-view`,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new PhotoFileNotFoundError("Photo file not found in storage");
    }
    throw error;
  }
}

/**
 * Gets the photo thumbnail as a stream.
 * @param photoId The ID of the photo.
 * @param userId The ID of the user requesting (for authorization).
 * @returns Object with stream, metadata, and filename.
 * @throws {PhotoNotFoundError} if photo not found or user not authorized.
 * @throws {PhotoForbiddenError} if access denied.
 * @throws {PhotoFileNotFoundError} if thumbnail not available.
 */
export async function getThumbnailStream(
  photoId: string,
  userId: string,
): Promise<PhotoStreamResult> {
  const photoMeta = await db.query.photos.findFirst({
    columns: { thumbnailStorageId: true, userId: true, originalFilename: true },
    where: and(eq(photos.id, photoId), eq(photos.userId, userId)),
  });

  if (!photoMeta) {
    throw new PhotoNotFoundError("Photo not found or access denied");
  }

  if (photoMeta.userId !== userId) {
    throw new PhotoForbiddenError("Access denied");
  }

  if (!photoMeta.thumbnailStorageId) {
    throw new PhotoFileNotFoundError("Thumbnail not available for this photo");
  }

  try {
    const storage = getStorage();
    const { stream, metadata } = await storage.read(photoMeta.thumbnailStorageId);

    const baseFilename = photoMeta.originalFilename?.replace(/\.[^/.]+$/, "") || photoId;

    return {
      stream,
      metadata: {
        size: metadata.size,
        contentType: "image/jpeg", // Thumbnails are always JPEG
      },
      filename: `${baseFilename}-thumbnail.jpg`,
    };
  } catch (error: any) {
    if (error.code === "ENOENT") {
      throw new PhotoFileNotFoundError("Thumbnail file not found in storage");
    }
    throw error;
  }
}
