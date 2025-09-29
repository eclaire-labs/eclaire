// schemas/conversation-params.ts
import { z } from "zod";

// Schema for creating a new conversation
export const CreateConversationSchema = z.object({
  title: z.string().min(1).max(200),
});

// Schema for updating a conversation
export const UpdateConversationSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

// Schema for listing conversations (query parameters)
export const ListConversationsSchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// Schema for conversation ID parameter validation
export const ConversationIdParamSchema = z.object({
  id: z.string().min(1),
});

// TypeScript types
export type CreateConversationRequest = z.infer<
  typeof CreateConversationSchema
>;
export type UpdateConversationRequest = z.infer<
  typeof UpdateConversationSchema
>;
export type ListConversationsQuery = z.infer<typeof ListConversationsSchema>;
export type ConversationIdParam = z.infer<typeof ConversationIdParamSchema>;
