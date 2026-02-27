// schemas/documents-responses.ts
import z from "zod/v4";

// Re-export the shared response schema from @eclaire/api-types
export {
  DocumentResponseSchema,
  DocumentsListResponseSchema,
} from "@eclaire/api-types/documents";

import { DocumentResponseSchema } from "@eclaire/api-types/documents";

// Created document response (for POST requests) — omits fields not available at creation time,
// restricts processingStatus to initial states
export const CreatedDocumentResponseSchema = DocumentResponseSchema.omit({
  updatedAt: true,
  extractedText: true,
  pageCount: true,
  processingStatus: true,
})
  .extend({
    processingStatus: z.enum(["pending", "processing"]).meta({
      description:
        "Initial processing status - background jobs will extract text and perform OCR",
    }),
  })
  .meta({ ref: "CreatedDocumentResponse" });

// Document not found error
export const DocumentNotFoundSchema = z
  .object({
    error: z.literal("Document not found").meta({
      description: "Document with the specified ID was not found",
    }),
  })
  .meta({ ref: "DocumentNotFound" });

// File not found error (for file download endpoint)
export const FileNotFoundSchema = z
  .object({
    error: z.string().meta({
      description: "Error message indicating the file was not found",
      examples: ["Document or file not found", "File not found on storage"],
    }),
  })
  .meta({ ref: "FileNotFound" });
