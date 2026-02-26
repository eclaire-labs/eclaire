import z from "zod/v4";
import { paginatedResponseSchema } from "./common.js";

// Single history record response
export const HistoryRecordResponseSchema = z.object({
  id: z.string(),
  action: z.string(),
  itemType: z.string(),
  itemId: z.string(),
  itemName: z.string(),
  beforeData: z.unknown().nullable(),
  afterData: z.unknown().nullable(),
  actor: z.string(),
  timestamp: z.number(),
  userId: z.string().nullable(),
});

// Paginated list response (used for both full listing and search results)
export const HistoryListResponseSchema = paginatedResponseSchema(
  HistoryRecordResponseSchema,
  "HistoryListResponse",
  "history records",
);

// Error responses specific to history
export const HistoryNotFoundSchema = z.object({
  error: z.string().default("History record not found"),
});

export const HistoryAccessDeniedSchema = z.object({
  error: z.string().default("Access denied to history records"),
});

// TypeScript types
export type HistoryRecordResponse = z.infer<typeof HistoryRecordResponseSchema>;
export type HistoryListResponse = z.infer<typeof HistoryListResponseSchema>;
export type HistoryNotFound = z.infer<typeof HistoryNotFoundSchema>;
export type HistoryAccessDenied = z.infer<typeof HistoryAccessDeniedSchema>;
