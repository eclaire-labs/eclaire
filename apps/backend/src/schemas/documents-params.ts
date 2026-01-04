// schemas/documents-params.ts
import z from "zod/v4";
import { reviewStatusSchema } from "./common.js";

// Full document update schema
export const DocumentSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .meta({
        description: "Title of the document",
        examples: [
          "Annual Report 2024",
          "Project Proposal Draft",
          "Meeting Notes",
        ],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the document",
        examples: [
          "Quarterly financial report with charts and analysis",
          "Draft proposal for new client project",
        ],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
        description: "Array of tags to categorize the document",
        examples: [
          ["finance", "report"],
          ["project", "draft", "client"],
        ],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .meta({
        description: "Review status of the document",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the document (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the document is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the document in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description:
          "Whether background processing is enabled for this document",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "DocumentRequest",
    description: "Complete document metadata for full update",
  });

// Partial document update schema
export const PartialDocumentSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .optional()
      .meta({
        description: "Title of the document",
        examples: ["Updated Document Title"],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the document",
        examples: ["Updated description with new information"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the document",
        examples: [["updated", "reviewed"]],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
      .meta({
        description: "Review status of the document",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the document (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .optional()
      .meta({
        description: "Whether the document is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the document in ISO 8601 format",
        examples: ["2025-07-01T10:00:00Z", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .meta({
        description:
          "Whether background processing is enabled for this document",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "PartialDocumentRequest",
    description: "Partial document metadata for updates",
  });

// Document creation metadata schema (for multipart form)
export const DocumentMetadataSchema = z
  .object({
    title: z
      .string()
      .optional()
      .meta({
        description:
          "Title of the document (defaults to filename if not provided)",
        examples: ["Custom Document Title"],
      }),

    description: z
      .string()
      .nullable()
      .optional()
      .meta({
        description: "Optional description or notes about the document",
        examples: ["Important document containing project specifications"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the document",
        examples: [["work", "important", "project"]],
      }),

    originalFilename: z
      .string()
      .optional()
      .meta({
        description: "Original filename of the uploaded document",
        examples: ["report.pdf", "proposal.docx"],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the document in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description:
          "Whether background processing is enabled for this document",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "DocumentMetadata",
    description:
      "Metadata for document creation (used in multipart form uploads)",
  });

// Search parameters schema
export const DocumentSearchParamsSchema = z
  .object({
    text: z
      .string()
      .optional()
      .meta({
        description:
          "Text to search for in document title, description, or content",
        examples: ["quarterly report", "project proposal"],
      }),

    tags: z
      .string()
      .optional()
      .meta({
        description: "Comma-separated list of tags to filter by",
        examples: ["finance,report", "project,draft"],
      }),

    startDate: z
      .string()
      .optional()
      .meta({
        description: "Start date for filtering documents (YYYY-MM-DD format)",
        examples: ["2024-01-01", "2024-06-01"],
        format: "date",
      }),

    endDate: z
      .string()
      .optional()
      .meta({
        description: "End date for filtering documents (YYYY-MM-DD format)",
        examples: ["2024-12-31", "2024-06-30"],
        format: "date",
      }),

    limit: z.coerce
      .number()
      .min(1)
      .max(10000)
      .optional()
      .default(50)
      .meta({
        description: "Maximum number of documents to return",
        examples: [10, 25, 50, 9999],
        minimum: 1,
        maximum: 10000,
      }),

    dueDateStart: z
      .string()
      .optional()
      .meta({
        description: "Start date for filtering by due date (YYYY-MM-DD format)",
        examples: ["2024-01-01", "2024-06-01"],
        format: "date",
      }),

    dueDateEnd: z
      .string()
      .optional()
      .meta({
        description: "End date for filtering by due date (YYYY-MM-DD format)",
        examples: ["2024-12-31", "2024-06-30"],
        format: "date",
      }),

    sortBy: z
      .enum([
        "createdAt",
        "updatedAt",
        "title",
        "mimeType",
        "fileSize",
        "originalFilename",
      ])
      .optional()
      .default("createdAt")
      .meta({
        description: "Field to sort documents by",
        examples: ["createdAt", "title", "fileSize"],
      }),

    sortDir: z
      .enum(["asc", "desc"])
      .optional()
      .default("desc")
      .meta({
        description: "Sort direction",
        examples: ["asc", "desc"],
      }),

    fileTypes: z
      .string()
      .optional()
      .meta({
        description:
          "Comma-separated list of file types/MIME types to filter by",
        examples: ["application/pdf", "image/jpeg,image/png"],
      }),
  })
  .meta({
    ref: "DocumentSearchParams",
    description: "Search and filter parameters for documents",
  });

// Specialized update schemas
export const DocumentReviewUpdateSchema = z
  .object({
    reviewStatus: reviewStatusSchema.meta({
      description: "New review status for the document",
      examples: ["accepted", "rejected"],
    }),
  })
  .meta({
    ref: "DocumentReviewUpdate",
    description: "Schema for updating document review status",
  });

export const DocumentFlagUpdateSchema = z
  .object({
    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the document (null to remove flag)",
        examples: ["red", "green", null],
      }),
  })
  .meta({
    ref: "DocumentFlagUpdate",
    description: "Schema for updating document flag color",
  });

export const DocumentPinUpdateSchema = z
  .object({
    isPinned: z.boolean().meta({
      description: "Whether to pin or unpin the document",
      examples: [true, false],
    }),
  })
  .meta({
    ref: "DocumentPinUpdate",
    description: "Schema for updating document pin status",
  });

// Path parameters
export const DocumentIdParam = z
  .object({
    id: z.string().meta({
      description: "Unique identifier of the document",
      examples: ["clxyz123abc", "doc_12345"],
    }),
  })
  .meta({
    ref: "DocumentIdParam",
    description: "Document ID path parameter",
  });
