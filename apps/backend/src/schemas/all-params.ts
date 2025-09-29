// schemas/all-params.ts
import { z } from "zod";
import "zod-openapi/extend";

// Search query parameters schema
export const SearchQuerySchema = z
  .object({
    text: z
      .string()
      .optional()
      .openapi({
        description:
          "Search text to find across all content types. Searches titles, descriptions, and content.",
        examples: ["machine learning", "API documentation best practices"],
      }),

    tags: z
      .string()
      .optional()
      .openapi({
        description: "Comma-separated list of tags to filter by",
        examples: ["work,important", "personal"],
      }),

    startDate: z
      .string()
      .optional()
      .openapi({
        description:
          "Filter items created on or after this date (ISO 8601 format)",
        examples: ["2024-01-01", "2024-06-01T00:00:00Z"],
      }),

    endDate: z
      .string()
      .optional()
      .openapi({
        description:
          "Filter items created on or before this date (ISO 8601 format)",
        examples: ["2024-12-31", "2024-06-30T23:59:59Z"],
      }),

    dueStatus: z
      .enum(["all", "due_now", "overdue", "due_today"])
      .optional()
      .openapi({
        description:
          "Filter items by due date status. 'due_now' includes both overdue and due today",
        examples: ["due_now", "overdue", "due_today"],
      }),

    limit: z.coerce
      .number()
      .min(1)
      .max(9999)
      .default(50)
      .openapi({
        description: "Maximum number of results to return",
        examples: [20, 50, 100, 9999],
      }),

    offset: z.coerce
      .number()
      .min(0)
      .default(0)
      .openapi({
        description: "Number of results to skip for pagination",
        examples: [0, 50, 100],
      }),
  })
  .openapi({ ref: "SearchQuery" });

// Create metadata schema
export const CreateMetadataSchema = z
  .object({
    assetType: z
      .enum(["bookmark", "note", "photo", "document", "task"])
      .optional()
      .openapi({
        description:
          "Explicitly specify the type of content to create. If not provided, type will be auto-detected based on content.",
        examples: ["bookmark", "note", "photo", "document", "task"],
      }),

    title: z
      .string()
      .optional()
      .openapi({
        description: "Custom title for the content",
        examples: ["My Important Document", "Meeting Notes"],
      }),

    description: z
      .string()
      .optional()
      .openapi({
        description: "Description or summary of the content",
        examples: ["Notes from the quarterly planning meeting"],
      }),

    tags: z
      .array(z.string())
      .optional()
      .openapi({
        description: "Array of tags to associate with the content",
        examples: [
          ["work", "important"],
          ["personal", "travel"],
        ],
      }),

    url: z
      .string()
      .url()
      .optional()
      .openapi({
        description:
          "URL for bookmark content or source URL for other content types",
        examples: ["https://example.com", "https://docs.example.com/api"],
      }),

    originalFilename: z
      .string()
      .optional()
      .openapi({
        description: "Original filename when uploading files",
        examples: ["document.pdf", "photo.jpg"],
      }),
  })
  .openapi({ ref: "CreateMetadata" });
