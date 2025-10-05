// schemas/photos-responses.ts
import z from "zod/v4";

// Full photo response schema
export const PhotoResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the photo",
    }),

    title: z.string().meta({
      description: "Title of the photo",
    }),

    description: z.string().nullable().meta({
      description: "Description of the photo",
    }),

    // Display URLs
    imageUrl: z.string().meta({
      description:
        "URL to view the photo (smart serving - original or converted)",
      examples: ["/api/photos/abc123/view"],
    }),

    thumbnailUrl: z
      .string()
      .nullable()
      .meta({
        description: "URL to view the photo thumbnail (null if not available)",
        examples: ["/api/photos/abc123/thumbnail"],
      }),

    // Basic metadata
    tags: z.array(z.string()).meta({
      description: "Tags associated with the photo",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when photo was created",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when photo was last updated",
    }),

    dueDate: z.string().nullable().meta({
      description:
        "Due date for the photo in ISO 8601 format (null if not set)",
    }),

    dateTaken: z.string().nullable().meta({
      description:
        "ISO 8601 timestamp when the photo was taken (from EXIF data)",
    }),

    deviceId: z.string().nullable().meta({
      description: "Device ID associated with the photo",
    }),

    // File information
    originalFilename: z.string().meta({
      description: "Original filename of the uploaded photo",
    }),

    mimeType: z.string().meta({
      description: "MIME type of the photo file",
      examples: ["image/jpeg", "image/png", "image/webp", "image/heic"],
    }),

    fileSize: z.number().meta({
      description: "Size of the photo file in bytes",
    }),

    // EXIF Data
    cameraMake: z
      .string()
      .nullable()
      .meta({
        description: "Camera manufacturer (from EXIF data)",
        examples: ["Apple", "Canon", "Nikon"],
      }),

    cameraModel: z
      .string()
      .nullable()
      .meta({
        description: "Camera model (from EXIF data)",
        examples: ["iPhone 12 Pro", "EOS R5", "D850"],
      }),

    lensModel: z.string().nullable().meta({
      description: "Lens model (from EXIF data)",
    }),

    iso: z
      .number()
      .nullable()
      .meta({
        description: "ISO sensitivity (from EXIF data)",
        examples: [100, 400, 1600],
      }),

    fNumber: z
      .number()
      .nullable()
      .meta({
        description: "F-stop number (from EXIF data)",
        examples: [1.4, 2.8, 5.6],
      }),

    exposureTime: z
      .number()
      .nullable()
      .meta({
        description: "Exposure time in seconds (from EXIF data)",
        examples: [0.001, 0.0625, 2.0],
      }),

    orientation: z
      .number()
      .nullable()
      .meta({
        description: "Image orientation (EXIF orientation value)",
        examples: [1, 6, 8],
      }),

    imageWidth: z.number().nullable().meta({
      description: "Width of the image in pixels",
    }),

    imageHeight: z.number().nullable().meta({
      description: "Height of the image in pixels",
    }),

    // Location Data
    latitude: z.number().nullable().meta({
      description: "GPS latitude coordinate",
    }),

    longitude: z.number().nullable().meta({
      description: "GPS longitude coordinate",
    }),

    altitude: z.number().nullable().optional().meta({
      description: "GPS altitude in meters",
    }),

    locationCity: z.string().nullable().meta({
      description: "City name derived from GPS coordinates",
    }),

    locationCountryIso2: z
      .string()
      .nullable()
      .meta({
        description: "ISO 3166-1 alpha-2 country code",
        examples: ["US", "CA", "GB"],
      }),

    locationCountryName: z.string().nullable().meta({
      description: "Country name derived from GPS coordinates",
    }),

    // AI Generated Data
    photoType: z
      .string()
      .nullable()
      .meta({
        description: "AI-generated photo type classification",
        examples: ["portrait", "landscape", "document", "product"],
      }),

    ocrText: z.string().nullable().meta({
      description: "Text extracted from the photo via OCR",
    }),

    dominantColors: z
      .array(z.string())
      .nullable()
      .meta({
        description: "Array of dominant color names in the photo",
        examples: [
          ["blue", "green", "white"],
          ["red", "yellow"],
        ],
      }),

    // Review and Workflow
    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "Review status of the photo",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the photo (null if not flagged)",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the photo is pinned",
    }),

    // Processing Status
    processingStatus: z.string().meta({
      description: "Current processing status of the photo",
      examples: ["pending", "processing", "completed", "failed"],
    }),

    // Storage and Technical Information
    storageId: z.string().meta({
      description: "Storage identifier for the original photo",
    }),

    thumbnailStorageId: z.string().nullable().meta({
      description:
        "Storage identifier for the thumbnail (null if not available)",
    }),

    convertedJpgStorageId: z.string().nullable().meta({
      description:
        "Storage identifier for converted JPG (null if not available)",
    }),

    isOriginalViewable: z.boolean().meta({
      description:
        "Whether the original file format is directly viewable in browsers",
    }),
  })
  .meta({ ref: "PhotoResponse" });

// Array of photos response
export const PhotosListResponseSchema = z.array(PhotoResponseSchema).meta({
  ref: "PhotosListResponse",
  description: "Array of photo objects",
});

// Search results response with pagination
export const PhotoSearchResponseSchema = z
  .object({
    photos: z.array(PhotoResponseSchema).meta({
      description: "Array of photos matching the search criteria",
    }),

    totalCount: z.number().meta({
      description: "Total number of photos matching the search criteria",
    }),

    limit: z.number().meta({
      description: "Maximum number of photos returned in this response",
    }),
  })
  .meta({
    ref: "PhotoSearchResponse",
    description: "Search results with pagination information",
  });

// Created photo response (for POST requests)
export const CreatedPhotoResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the created photo",
    }),

    title: z.string().meta({
      description: "Title of the photo",
    }),

    description: z.string().nullable().meta({
      description: "Description of the photo",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the photo",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when photo was created",
    }),

    dueDate: z.string().nullable().meta({
      description:
        "Due date for the photo in ISO 8601 format (null if not set)",
    }),

    originalFilename: z.string().nullable().meta({
      description: "Original filename of the uploaded photo",
    }),

    mimeType: z.string().meta({
      description: "MIME type of the photo file",
    }),

    fileSize: z.number().meta({
      description: "Size of the photo file in bytes",
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
