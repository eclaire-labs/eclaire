import z from "zod/v4";

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

// History list response (simple)
export const HistoryListResponseSchema = z.object({
  records: z.array(HistoryRecordResponseSchema),
});

// History search/filter response with pagination
export const HistorySearchResponseSchema = z.object({
  records: z.array(HistoryRecordResponseSchema),
  totalCount: z.number(),
  limit: z.number(),
  offset: z.number(),
  hasMore: z.boolean(),
});

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
export type HistorySearchResponse = z.infer<typeof HistorySearchResponseSchema>;
export type HistoryNotFound = z.infer<typeof HistoryNotFoundSchema>;
export type HistoryAccessDenied = z.infer<typeof HistoryAccessDeniedSchema>;
