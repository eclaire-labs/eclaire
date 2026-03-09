import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

export const DocumentResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    dueDate: z.string().nullable(),
    originalFilename: z.string().nullable(),
    mimeType: z.string(),
    fileSize: z.number().nullable(),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable(),
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    thumbnailUrl: z.string().nullable(),
    screenshotUrl: z.string().nullable(),
    pdfUrl: z.string().nullable(),
    contentUrl: z.string().nullable(),
    fileUrl: z.string().nullable(),
    extractedText: z.string().nullable(),
    pageCount: z.number().nullable().optional(),
    processingEnabled: z.boolean(),
  })
  .meta({ ref: "DocumentResponse" });

export const DocumentsListResponseSchema = paginatedResponseSchema(
  DocumentResponseSchema,
  "DocumentsListResponse",
  "documents",
);

export type Document = z.infer<typeof DocumentResponseSchema>;
export type DocumentsListResponse = z.infer<
  typeof DocumentsListResponseSchema
>;
