import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

export const BookmarkResponseSchema = z
  .object({
    id: z.string(),
    title: z.string().nullable(),
    url: z.string(),
    normalizedUrl: z.string().nullable().optional(),
    description: z.string().nullable(),
    author: z.string().nullable().optional(),
    lang: z.string().nullable().optional(),
    tags: z.array(z.string()),
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    createdAt: z.string(),
    updatedAt: z.string(),
    pageLastUpdatedAt: z.string().nullable().optional(),
    dueDate: z.string().nullable(),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable(),
    contentType: z.string().nullable().optional(),
    etag: z.string().nullable().optional(),
    lastModified: z.string().nullable().optional(),
    extractedText: z.string().nullable().optional(),
    faviconUrl: z.string().nullable(),
    thumbnailUrl: z.string().nullable(),
    screenshotMobileUrl: z.string().nullable(),
    screenshotFullPageUrl: z.string().nullable(),
    pdfUrl: z.string().nullable(),
    contentUrl: z.string().nullable(),
    screenshotUrl: z.string().nullable(),
    readableUrl: z.string().nullable(),
    readmeUrl: z.string().nullable(),
    enabled: z.boolean(),
  })
  .meta({ ref: "BookmarkResponse" });

export const BookmarksListResponseSchema = paginatedResponseSchema(
  BookmarkResponseSchema,
  "BookmarksListResponse",
  "bookmarks",
);

export type Bookmark = z.infer<typeof BookmarkResponseSchema>;
export type BookmarksListResponse = z.infer<typeof BookmarksListResponseSchema>;
