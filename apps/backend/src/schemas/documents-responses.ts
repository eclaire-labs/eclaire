// schemas/documents-responses.ts
import { z } from "zod";
import "zod-openapi/extend";

// Full document response schema
export const DocumentResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the document",
    }),

    title: z.string().openapi({
      description: "Title of the document",
    }),

    description: z.string().nullable().openapi({
      description: "Description of the document",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the document",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when document was created",
    }),

    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when document was last updated",
    }),

    dueDate: z.string().nullable().openapi({
      description:
        "Due date for the document in ISO 8601 format (null if not set)",
    }),

    // File metadata
    originalFilename: z.string().nullable().openapi({
      description: "Original filename of the uploaded document",
    }),

    mimeType: z.string().openapi({
      description: "MIME type of the document",
    }),

    fileSize: z.number().nullable().openapi({
      description: "Size of the document in bytes",
    }),

    // Processing status
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .openapi({
        description:
          "Status of document processing (OCR, text extraction, etc.)",
      }),

    // Review and organization
    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the document",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the document (null if not flagged)",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the document is pinned",
    }),

    // Asset URLs
    thumbnailUrl: z.string().nullable().openapi({
      description: "URL to access the document thumbnail image (800x600 JPG)",
    }),

    screenshotUrl: z.string().nullable().openapi({
      description:
        "URL to access the document high-resolution screenshot (1920x1440 JPG)",
    }),

    pdfUrl: z.string().nullable().openapi({
      description: "URL to access the generated PDF version",
    }),

    contentUrl: z.string().nullable().openapi({
      description: "URL to access the extracted content (markdown)",
    }),

    // File URLs
    fileUrl: z.string().nullable().openapi({
      description: "URL to access the original document file",
    }),

    // Content availability flags (deprecated - use contentUrl instead)
    hasExtractedText: z.boolean().optional().openapi({
      description:
        "Whether text content has been extracted from the document (deprecated)",
    }),

    hasOcr: z.boolean().optional().openapi({
      description:
        "Whether OCR processing has been completed for image-based documents (deprecated)",
    }),

    // Optional extracted content metadata
    extractedText: z.string().nullable().openapi({
      description:
        "Text content extracted from the document (may be truncated)",
    }),

    pageCount: z.number().nullable().optional().openapi({
      description:
        "Number of pages in the document (for PDFs and similar formats)",
    }),
  })
  .openapi({ ref: "DocumentResponse" });

// Array of documents response
export const DocumentsListResponseSchema = z
  .array(DocumentResponseSchema)
  .openapi({
    ref: "DocumentsListResponse",
    description: "Array of document objects",
  });

// Search results response (with pagination info)
export const DocumentSearchResponseSchema = z
  .object({
    documents: z.array(DocumentResponseSchema).openapi({
      description: "Array of documents matching the search criteria",
    }),

    totalCount: z.number().openapi({
      description: "Total number of documents matching the search criteria",
    }),

    limit: z.number().openapi({
      description: "Maximum number of documents returned in this response",
    }),
  })
  .openapi({
    ref: "DocumentSearchResponse",
    description: "Search results with pagination metadata",
  });

// Created document response (for POST requests)
export const CreatedDocumentResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the created document",
    }),

    title: z.string().openapi({
      description: "Title of the document",
    }),

    description: z.string().nullable().openapi({
      description: "Description of the document",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the document",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when document was created",
    }),

    dueDate: z.string().nullable().openapi({
      description:
        "Due date for the document in ISO 8601 format (null if not set)",
    }),

    originalFilename: z.string().nullable().openapi({
      description: "Original filename of the uploaded document",
    }),

    mimeType: z.string().openapi({
      description: "MIME type of the document",
    }),

    fileSize: z.number().nullable().openapi({
      description: "Size of the document in bytes",
    }),

    processingStatus: z.enum(["pending", "processing"]).openapi({
      description:
        "Initial processing status - background jobs will extract text and perform OCR",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the document",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the document (null if not flagged)",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the document is pinned",
    }),

    fileUrl: z.string().nullable().openapi({
      description: "URL to access the original document file",
    }),

    thumbnailUrl: z.string().nullable().openapi({
      description: "URL to access the document thumbnail image (800x600 JPG)",
    }),

    screenshotUrl: z.string().nullable().openapi({
      description:
        "URL to access the document high-resolution screenshot (1920x1440 JPG)",
    }),

    pdfUrl: z.string().nullable().openapi({
      description: "URL to access the generated PDF version",
    }),

    contentUrl: z.string().nullable().openapi({
      description: "URL to access the extracted content (markdown)",
    }),
  })
  .openapi({ ref: "CreatedDocumentResponse" });

// Document not found error
export const DocumentNotFoundSchema = z
  .object({
    error: z.literal("Document not found").openapi({
      description: "Document with the specified ID was not found",
    }),
  })
  .openapi({ ref: "DocumentNotFound" });

// File not found error (for file download endpoint)
export const FileNotFoundSchema = z
  .object({
    error: z.string().openapi({
      description: "Error message indicating the file was not found",
      examples: ["Document or file not found", "File not found on storage"],
    }),
  })
  .openapi({ ref: "FileNotFound" });
