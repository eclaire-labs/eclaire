// schemas/conversation-responses.ts
import { z } from "zod";

// Base response schema
export const BaseConversationResponseSchema = z.object({
  status: z.literal("OK"),
});

// Individual message schema for responses
export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  thinkingContent: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  metadata: z.any().optional(),
});

// Conversation summary schema (without messages)
export const ConversationSummarySchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  lastMessageAt: z.string().or(z.date()).nullable(),
  messageCount: z.number(),
});

// Conversation with messages schema
export const ConversationWithMessagesSchema = ConversationSummarySchema.extend({
  messages: z.array(MessageSchema),
});

// Pagination schema
export const PaginationSchema = z.object({
  limit: z.number(),
  offset: z.number(),
  count: z.number(),
});

// Create conversation response
export const CreateConversationResponseSchema =
  BaseConversationResponseSchema.extend({
    conversation: ConversationSummarySchema,
  });

// Get conversation response
export const GetConversationResponseSchema =
  BaseConversationResponseSchema.extend({
    conversation: ConversationWithMessagesSchema,
  });

// List conversations response
export const ListConversationsResponseSchema =
  BaseConversationResponseSchema.extend({
    conversations: z.array(ConversationSummarySchema),
    pagination: PaginationSchema,
  });

// Update conversation response
export const UpdateConversationResponseSchema =
  BaseConversationResponseSchema.extend({
    conversation: ConversationSummarySchema,
  });

// Delete conversation response
export const DeleteConversationResponseSchema =
  BaseConversationResponseSchema.extend({
    message: z.string(),
  });

// Error response schemas
export const ConversationNotFoundErrorSchema = z.object({
  error: z.literal("Conversation not found"),
});

export const InvalidConversationIdErrorSchema = z.object({
  error: z.literal("Invalid conversation ID"),
});

export const UnauthorizedConversationErrorSchema = z.object({
  error: z.literal("Unauthorized"),
});

export const ConversationValidationErrorSchema = z.object({
  error: z.literal("Invalid request format"),
  details: z.array(
    z.object({
      code: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
      message: z.string(),
    }),
  ),
});

export const ConversationServerErrorSchema = z.object({
  error: z.literal("Internal server error"),
});

// TypeScript types
export type BaseConversationResponse = z.infer<
  typeof BaseConversationResponseSchema
>;
export type Message = z.infer<typeof MessageSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type ConversationWithMessages = z.infer<
  typeof ConversationWithMessagesSchema
>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type CreateConversationResponse = z.infer<
  typeof CreateConversationResponseSchema
>;
export type GetConversationResponse = z.infer<
  typeof GetConversationResponseSchema
>;
export type ListConversationsResponse = z.infer<
  typeof ListConversationsResponseSchema
>;
export type UpdateConversationResponse = z.infer<
  typeof UpdateConversationResponseSchema
>;
export type DeleteConversationResponse = z.infer<
  typeof DeleteConversationResponseSchema
>;
export type ConversationNotFoundError = z.infer<
  typeof ConversationNotFoundErrorSchema
>;
export type InvalidConversationIdError = z.infer<
  typeof InvalidConversationIdErrorSchema
>;
export type UnauthorizedConversationError = z.infer<
  typeof UnauthorizedConversationErrorSchema
>;
export type ConversationValidationError = z.infer<
  typeof ConversationValidationErrorSchema
>;
export type ConversationServerError = z.infer<
  typeof ConversationServerErrorSchema
>;
