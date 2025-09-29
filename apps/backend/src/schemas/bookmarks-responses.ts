// schemas/bookmarks-responses.ts
import { z } from "zod";
import "zod-openapi/extend";

// Full bookmark response schema
export const BookmarkResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the bookmark",
    }),

    title: z.string().nullable().openapi({
      description:
        "Title of the bookmarked page (auto-extracted or user-provided)",
    }),

    url: z.string().openapi({
      description:
        "Original URL of the bookmarked page as submitted by the user",
    }),

    normalizedUrl: z.string().nullable().optional().openapi({
      description:
        "Normalized/canonical URL after processing (may differ from original due to redirects)",
    }),

    description: z.string().nullable().openapi({
      description: "Description of the bookmark",
    }),

    author: z.string().nullable().optional().openapi({
      description: "Author of the bookmarked page",
    }),

    lang: z.string().nullable().optional().openapi({
      description: "Detected language of the bookmarked page",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the bookmark",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the bookmark",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the bookmark (null if not flagged)",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the bookmark is pinned",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when bookmark was created",
    }),

    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when bookmark was last updated",
    }),

    pageLastUpdatedAt: z.string().nullable().optional().openapi({
      description: "ISO 8601 timestamp when the page was last updated",
    }),

    dueDate: z.string().nullable().openapi({
      description:
        "Due date for the bookmark in ISO 8601 format (null if not set)",
    }),

    // Processing status and metadata
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .openapi({
        description:
          "Status of background processing (screenshot capture, content extraction, etc.)",
      }),

    // HTTP metadata
    contentType: z.string().nullable().optional().openapi({
      description: "MIME type of the bookmarked content",
    }),

    etag: z.string().nullable().optional().openapi({
      description: "HTTP ETag header from the bookmarked page",
    }),

    lastModified: z.string().nullable().optional().openapi({
      description: "HTTP Last-Modified header from the bookmarked page",
    }),

    // Extracted content
    extractedText: z.string().nullable().optional().openapi({
      description: "Text content extracted from the bookmark",
    }),

    // Asset URLs (null if not available)
    faviconUrl: z.string().nullable().openapi({
      description: "URL to download the favicon (null if not available)",
    }),

    thumbnailUrl: z.string().nullable().openapi({
      description:
        "URL to download the desktop screenshot JPG image (null if not available)",
    }),

    screenshotMobileUrl: z.string().nullable().openapi({
      description:
        "URL to download the mobile screenshot JPG image (null if not available)",
    }),

    screenshotFullPageUrl: z.string().nullable().openapi({
      description:
        "URL to download the full-page screenshot JPG image (null if not available)",
    }),

    pdfUrl: z.string().nullable().openapi({
      description: "URL to download the PDF version (null if not available)",
    }),

    contentUrl: z.string().nullable().openapi({
      description:
        "URL to download the extracted content (null if not available)",
    }),
  })
  .openapi({ ref: "BookmarkResponse" });

// Array of bookmarks response
export const BookmarksListResponseSchema = z
  .array(BookmarkResponseSchema)
  .openapi({
    ref: "BookmarksListResponse",
    description: "Array of bookmark objects",
  });

// Created bookmark response (for POST requests)
export const CreatedBookmarkResponseSchema = z
  .object({
    id: z.string().openapi({
      description: "Unique identifier for the created bookmark",
    }),

    title: z.string().nullable().openapi({
      description:
        "Title of the bookmark (may be null initially if processing is pending)",
    }),

    url: z.string().openapi({
      description:
        "Original URL of the bookmarked page as submitted by the user",
    }),

    normalizedUrl: z.string().nullable().optional().openapi({
      description:
        "Normalized/canonical URL after processing (will be null initially)",
    }),

    description: z.string().nullable().openapi({
      description: "Description of the bookmark",
    }),

    author: z.string().nullable().optional().openapi({
      description: "Author of the bookmarked page (will be null initially)",
    }),

    lang: z.string().nullable().optional().openapi({
      description:
        "Detected language of the bookmarked page (will be null initially)",
    }),

    tags: z.array(z.string()).openapi({
      description: "Tags associated with the bookmark",
    }),

    reviewStatus: z.enum(["pending", "accepted", "rejected"]).openapi({
      description: "Review status of the bookmark",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .openapi({
        description: "Flag color for the bookmark (null if not flagged)",
      }),

    isPinned: z.boolean().openapi({
      description: "Whether the bookmark is pinned",
    }),

    createdAt: z.string().openapi({
      description: "ISO 8601 timestamp when bookmark was created",
    }),

    updatedAt: z.string().openapi({
      description: "ISO 8601 timestamp when bookmark was last updated",
    }),

    pageLastUpdatedAt: z.string().nullable().optional().openapi({
      description:
        "ISO 8601 timestamp when the page was last updated (will be null initially)",
    }),

    dueDate: z.string().nullable().openapi({
      description:
        "Due date for the bookmark in ISO 8601 format (null if not set)",
    }),

    processingStatus: z.enum(["pending", "processing"]).openapi({
      description:
        "Initial processing status - background jobs will populate additional metadata",
    }),

    // HTTP metadata (will be null initially)
    contentType: z.string().nullable().optional().openapi({
      description:
        "MIME type of the bookmarked content (will be null initially)",
    }),

    etag: z.string().nullable().optional().openapi({
      description:
        "HTTP ETag header from the bookmarked page (will be null initially)",
    }),

    lastModified: z.string().nullable().optional().openapi({
      description:
        "HTTP Last-Modified header from the bookmarked page (will be null initially)",
    }),

    // Extracted content (will be null initially)
    extractedText: z.string().nullable().optional().openapi({
      description:
        "Text content extracted from the bookmark (will be null initially)",
    }),

    // Asset URLs (will be null initially since processing is pending)
    faviconUrl: z.string().nullable().openapi({
      description: "URL to download the favicon (will be null initially)",
    }),

    thumbnailUrl: z.string().nullable().openapi({
      description:
        "URL to download the desktop screenshot JPG image (will be null initially)",
    }),

    screenshotMobileUrl: z.string().nullable().openapi({
      description:
        "URL to download the mobile screenshot JPG image (will be null initially)",
    }),

    screenshotFullPageUrl: z.string().nullable().openapi({
      description:
        "URL to download the full-page screenshot JPG image (will be null initially)",
    }),

    pdfUrl: z.string().nullable().openapi({
      description: "URL to download the PDF version (will be null initially)",
    }),

    contentUrl: z.string().nullable().openapi({
      description:
        "URL to download the extracted content (will be null initially)",
    }),
  })
  .openapi({ ref: "CreatedBookmarkResponse" });

// Asset not found error (for asset endpoints)
export const AssetNotFoundSchema = z
  .object({
    error: z.string().openapi({
      description: "Error message indicating the asset was not found",
      examples: ["Favicon not found", "Screenshot not available"],
    }),
  })
  .openapi({ ref: "AssetNotFound" });

// Bookmark not found error
export const BookmarkNotFoundSchema = z
  .object({
    error: z.literal("Bookmark not found").openapi({
      description: "Bookmark with the specified ID was not found",
    }),
  })
  .openapi({ ref: "BookmarkNotFound" });
