// schemas/bookmarks-responses.ts
import z from "zod/v4";
import { reviewStatusSchema } from "./common.js";

// Full bookmark response schema
export const BookmarkResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the bookmark",
    }),

    title: z.string().nullable().meta({
      description:
        "Title of the bookmarked page (auto-extracted or user-provided)",
    }),

    url: z.string().meta({
      description:
        "Original URL of the bookmarked page as submitted by the user",
    }),

    normalizedUrl: z.string().nullable().optional().meta({
      description:
        "Normalized/canonical URL after processing (may differ from original due to redirects)",
    }),

    description: z.string().nullable().meta({
      description: "Description of the bookmark",
    }),

    author: z.string().nullable().optional().meta({
      description: "Author of the bookmarked page",
    }),

    lang: z.string().nullable().optional().meta({
      description: "Detected language of the bookmarked page",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the bookmark",
    }),

    reviewStatus: reviewStatusSchema.meta({
      description: "Review status of the bookmark",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the bookmark (null if not flagged)",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the bookmark is pinned",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when bookmark was created",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when bookmark was last updated",
    }),

    pageLastUpdatedAt: z.string().nullable().optional().meta({
      description: "ISO 8601 timestamp when the page was last updated",
    }),

    dueDate: z.string().nullable().meta({
      description:
        "Due date for the bookmark in ISO 8601 format (null if not set)",
    }),

    // Processing status and metadata
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable()
      .meta({
        description:
          "Status of background processing (screenshot capture, content extraction, etc.)",
      }),

    // HTTP metadata
    contentType: z.string().nullable().optional().meta({
      description: "MIME type of the bookmarked content",
    }),

    etag: z.string().nullable().optional().meta({
      description: "HTTP ETag header from the bookmarked page",
    }),

    lastModified: z.string().nullable().optional().meta({
      description: "HTTP Last-Modified header from the bookmarked page",
    }),

    // Extracted content
    extractedText: z.string().nullable().optional().meta({
      description: "Text content extracted from the bookmark",
    }),

    // Asset URLs (null if not available)
    faviconUrl: z.string().nullable().meta({
      description: "URL to download the favicon (null if not available)",
    }),

    thumbnailUrl: z.string().nullable().meta({
      description:
        "URL to download the desktop screenshot JPG image (null if not available)",
    }),

    screenshotMobileUrl: z.string().nullable().meta({
      description:
        "URL to download the mobile screenshot JPG image (null if not available)",
    }),

    screenshotFullPageUrl: z.string().nullable().meta({
      description:
        "URL to download the full-page screenshot JPG image (null if not available)",
    }),

    pdfUrl: z.string().nullable().meta({
      description: "URL to download the PDF version (null if not available)",
    }),

    contentUrl: z.string().nullable().meta({
      description:
        "URL to download the extracted content (null if not available)",
    }),
  })
  .meta({ ref: "BookmarkResponse" });

// Array of bookmarks response
export const BookmarksListResponseSchema = z
  .array(BookmarkResponseSchema)
  .meta({
    ref: "BookmarksListResponse",
    description: "Array of bookmark objects",
  });

// Created bookmark response (for POST requests)
export const CreatedBookmarkResponseSchema = z
  .object({
    id: z.string().meta({
      description: "Unique identifier for the created bookmark",
    }),

    title: z.string().nullable().meta({
      description:
        "Title of the bookmark (may be null initially if processing is pending)",
    }),

    url: z.string().meta({
      description:
        "Original URL of the bookmarked page as submitted by the user",
    }),

    normalizedUrl: z.string().nullable().optional().meta({
      description:
        "Normalized/canonical URL after processing (will be null initially)",
    }),

    description: z.string().nullable().meta({
      description: "Description of the bookmark",
    }),

    author: z.string().nullable().optional().meta({
      description: "Author of the bookmarked page (will be null initially)",
    }),

    lang: z.string().nullable().optional().meta({
      description:
        "Detected language of the bookmarked page (will be null initially)",
    }),

    tags: z.array(z.string()).meta({
      description: "Tags associated with the bookmark",
    }),

    reviewStatus: reviewStatusSchema.meta({
      description: "Review status of the bookmark",
    }),

    flagColor: z
      .enum(["red", "yellow", "orange", "green", "blue"])
      .nullable()
      .meta({
        description: "Flag color for the bookmark (null if not flagged)",
      }),

    isPinned: z.boolean().meta({
      description: "Whether the bookmark is pinned",
    }),

    createdAt: z.string().meta({
      description: "ISO 8601 timestamp when bookmark was created",
    }),

    updatedAt: z.string().meta({
      description: "ISO 8601 timestamp when bookmark was last updated",
    }),

    pageLastUpdatedAt: z.string().nullable().optional().meta({
      description:
        "ISO 8601 timestamp when the page was last updated (will be null initially)",
    }),

    dueDate: z.string().nullable().meta({
      description:
        "Due date for the bookmark in ISO 8601 format (null if not set)",
    }),

    processingStatus: z.enum(["pending", "processing"]).meta({
      description:
        "Initial processing status - background jobs will populate additional metadata",
    }),

    // HTTP metadata (will be null initially)
    contentType: z.string().nullable().optional().meta({
      description:
        "MIME type of the bookmarked content (will be null initially)",
    }),

    etag: z.string().nullable().optional().meta({
      description:
        "HTTP ETag header from the bookmarked page (will be null initially)",
    }),

    lastModified: z.string().nullable().optional().meta({
      description:
        "HTTP Last-Modified header from the bookmarked page (will be null initially)",
    }),

    // Extracted content (will be null initially)
    extractedText: z.string().nullable().optional().meta({
      description:
        "Text content extracted from the bookmark (will be null initially)",
    }),

    // Asset URLs (will be null initially since processing is pending)
    faviconUrl: z.string().nullable().meta({
      description: "URL to download the favicon (will be null initially)",
    }),

    thumbnailUrl: z.string().nullable().meta({
      description:
        "URL to download the desktop screenshot JPG image (will be null initially)",
    }),

    screenshotMobileUrl: z.string().nullable().meta({
      description:
        "URL to download the mobile screenshot JPG image (will be null initially)",
    }),

    screenshotFullPageUrl: z.string().nullable().meta({
      description:
        "URL to download the full-page screenshot JPG image (will be null initially)",
    }),

    pdfUrl: z.string().nullable().meta({
      description: "URL to download the PDF version (will be null initially)",
    }),

    contentUrl: z.string().nullable().meta({
      description:
        "URL to download the extracted content (will be null initially)",
    }),
  })
  .meta({ ref: "CreatedBookmarkResponse" });

// Asset not found error (for asset endpoints)
export const AssetNotFoundSchema = z
  .object({
    error: z.string().meta({
      description: "Error message indicating the asset was not found",
      examples: ["Favicon not found", "Screenshot not available"],
    }),
  })
  .meta({ ref: "AssetNotFound" });

// Bookmark not found error
export const BookmarkNotFoundSchema = z
  .object({
    error: z.literal("Bookmark not found").meta({
      description: "Bookmark with the specified ID was not found",
    }),
  })
  .meta({ ref: "BookmarkNotFound" });
