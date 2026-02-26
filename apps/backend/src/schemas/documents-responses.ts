// schemas/documents-responses.ts
import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

// Full document response schema
export const DocumentResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the document",
    }),

    title: z.string().meta({
      description: "Title of the document",
    }),

    description: z.string().nullable().meta({
      description: "Description of the document",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the document",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when document was created",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when document was last updated",
    }),

    dueDate: z.string().nullable().meta({
      description:
        "Due date for the document in ISO 8601 format (null if not set)",
    }),

    // File metadata
    originalFilename: z.string().nullable().meta({
      description: "Original filename of the uploaded document",
    }),

    mimeType: z.string().meta({
      description: "MIME type of the document",
    }),

    fileSize: z.number().nullable().meta({
      description: "Size of the document in bytes",
    }),

    // Processing status
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .meta({
        description:
          "Status of document processing (OCR, text extraction, etc.)",
      }),

    // Review and organization
    reviewStatus: reviewStatusSchema.meta({
      description: "Review status of the document",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the document (null if not flagged)",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the document is pinned",
    }),

    // Asset URLs
    thumbnailUrl: z.string().nullable().meta({
      description: "URL to access the document thumbnail image (800x600 JPG)",
    }),

    screenshotUrl: z.string().nullable().meta({
      description:
        "URL to access the document high-resolution screenshot (1920x1440 JPG)",
    }),

    pdfUrl: z.string().nullable().meta({
      description: "URL to access the generated PDF version",
    }),

    contentUrl: z.string().nullable().meta({
      description: "URL to access the extracted content (markdown)",
    }),

    // File URLs
    fileUrl: z.string().nullable().meta({
      description: "URL to access the original document file",
    }),

    // Optional extracted content metadata
    extractedText: z.string().nullable().meta({
      description:
        "Text content extracted from the document (may be truncated)",
    }),

    pageCount: z.number().nullable().optional().meta({
      description:
        "Number of pages in the document (for PDFs and similar formats)",
    }),
  })
  .meta({ ref: "DocumentResponse" });

// Paginated list response (used for both full listing and search results)
export const DocumentsListResponseSchema = paginatedResponseSchema(
  DocumentResponseSchema,
  "DocumentsListResponse",
  "documents",
);

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
