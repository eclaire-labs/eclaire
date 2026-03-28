// schemas/media-params.ts
import z from "zod/v4";
import { makePartial } from "./common.js";

// Full media metadata schema for updates
export const MediaSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .meta({
        description: "Title of the media",
        examples: [
          "Interview Recording",
          "Product Demo Video",
          "Podcast Episode 12",
        ],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the media",
        examples: ["Recording of the Q3 planning meeting", null],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
        description: "Array of tags to categorize the media",
        examples: [
          ["interview", "q3", "planning"],
          ["podcast", "episode"],
          ["demo", "product"],
        ],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .meta({
        description: "Review status of the media",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the media (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the media is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the media in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    processingEnabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this media",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "MediaRequest",
    description: "Complete media metadata for creation or full update",
  });

// Partial media update schema — all fields optional, defaults stripped
export const PartialMediaSchema = makePartial(MediaSchema).meta({
  ref: "PartialMediaRequest",
  description: "Partial media metadata for updates",
});

// Metadata schema for multipart form uploads
export const MediaMetadataSchema = z
  .object({
    title: z
      .string()
      .optional()
      .meta({
        description:
          "Title of the media (will default to filename if not provided)",
        examples: ["My Recording"],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the media",
        examples: ["Interview with the product team"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the media",
        examples: [["interview", "product"]],
      }),

    originalFilename: z
      .string()
      .optional()
      .meta({
        description: "Original filename of the uploaded media",
        examples: ["recording-2025-01-15.mp3", "demo-video.mp4"],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the media in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
      .meta({
        description: "Review status of the media",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .optional()
      .meta({
        description: "Flag color for the media (optional)",
        examples: ["red", "green", "blue", null],
      }),

    isPinned: z
      .boolean()
      .optional()
      .meta({
        description: "Whether the media is pinned",
        examples: [true, false],
      }),

    processingEnabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this media",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "MediaMetadata",
    description: "Metadata for media upload via multipart form",
  });

// Search parameters schema
export const MediaSearchParamsSchema = z.object({
  text: z
    .string()
    .optional()
    .meta({
      description: "Text search across media titles and descriptions",
      examples: ["interview", "podcast recording"],
    }),

  tags: z
    .string()
    .optional()
    .meta({
      description: "Comma-separated list of tags to filter by",
      examples: ["interview,meeting", "podcast,episode"],
    }),

  mediaType: z
    .enum(["audio", "video"])
    .optional()
    .meta({
      description: "Filter by media type (audio or video)",
      examples: ["audio", "video"],
    }),

  startDate: z
    .string()
    .optional()
    .meta({
      description: "Start date for filtering media (YYYY-MM-DD format)",
      examples: ["2024-01-01"],
    }),

  endDate: z
    .string()
    .optional()
    .meta({
      description: "End date for filtering media (YYYY-MM-DD format)",
      examples: ["2024-12-31"],
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

  limit: z.coerce
    .number()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .meta({
      description: "Maximum number of media items to return per page",
      examples: [25, 50, 100],
    }),

  cursor: z
    .string()
    .optional()
    .meta({
      description:
        "Opaque cursor for pagination. Pass the nextCursor from the previous response to get the next page.",
      examples: ["eyJzIjoiMjAyNS0wMS0wMVQwMDowMDowMFoiLCJpZCI6Im1kYV8xMjMifQ"],
    }),

  sortBy: z
    .enum(["createdAt", "title", "duration", "relevance"])
    .optional()
    .default("createdAt")
    .meta({
      description:
        "Field to sort media by. Use 'relevance' with text search for best results.",
      examples: ["createdAt", "title", "duration", "relevance"],
    }),

  sortDir: z
    .enum(["asc", "desc"])
    .optional()
    .default("desc")
    .meta({
      description: "Sort direction",
      examples: ["asc", "desc"],
    }),
});

// Import from URL schema
export const MediaImportSchema = z
  .object({
    url: z.url("Must be a valid URL").meta({
      description:
        "URL to import media from (YouTube, Vimeo, direct file link, etc.)",
      examples: [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://example.com/video.mp4",
      ],
    }),

    title: z
      .string()
      .optional()
      .meta({
        description:
          "Title for the media (will be auto-populated from source metadata if not provided)",
        examples: ["My Video", "Podcast Episode 42"],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the media",
        examples: ["Downloaded from YouTube for transcription"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .default([])
      .meta({
        description: "Array of tags to categorize the media",
        examples: [["youtube", "tutorial"], ["podcast"]],
      }),

    processingEnabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "MediaImport",
    description: "Import media from a URL",
  });

// Path parameters
export const MediaIdParam = z
  .object({
    id: z.string().meta({
      description: "Unique identifier of the media",
      examples: ["clxyz789def", "media_67890"],
    }),
  })
  .meta({
    ref: "MediaIdParam",
  });

// Form data schema for file uploads
export const MediaUploadSchema = z
  .object({
    content: z.any().meta({
      description: "Media file content",
      type: "string",
      format: "binary",
    }),
    metadata: z.string().meta({
      description: "JSON string containing media metadata",
      examples: [
        '{"title": "My Recording", "tags": ["interview", "meeting"], "reviewStatus": "pending"}',
      ],
    }),
  })
  .meta({
    ref: "MediaUpload",
    description: "Multipart form data for media upload",
  });
