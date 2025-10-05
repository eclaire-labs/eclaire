// schemas/photos-params.ts
import z from "zod/v4";

// Full photo metadata schema for updates
export const PhotoSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .meta({
        description: "Title of the photo",
        examples: [
          "Sunset at the Beach",
          "Family Vacation 2024",
          "Product Photography",
        ],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the photo",
        examples: ["Beautiful sunset captured during our beach vacation", null],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
        description: "Array of tags to categorize the photo",
        examples: [
          ["nature", "sunset", "beach"],
          ["family", "vacation"],
          ["product", "photography"],
        ],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .meta({
        description: "Review status of the photo",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the photo (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the photo is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the photo in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    deviceId: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Device ID associated with the photo",
        examples: ["iphone-12-pro", "camera-001", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this photo",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "PhotoRequest",
    description: "Complete photo metadata for creation or full update",
  });

// Partial photo update schema
export const PartialPhotoSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .optional()
      .meta({
        description: "Title of the photo",
        examples: ["Updated Photo Title"],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the photo",
        examples: ["Updated description", null],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the photo",
        examples: [["updated", "tags"]],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
      .meta({
        description: "Review status of the photo",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the photo (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .optional()
      .meta({
        description: "Whether the photo is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the photo in ISO 8601 format",
        examples: ["2025-07-01T10:00:00Z", null],
      }),

    deviceId: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Device ID associated with the photo",
        examples: ["iphone-12-pro", "camera-001", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .meta({
        description: "Whether background processing is enabled for this photo",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "PartialPhotoRequest",
    description: "Partial photo metadata for updates",
  });

// Metadata schema for multipart form uploads
export const PhotoMetadataSchema = z
  .object({
    title: z
      .string()
      .optional()
      .meta({
        description:
          "Title of the photo (will default to filename if not provided)",
        examples: ["My Photo Title"],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the photo",
        examples: ["A beautiful landscape photo"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the photo",
        examples: [["landscape", "nature"]],
      }),

    originalFilename: z
      .string()
      .optional()
      .meta({
        description: "Original filename of the uploaded photo",
        examples: ["IMG_1234.jpg", "vacation-photo.png"],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the photo in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    deviceId: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Device ID associated with the photo",
        examples: ["iphone-12-pro", "camera-001", null],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
      .meta({
        description: "Review status of the photo",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .optional()
      .meta({
        description: "Flag color for the photo (optional)",
        examples: ["red", "green", "blue", null],
      }),

    isPinned: z
      .boolean()
      .optional()
      .meta({
        description: "Whether the photo is pinned",
        examples: [true, false],
      }),

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this photo",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "PhotoMetadata",
    description: "Metadata for photo upload via multipart form",
  });

// Search parameters schema
export const PhotoSearchParamsSchema = z
  .object({
    text: z
      .string()
      .optional()
      .meta({
        description: "Text search across photo titles and descriptions",
        examples: ["sunset", "vacation photos"],
      }),

    tags: z
      .string()
      .optional()
      .meta({
        description: "Comma-separated list of tags to filter by",
        examples: ["nature,landscape", "family,vacation"],
      }),

    startDate: z
      .string()
      .optional()
      .meta({
        description: "Start date for filtering photos (YYYY-MM-DD format)",
        examples: ["2024-01-01"],
      }),

    endDate: z
      .string()
      .optional()
      .meta({
        description: "End date for filtering photos (YYYY-MM-DD format)",
        examples: ["2024-12-31"],
      }),

    locationCity: z
      .string()
      .optional()
      .meta({
        description: "Filter photos by city name",
        examples: ["New York", "San Francisco", "London"],
      }),

    dateField: z
      .enum(["createdAt", "dateTaken"])
      .optional()
      .default("createdAt")
      .meta({
        description: "Which date field to use for date range filtering",
        examples: ["createdAt", "dateTaken"],
      }),

    dueDateStart: z
      .string()
      .optional()
      .meta({
        description: "Start date for due date filtering (YYYY-MM-DD format)",
        examples: ["2024-01-01"],
      }),

    dueDateEnd: z
      .string()
      .optional()
      .meta({
        description: "End date for due date filtering (YYYY-MM-DD format)",
        examples: ["2024-12-31"],
      }),

    deviceId: z
      .string()
      .optional()
      .meta({
        description: "Filter photos by device ID",
        examples: ["iphone-12-pro", "camera-001"],
      }),

    limit: z.coerce
      .number()
      .min(1)
      .optional()
      .default(50)
      .meta({
        description: "Maximum number of photos to return",
        examples: [25, 50, 100, 9999],
      }),
  })
  .meta({
    ref: "PhotoSearchParams",
    description: "Search and filter parameters for photos",
  });

// Path parameters
export const PhotoIdParam = z
  .object({
    id: z.string().meta({
      description: "Unique identifier of the photo",
      examples: ["clxyz789def", "photo_67890"],
    }),
  })
  .meta({
    ref: "PhotoIdParam",
  });

// Form data schema for file uploads
export const PhotoUploadSchema = z
  .object({
    content: z.any().meta({
      description: "Photo file content",
      type: "string",
      format: "binary",
    }),
    metadata: z.string().meta({
      description: "JSON string containing photo metadata",
      examples: [
        '{"title": "My Photo", "tags": ["nature", "landscape"], "deviceId": "iphone-12-pro", "reviewStatus": "pending"}',
      ],
    }),
  })
  .meta({
    ref: "PhotoUpload",
    description: "Multipart form data for photo upload",
  });
