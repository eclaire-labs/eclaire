// schemas/notes-responses.ts
import z from "zod/v4";

// Full note response schema
export const NoteResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the note",
    }),

    title: z.string().meta({
      description: "Title of the note",
    }),

    content: z.string().meta({
      description: "Main content of the note",
    }),

    description: z.string().meta({
      description: "Short description or excerpt from the note content",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the note",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when note was created",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when note was last updated",
    }),

    processingStatus: z.string().meta({
      description: "Status of background processing for this note",
      examples: ["pending", "processing", "completed", "failed"],
    }),

    dueDate: z.string().nullable().meta({
      description: "Due date for the note in ISO 8601 format (null if not set)",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "Review status of the note",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the note (null if not set)",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the note is pinned",
    }),

    // File metadata (for uploaded notes)
    originalMimeType: z.string().nullable().optional().meta({
      description:
        "Original MIME type of uploaded file (if note was created from file upload)",
    }),

    fileSize: z.number().nullable().optional().meta({
      description:
        "Size of the original file in bytes (if note was created from file upload)",
    }),

    // Additional metadata stored as JSON
    metadata: z.record(z.string(), z.any()).nullable().optional().meta({
      description: "Additional metadata associated with the note",
    }),
  })
  .meta({ ref: "NoteResponse" });

// Array of notes response
export const NotesListResponseSchema = z
  .object({
    entries: z.array(NoteResponseSchema).meta({
      description: "Array of note objects",
    }),

    pagination: z
      .object({
        total: z.number().meta({
          description: "Total number of notes matching the query",
        }),

        limit: z.number().meta({
          description: "Maximum number of results returned",
        }),

        offset: z.number().meta({
          description: "Number of results skipped",
        }),
      })
      .meta({
        description: "Pagination information",
      }),
  })
  .meta({
    ref: "NotesListResponse",
    description: "Response containing an array of notes with pagination info",
  });

// Created note response (for POST requests)
export const CreatedNoteResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the created note",
    }),

    title: z.string().meta({
      description: "Title of the note",
    }),

    content: z.string().meta({
      description: "Main content of the note",
    }),

    description: z.string().meta({
      description: "Short description or excerpt from the note content",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the note",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when note was created",
    }),

    dueDate: z.string().nullable().meta({
      description: "Due date for the note in ISO 8601 format (null if not set)",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).meta({
      description: "Review status of the note",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the note (null if not set)",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the note is pinned",
    }),

    originalMimeType: z.string().nullable().optional().meta({
      description: "Original MIME type if note was created from file upload",
    }),
  })
  .meta({ ref: "CreatedNoteResponse" });

// Delete success response
export const NoteDeleteResponseSchema = z
  .object({
    message: z.literal("Note entry deleted successfully").meta({
      description: "Confirmation message for successful deletion",
    }),
  })
  .meta({ ref: "NoteDeleteResponse" });

// Note not found error
export const NoteNotFoundSchema = z
  .object({
    error: z.literal("Note entry not found").meta({
      description: "Note with the specified ID was not found",
    }),
  })
  .meta({ ref: "NoteNotFound" });

// Invalid file type error (for file uploads)
export const InvalidFileTypeSchema = z
  .object({
    error: z.string().meta({
      description: "Error message indicating invalid file type for note upload",
      examples: [
        "Invalid content type for a note. Received application/pdf, expected one of: text/plain, text/markdown, text/html",
      ],
    }),
  })
  .meta({ ref: "InvalidFileType" });
