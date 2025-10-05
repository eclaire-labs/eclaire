// schemas/notes-params.ts
import z from "zod/v4";

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

    enabled: z
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

// Partial note update schema
export const PartialNoteSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .optional()
      .meta({
        description: "Title of the note",
        examples: ["Updated Meeting Notes"],
      }),

    content: z
      .string()
      .optional()
      .meta({
        description: "Main content of the note (optional)",
        examples: ["Updated content with new information...", ""],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the note",
        examples: [["updated", "tags"]],
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

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description: "Whether background processing is enabled for this note",
        examples: [true, false],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
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
      .optional()
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
        examples: ["2025-07-01T10:00:00Z", null],
      }),
  })
  .meta({
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

    enabled: z
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
export const NoteSearchSchema = z
  .object({
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

    limit: z
      .coerce.number()
      .int()
      .positive()
      .default(50)
      .meta({
        description: "Maximum number of results to return",
        examples: ["10", "50", "100"],
      }),

    offset: z
      .coerce.number()
      .int()
      .nonnegative()
      .default(0)
      .meta({
        description: "Number of results to skip (for pagination)",
        examples: ["0", "10", "50"],
      }),
  })
  .meta({
    ref: "NoteSearchParams",
    description: "Query parameters for searching and filtering notes",
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

// Request schema for review status update
export const NoteReviewUpdateSchema = z
  .object({
    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "New review status for the note",
      examples: ["accepted", "rejected"],
    }),
  })
  .meta({ ref: "NoteReviewUpdate" });

// Request schema for flag color update
export const NoteFlagUpdateSchema = z
  .object({
    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the note (null to remove flag)",
        examples: ["red", "green", null],
      }),
  })
  .meta({ ref: "NoteFlagUpdate" });

// Request schema for pin status update
export const NotePinUpdateSchema = z
  .object({
    isPinned: z.boolean().meta({
      description: "Whether to pin or unpin the note",
      examples: [true, false],
    }),
  })
  .meta({ ref: "NotePinUpdate" });
