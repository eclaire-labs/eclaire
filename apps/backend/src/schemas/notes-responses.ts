// schemas/notes-responses.ts
import { z } from "zod";
import "zod-openapi/extend";

// Full note response schema
export const NoteResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the note",
    }),

    title: z.string().openapi({
      description: "Title of the note",
    }),

    content: z.string().openapi({
      description: "Main content of the note",
    }),

    description: z.string().openapi({
      description: "Short description or excerpt from the note content",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the note",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when note was created",
    }),

    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when note was last updated",
    }),

    processingStatus: z.string().openapi({
      description: "Status of background processing for this note",
      examples: ["pending", "processing", "completed", "failed"],
    }),

    dueDate: z.string().nullable().openapi({
      description: "Due date for the note in ISO 8601 format (null if not set)",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the note",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the note (null if not set)",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the note is pinned",
    }),

    // File metadata (for uploaded notes)
    originalMimeType: z.string().nullable().optional().openapi({
      description:
        "Original MIME type of uploaded file (if note was created from file upload)",
    }),

    fileSize: z.number().nullable().optional().openapi({
      description:
        "Size of the original file in bytes (if note was created from file upload)",
    }),

    // Additional metadata stored as JSON
    metadata: z.record(z.any()).nullable().optional().openapi({
      description: "Additional metadata associated with the note",
    }),
  })
  .openapi({ ref: "NoteResponse" });

// Array of notes response
export const NotesListResponseSchema = z
  .object({
    entries: z.array(NoteResponseSchema).openapi({
      description: "Array of note objects",
    }),

    pagination: z
      .object({
        total: z.number().openapi({
          description: "Total number of notes matching the query",
        }),

        limit: z.number().openapi({
          description: "Maximum number of results returned",
        }),

        offset: z.number().openapi({
          description: "Number of results skipped",
        }),
      })
      .openapi({
        description: "Pagination information",
      }),
  })
  .openapi({
    ref: "NotesListResponse",
    description: "Response containing an array of notes with pagination info",
  });

// Created note response (for POST requests)
export const CreatedNoteResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the created note",
    }),

    title: z.string().openapi({
      description: "Title of the note",
    }),

    content: z.string().openapi({
      description: "Main content of the note",
    }),

    description: z.string().openapi({
      description: "Short description or excerpt from the note content",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the note",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when note was created",
    }),

    dueDate: z.string().nullable().openapi({
      description: "Due date for the note in ISO 8601 format (null if not set)",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the note",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the note (null if not set)",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the note is pinned",
    }),

    originalMimeType: z.string().nullable().optional().openapi({
      description: "Original MIME type if note was created from file upload",
    }),
  })
  .openapi({ ref: "CreatedNoteResponse" });

// Delete success response
export const NoteDeleteResponseSchema = z
  .object({
    message: z.literal("Note entry deleted successfully").openapi({
      description: "Confirmation message for successful deletion",
    }),
  })
  .openapi({ ref: "NoteDeleteResponse" });

// Note not found error
export const NoteNotFoundSchema = z
  .object({
    error: z.literal("Note entry not found").openapi({
      description: "Note with the specified ID was not found",
    }),
  })
  .openapi({ ref: "NoteNotFound" });

// Invalid file type error (for file uploads)
export const InvalidFileTypeSchema = z
  .object({
    error: z.string().openapi({
      description: "Error message indicating invalid file type for note upload",
      examples: [
        "Invalid content type for a note. Received application/pdf, expected one of: text/plain, text/markdown, text/html",
      ],
    }),
  })
  .openapi({ ref: "InvalidFileType" });
