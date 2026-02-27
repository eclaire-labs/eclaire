// schemas/history-params.ts
import { HISTORY_ACTIONS, HISTORY_ACTORS, HISTORY_ITEM_TYPES } from "@eclaire/core/types";
import z from "zod/v4";

// Define action types for history records
export const HistoryActionSchema = z.enum(HISTORY_ACTIONS);

// Define item types for history records
export const HistoryItemTypeSchema = z.enum(HISTORY_ITEM_TYPES);

// Define actor types for history records
export const HistoryActorSchema = z.enum(HISTORY_ACTORS);

// History record schema (read-only, matches DB structure)
export const HistoryRecordSchema = z.object({
  id: z.string(),
  action: HistoryActionSchema,
  itemType: HistoryItemTypeSchema,
  itemId: z.string(),
  itemName: z.string(),
  beforeData: z.unknown().nullable(),
  afterData: z.unknown().nullable(),
  actor: HistoryActorSchema,
  timestamp: z.number(),
  userId: z.string().nullable(),
});

// Search/filter parameters for history endpoints
export const HistorySearchParamsSchema = z.object({
  action: HistoryActionSchema.optional(),
  itemType: HistoryItemTypeSchema.optional(),
  actor: HistoryActorSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  limit: z.coerce.number().min(1).max(9999).default(50).optional(),
  offset: z.coerce.number().min(0).default(0).optional(),
});

// TypeScript types
export type HistoryRecord = z.infer<typeof HistoryRecordSchema>;
export type HistorySearchParams = z.infer<typeof HistorySearchParamsSchema>;
