// schemas/documents-routes.ts
import { resolver } from "hono-openapi";
import {
  ErrorResponseSchema,
  UnauthorizedSchema,
  ValidationErrorSchema,
} from "./all-responses.js";
import {
  DocumentFlagUpdateSchema,
  DocumentMetadataSchema,
  DocumentPinUpdateSchema,
  DocumentReviewUpdateSchema,
  DocumentSchema,
  DocumentSearchParamsSchema,
  PartialDocumentSchema,
} from "./documents-params.js";
import {
  CreatedDocumentResponseSchema,
  DocumentNotFoundSchema,
  DocumentResponseSchema,
  DocumentSearchResponseSchema,
  DocumentsListResponseSchema,
  FileNotFoundSchema,
} from "./documents-responses.js";

// GET /api/documents - Get all documents or search documents
export const getDocumentsRouteDescription = {
  tags: ["Documents"],
  summary: "Get all documents or search documents",
  description:
    "Retrieve all documents for the authenticated user or search with specific criteria",
  parameters: [
    {
      name: "text",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description:
        "Text to search for in document title, description, or content",
    },
    {
      name: "tags",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Comma-separated list of tags to filter by",
    },
    {
      name: "startDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "Start date for filtering documents (YYYY-MM-DD format)",
    },
    {
      name: "endDate",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "End date for filtering documents (YYYY-MM-DD format)",
    },
    {
      name: "limit",
      in: "query" as const,
      required: false,
      schema: {
        type: "integer" as const,
        minimum: 1,
        maximum: 100,
        default: 50,
      },
      description: "Maximum number of documents to return",
    },
    {
      name: "dueDateStart",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "Start date for filtering by due date (YYYY-MM-DD format)",
    },
    {
      name: "dueDateEnd",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const, format: "date" as const },
      description: "End date for filtering by due date (YYYY-MM-DD format)",
    },
    {
      name: "sortBy",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: [
          "createdAt",
          "updatedAt",
          "title",
          "mimeType",
          "fileSize",
          "originalFilename",
        ],
        default: "createdAt",
      },
      description: "Field to sort documents by",
    },
    {
      name: "sortDir",
      in: "query" as const,
      required: false,
      schema: {
        type: "string" as const,
        enum: ["asc", "desc"],
        default: "desc",
      },
      description: "Sort direction",
    },
    {
      name: "fileTypes",
      in: "query" as const,
      required: false,
      schema: { type: "string" as const },
      description: "Comma-separated list of file types/MIME types to filter by",
    },
  ],
  responses: {
    200: {
      description: "List of documents or search results",
      content: {
        "application/json": {
          schema: resolver(DocumentSearchResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid search parameters",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// POST /api/documents - Create a new document
export const postDocumentsRouteDescription = {
  tags: ["Documents"],
  summary: "Create a new document",
  description:
    "Upload a new document file with optional metadata. Supports various document formats including PDF, Word, Excel, PowerPoint, and text files.",
  requestBody: {
    description: "Document file with optional metadata",
    content: {
      "multipart/form-data": {
        schema: {
          type: "object" as const,
          properties: {
            content: {
              type: "string" as const,
              format: "binary" as const,
              description: "The document file to upload",
            },
            metadata: {
              type: "string" as const,
              description: "JSON string containing document metadata",
              example: JSON.stringify({
                title: "My Document",
                description: "Document description",
                tags: ["work", "important"],
              }),
            },
          },
          required: ["content" as const],
        },
      },
    },
  },
  responses: {
    201: {
      description: "Document created successfully",
      content: {
        "application/json": {
          schema: resolver(CreatedDocumentResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data or unsupported file type",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/documents/:id - Get a specific document
export const getDocumentByIdRouteDescription = {
  tags: ["Documents"],
  summary: "Get document by ID",
  description: "Retrieve a specific document by its unique identifier",
  responses: {
    200: {
      description: "Document details",
      content: {
        "application/json": {
          schema: resolver(DocumentResponseSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PUT /api/documents/:id - Update a document (full)
export const putDocumentRouteDescription = {
  tags: ["Documents"],
  summary: "Update document (full)",
  description:
    "Completely update a document's metadata with new data. All fields are required.",
  requestBody: {
    description: "Complete document metadata",
    content: {
      "application/json": {
        schema: resolver(DocumentSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Document updated successfully",
      content: {
        "application/json": {
          schema: resolver(DocumentResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/documents/:id - Update a document (partial)
export const patchDocumentRouteDescription = {
  tags: ["Documents"],
  summary: "Update document (partial)",
  description:
    "Partially update a document's metadata. Only provided fields will be updated.",
  requestBody: {
    description: "Partial document metadata",
    content: {
      "application/json": {
        schema: resolver(PartialDocumentSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Document updated successfully",
      content: {
        "application/json": {
          schema: resolver(DocumentResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/documents/:id/file - Download document file
export const getDocumentFileRouteDescription = {
  tags: ["Document Assets"],
  summary: "Download document file",
  description: "Download the original document file",
  responses: {
    200: {
      description: "Document file",
      content: {
        "application/octet-stream": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document or file not found",
      content: {
        "application/json": {
          schema: resolver(FileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// DELETE /api/documents/:id - Delete a document
export const deleteDocumentRouteDescription = {
  tags: ["Documents"],
  summary: "Delete document",
  description:
    "Delete a document from the database and optionally from storage. By default, both database entries and storage files are deleted.",
  parameters: [
    {
      name: "deleteStorage",
      in: "query" as const,
      description:
        "Whether to delete associated storage files. Defaults to true.",
      required: false,
      schema: {
        type: "boolean" as const,
        default: true,
      },
    },
  ],
  responses: {
    204: {
      description: "Document deleted successfully",
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/documents/:id/thumbnail - Get document thumbnail
export const getDocumentThumbnailRouteDescription = {
  tags: ["Document Assets"],
  summary: "Get document thumbnail",
  description: "Retrieve a thumbnail image of the document",
  responses: {
    200: {
      description: "Document thumbnail file",
      content: {
        "image/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Thumbnail not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/documents/:id/screenshot - Get document screenshot
export const getDocumentScreenshotRouteDescription = {
  tags: ["Document Assets"],
  summary: "Get document screenshot",
  description: "Retrieve a high-resolution screenshot image of the document",
  responses: {
    200: {
      description: "Document screenshot file",
      content: {
        "image/*": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Screenshot not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/documents/:id/pdf - Get generated PDF
export const getDocumentPdfRouteDescription = {
  tags: ["Document Assets"],
  summary: "Get generated PDF",
  description: "Retrieve the PDF version of the document",
  responses: {
    200: {
      description: "Generated PDF file",
      content: {
        "application/pdf": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "PDF not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// GET /api/documents/:id/content - Get extracted content
export const getDocumentContentRouteDescription = {
  tags: ["Document Assets"],
  summary: "Get extracted content",
  description: "Retrieve the extracted markdown content from the document",
  responses: {
    200: {
      description: "Extracted content markdown file",
      content: {
        "text/markdown": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Content not found or not yet extracted",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

export const getDocumentExtractedMdRouteDescription = {
  tags: ["Document Assets"],
  summary: "Get extracted markdown",
  description:
    "Retrieve the extracted markdown file from the document's analysis.",
  responses: {
    200: {
      description: "Extracted markdown file",
      content: {
        "text/markdown": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "File not found",
      content: {
        "application/json": {
          schema: resolver(FileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// *** NEW: GET /api/documents/:id/extracted-txt - Get extracted text ***
export const getDocumentExtractedTxtRouteDescription = {
  tags: ["Document Assets"],
  summary: "Get extracted plain text",
  description:
    "Retrieve the extracted plain text file from the document's analysis.",
  responses: {
    200: {
      description: "Extracted plain text file",
      content: {
        "text/plain": {
          schema: {
            type: "string" as const,
            format: "binary" as const,
          },
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "File not found",
      content: {
        "application/json": {
          schema: resolver(FileNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/documents/:id/review - Update review status
export const patchDocumentReviewRouteDescription = {
  tags: ["Documents"],
  summary: "Update document review status",
  description: "Update the review status of a document",
  requestBody: {
    description: "New review status",
    content: {
      "application/json": {
        schema: resolver(DocumentReviewUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Document updated successfully",
      content: {
        "application/json": {
          schema: resolver(DocumentResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/documents/:id/flag - Update flag color
export const patchDocumentFlagRouteDescription = {
  tags: ["Documents"],
  summary: "Update document flag color",
  description: "Update the flag color of a document or remove the flag",
  requestBody: {
    description: "New flag color (or null to remove flag)",
    content: {
      "application/json": {
        schema: resolver(DocumentFlagUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Document updated successfully",
      content: {
        "application/json": {
          schema: resolver(DocumentResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};

// PATCH /api/documents/:id/pin - Update pin status
export const patchDocumentPinRouteDescription = {
  tags: ["Documents"],
  summary: "Update document pin status",
  description: "Pin or unpin a document",
  requestBody: {
    description: "New pin status",
    content: {
      "application/json": {
        schema: resolver(DocumentPinUpdateSchema) as any,
      },
    },
  },
  responses: {
    200: {
      description: "Document updated successfully",
      content: {
        "application/json": {
          schema: resolver(DocumentResponseSchema),
        },
      },
    },
    400: {
      description: "Invalid request data",
      content: {
        "application/json": {
          schema: resolver(ValidationErrorSchema),
        },
      },
    },
    401: {
      description: "Authentication required",
      content: {
        "application/json": {
          schema: resolver(UnauthorizedSchema),
        },
      },
    },
    404: {
      description: "Document not found",
      content: {
        "application/json": {
          schema: resolver(DocumentNotFoundSchema),
        },
      },
    },
    500: {
      description: "Internal server error",
      content: {
        "application/json": {
          schema: resolver(ErrorResponseSchema),
        },
      },
    },
  },
};
