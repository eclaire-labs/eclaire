// schemas/notes-responses.ts
import z from "zod/v4";

// Re-export the shared response schema from @eclaire/api-types
export {
  NoteResponseSchema,
  NotesListResponseSchema,
} from "@eclaire/api-types/notes";

import { NoteResponseSchema } from "@eclaire/api-types/notes";

// Created note response (for POST requests) — omits fields not available at creation time
export const CreatedNoteResponseSchema = NoteResponseSchema.omit({
  updatedAt: true,
  processingStatus: true,
  fileSize: true,
  metadata: true,
}).meta({ ref: "CreatedNoteResponse" });

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
