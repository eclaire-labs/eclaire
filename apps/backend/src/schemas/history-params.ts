// schemas/history-params.ts
import z from "zod/v4";

// Define action types for history records
export const HistoryActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "api_call",
  "ai_prompt_image_response",
  "ai_prompt_text_response",
  "ai_prompt_error",
  "api_content_upload",
  "api_error_general",
  "user.login",
  "user.logout",
  "conversation_created",
  "conversation_updated",
  "conversation_deleted",
  // Streaming-specific actions
  "ai_prompt_streaming_response",
  "ai_prompt_streaming_error",
  "api_streaming_content_upload",
  "api_error_streaming_general",
]);

// Define item types for history records
export const HistoryItemTypeSchema = z.enum([
  "task",
  "note",
  "bookmark",
  "document",
  "photo",
  "api",
  "prompt",
  "api_error",
  "content_submission",
  "user_session",
  "conversation",
  "task_comment",
]);

// Define actor types for history records
export const HistoryActorSchema = z.enum(["user", "assistant", "system"]);

// History record schema (read-only, matches DB structure)
export const HistoryRecordSchema = z.object({
  id: z.string(),
  action: HistoryActionSchema,
  itemType: HistoryItemTypeSchema,
  itemId: z.string(),
  itemName: z.string(),
  beforeData: z.any().nullable(),
  afterData: z.any().nullable(),
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
