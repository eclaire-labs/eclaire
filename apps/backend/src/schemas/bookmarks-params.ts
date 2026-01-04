// schemas/bookmarks-params.ts
import z from "zod/v4";

// Full bookmark creation/update schema
export const BookmarkSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .meta({
        description: "Title of the bookmark",
        examples: [
          "OpenAI API Documentation",
          "Machine Learning Best Practices",
        ],
      }),

    url: z
      .string()
      .url("Valid URL is required")
      .meta({
        description: "URL of the bookmarked page",
        examples: [
          "https://docs.openai.com/api",
          "https://example.com/article",
        ],
      }),

    description: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Optional description or notes about the bookmark",
        examples: [
          "Comprehensive guide to using the OpenAI API",
          "A great article on web performance",
          null,
        ],
      }),

    author: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Author of the bookmarked page",
        examples: ["John Doe", "OpenAI Team", null],
      }),

    lang: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Language of the bookmarked page",
        examples: ["en", "es", "fr", null],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
        description: "Array of tags to categorize the bookmark",
        examples: [
          ["programming", "api"],
          ["machine-learning", "documentation"],
        ],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .meta({
        description: "Review status of the bookmark",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the bookmark (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the bookmark is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the bookmark in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    contentType: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "MIME type of the bookmarked content",
        examples: ["text/html", "application/pdf", null],
      }),

    etag: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "HTTP ETag header from the bookmarked page",
        examples: ['W/"123456"', '"abc123"', null],
      }),

    lastModified: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "HTTP Last-Modified header from the bookmarked page",
        examples: ["Tue, 15 Nov 2023 12:00:00 GMT", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description:
          "Whether background processing is enabled for this bookmark",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "BookmarkRequest",
    description: "Complete bookmark data for creation or full update",
  });

// Partial bookmark update schema
export const PartialBookmarkSchema = z
  .object({
    title: z
      .string()
      .min(1, "Title is required")
      .optional()
      .meta({
        description: "Title of the bookmark",
        examples: ["Updated Title"],
      }),

    url: z
      .string()
      .url("Valid URL is required")
      .optional()
      .meta({
        description: "URL of the bookmarked page",
        examples: ["https://updated-url.com"],
      }),

    description: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Optional description or notes about the bookmark",
        examples: ["Updated description", null],
      }),

    author: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Author of the bookmarked page",
        examples: ["Updated Author", null],
      }),

    lang: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Language of the bookmarked page",
        examples: ["en", "es", null],
      }),

    tags: z
      .array(z.string())
      .optional()
      .meta({
        description: "Array of tags to categorize the bookmark",
        examples: [["updated", "tags"]],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .optional()
      .meta({
        description: "Review status of the bookmark",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the bookmark (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .optional()
      .meta({
        description: "Whether the bookmark is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the bookmark in ISO 8601 format",
        examples: ["2025-07-01T10:00:00Z", null],
      }),

    contentType: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "MIME type of the bookmarked content",
        examples: ["text/html", "application/pdf", null],
      }),

    etag: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "HTTP ETag header from the bookmarked page",
        examples: ['W/"123456"', '"abc123"', null],
      }),

    lastModified: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "HTTP Last-Modified header from the bookmarked page",
        examples: ["Tue, 15 Nov 2023 12:00:00 GMT", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .meta({
        description:
          "Whether background processing is enabled for this bookmark",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "PartialBookmarkRequest",
    description: "Partial bookmark data for updates",
  });

// Bookmark creation schema with flat structure for core properties
export const CreateBookmarkSchema = z
  .object({
    url: z
      .string()
      .url("Valid URL is required")
      .meta({
        description: "URL of the page to bookmark",
        examples: ["https://example.com", "https://docs.example.com/api"],
      }),

    title: z
      .string()
      .optional()
      .meta({
        description:
          "Optional title for the bookmark (will be auto-extracted if not provided)",
        examples: ["My Custom Title", "Important Documentation"],
      }),

    description: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Optional description for the bookmark",
        examples: [
          "A useful resource for learning",
          "Documentation I need to reference",
          null,
        ],
      }),

    tags: z
      .array(z.string())
      .default([])
      .meta({
        description: "Optional tags to categorize the bookmark",
        examples: [
          ["work", "documentation"],
          ["personal", "learning"],
        ],
      }),

    metadata: z
      .record(z.string(), z.unknown())
      .optional()
      .meta({
        description: "Optional additional metadata for the bookmark",
        examples: [{ source: "browser-extension", priority: "high" }],
      }),

    reviewStatus: z
      .enum(["pending", "accepted", "rejected"])
      .default("pending")
      .meta({
        description: "Review status of the bookmark",
        examples: ["pending", "accepted", "rejected"],
      }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .optional()
      .meta({
        description: "Flag color for the bookmark (optional)",
        examples: ["red", "green", "blue"],
      }),

    isPinned: z
      .boolean()
      .default(false)
      .meta({
        description: "Whether the bookmark is pinned",
        examples: [true, false],
      }),

    dueDate: z
      .string()
      .optional()
      .nullable()
      .meta({
        description: "Due date for the bookmark in ISO 8601 format",
        examples: ["2025-06-15T09:00:00Z", "2025-12-31T23:59:59Z", null],
      }),

    enabled: z
      .boolean()
      .optional()
      .default(true)
      .meta({
        description:
          "Whether background processing is enabled for this bookmark",
        examples: [true, false],
      }),
  })
  .meta({
    ref: "CreateBookmarkRequest",
    description:
      "Data required to create a new bookmark with flat structure for core properties",
  });

// Path parameters
export const BookmarkIdParam = z
  .object({
    id: z.string().meta({
      description: "Unique identifier of the bookmark",
      examples: ["clxyz123abc", "bookmark_12345"],
    }),
  })
  .meta({ ref: "BookmarkIdParam" });
