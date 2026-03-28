// schemas/notes-params.ts
import z from "zod/v4";
import {
  flagColorUpdateSchema,
  isPinnedUpdateSchema,
  makePartial,
  reviewStatusUpdateSchema,
} from "./common.js";

// Full note creation/update schema
export const NoteSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .meta({
        description: "Title of the note",
        examples: [
          "Meeting Notes - Q1 Planning",
          "Research Ideas",
          "Daily Journal Entry",
        ],
      }),

    content: z
      .string()
      .default("")
      .meta({
        description: "Main content of the note (optional)",
        examples: [
          "# Meeting Notes\n\nDiscussed the Q1 roadmap and key priorities...",
          "Today I learned about...",
          "",
        ],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
        description: "Array of tags to categorize the note",
        examples: [
          ["work", "meeting"],
          ["personal", "journal"],
          ["research", "ideas"],
        ],
      }),

    deviceName: z
      .string()
      .optional()
      .meta({
        description: "Name of the device that created this note",
        examples: ["iPhone", "MacBook Pro", "Android Phone"],
      }),

    deviceModel: z
      .string()
      .optional()
      .meta({
        description: "Model of the device that created this note",
        examples: ["iPhone 15 Pro", "MacBook Pro M2", "Samsung Galaxy S24"],
      }),

    processingEnabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this note",
        examples: [true, false],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .meta({
        description: "Review status of the note",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the note (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the note is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the note in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),
  })
  .meta({
    ref: "NoteRequest",
    description: "Complete note data for creation or full update",
  });

// Partial note update schema — all fields optional, defaults stripped
export const PartialNoteSchema = makePartial(NoteSchema).meta({
  ref: "PartialNoteRequest",
  description: "Partial note data for updates",
});

// Multipart form metadata schema (for file uploads)
export const NoteMetadataSchema = z
  .object({
    title: z
      .string()
      .optional()
      .meta({
        description:
          'Optional title for the note (will default to "Untitled Note" if not provided)',
        examples: ["Uploaded Document Notes", "File Analysis"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Optional array of tags to categorize the note",
        examples: [
          ["upload", "document"],
          ["analysis", "research"],
        ],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the note in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    processingEnabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this note",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "NoteMetadata",
    description: "Metadata for multipart form note creation",
  });

// Search/query parameters schema
export const NoteSearchSchema = z.object({
  text: z
    .string()
    .optional()
    .meta({
      description: "Search text to find in note titles and content",
      examples: ["meeting", "research ideas", "Q1 planning"],
    }),

  tags: z
    .string()
    .optional()
    .meta({
      description: "Comma-separated list of tags to filter by",
      examples: ["work,meeting", "personal", "research,ideas"],
    }),

  startDate: z
    .string()
    .datetime()
    .optional()
    .meta({
      description:
        "Filter notes created on or after this date (ISO 8601 format)",
      examples: ["2024-01-01T00:00:00Z"],
    }),

  endDate: z
    .string()
    .datetime()
    .optional()
    .meta({
      description:
        "Filter notes created on or before this date (ISO 8601 format)",
      examples: ["2024-12-31T23:59:59Z"],
    }),

  dueDateStart: z
    .string()
    .datetime()
    .optional()
    .meta({
      description:
        "Filter notes with due dates on or after this date (ISO 8601 format)",
      examples: ["2024-01-01T00:00:00Z"],
    }),

  dueDateEnd: z
    .string()
    .datetime()
    .optional()
    .meta({
      description:
        "Filter notes with due dates on or before this date (ISO 8601 format)",
      examples: ["2024-12-31T23:59:59Z"],
    }),

  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(200)
    .default(50)
    .meta({
      description: "Maximum number of results to return per page",
      examples: ["10", "50", "100"],
    }),

  cursor: z
    .string()
    .optional()
    .meta({
      description:
        "Opaque cursor for pagination. Pass the nextCursor from the previous response to get the next page.",
      examples: ["eyJzIjoiMjAyNS0wMS0wMVQwMDowMDowMFoiLCJpZCI6Im50ZV8xMjMifQ"],
    }),

  sortBy: z
    .enum(["createdAt", "title", "relevance"])
    .optional()
    .default("createdAt")
    .meta({
      description:
        "Field to sort notes by. Use 'relevance' with text search for best results.",
      examples: ["createdAt", "title", "relevance"],
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

// Path parameters
export const NoteIdParam = z
  .object({
    id: z.string().meta({
      description: "Unique identifier of the note",
      examples: ["clxyz123abc", "note_12345"],
    }),
  })
  .meta({
    ref: "NoteIdParam",
    description: "Path parameter for note ID",
  });

// Request schemas for review/flag/pin status updates
export const NoteReviewUpdateSchema = reviewStatusUpdateSchema(
  "note",
  "NoteReviewUpdate",
);
export const NoteFlagUpdateSchema = flagColorUpdateSchema(
  "note",
  "NoteFlagUpdate",
);
export const NotePinUpdateSchema = isPinnedUpdateSchema(
  "note",
  "NotePinUpdate",
);
