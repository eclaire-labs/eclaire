import z from "zod/v4";
import { paginatedResponseSchema, reviewStatusSchema } from "./common.js";

export const NoteResponseSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    description: z.string(),
    tags: z.array(z.string()),
    createdAt: z.string(),
    updatedAt: z.string(),
    processingStatus: z
      .enum(["pending", "processing", "completed", "failed"])
      .nullable(),
    dueDate: z.string().nullable(),
    reviewStatus: reviewStatusSchema,
    flagColor: z.enum(["red", "yellow", "orange", "green", "blue"]).nullable(),
    isPinned: z.boolean(),
    originalMimeType: z.string().nullable().optional(),
    fileSize: z.number().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
    processingEnabled: z.boolean(),
  })
  .meta({ ref: "NoteResponse" });

export const NotesListResponseSchema = paginatedResponseSchema(
  NoteResponseSchema,
  "NotesListResponse",
  "notes",
);

export type Note = z.infer<typeof NoteResponseSchema>;
export type NotesListResponse = z.infer<typeof NotesListResponseSchema>;
