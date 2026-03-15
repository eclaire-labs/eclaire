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

// History uses offset-based pagination (not cursor-based like content endpoints)
export const HistoryListResponseSchema = z
  .object({
    items: z
      .array(HistoryRecordResponseSchema)
      .meta({ description: "Array of history records" }),
    totalCount: z
      .number()
      .meta({ description: "Total number of items matching the query" }),
    limit: z
      .number()
      .meta({ description: "Maximum number of results returned" }),
    offset: z.number().meta({ description: "Number of results skipped" }),
  })
  .meta({ ref: "HistoryListResponse" });

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
