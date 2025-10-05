// schemas/prompt-stream-responses.ts
import z from "zod/v4";

// Base streaming event schema
export const BaseStreamEventSchema = z.object({
  type: z.string(),
  timestamp: z.string().optional(),
});

// Thought event (from <think> tags)
export const ThoughtStreamEventSchema = BaseStreamEventSchema.extend({
  type: z.literal("thought"),
  content: z.string(),
});

// Tool call event
export const ToolCallStreamEventSchema = BaseStreamEventSchema.extend({
  type: z.literal("tool-call"),
  name: z.string(),
  status: z.enum(["starting", "executing", "completed", "error"]),
  arguments: z.record(z.string(), z.any()).optional(),
  result: z.any().optional(),
  error: z.string().optional(),
});

// Text chunk event (parts of final response)
export const TextChunkStreamEventSchema = BaseStreamEventSchema.extend({
  type: z.literal("text-chunk"),
  content: z.string(),
});

// Error event
export const ErrorStreamEventSchema = BaseStreamEventSchema.extend({
  type: z.literal("error"),
  error: z.string(),
  message: z.string().optional(),
});

// Done event (final completion)
export const DoneStreamEventSchema = BaseStreamEventSchema.extend({
  type: z.literal("done"),
  requestId: z.string(),
  conversationId: z.string().optional(),
  totalTokens: z.number().optional(),
  executionTimeMs: z.number().optional(),
  responseType: z.string().optional(), // For future extensibility: "text_response", "image_response", etc.
});

// Union of all streaming events
export const StreamEventSchema = z.union([
  ThoughtStreamEventSchema,
  ToolCallStreamEventSchema,
  TextChunkStreamEventSchema,
  ErrorStreamEventSchema,
  DoneStreamEventSchema,
]);

// TypeScript types
export type BaseStreamEvent = z.infer<typeof BaseStreamEventSchema>;
export type ThoughtStreamEvent = z.infer<typeof ThoughtStreamEventSchema>;
export type ToolCallStreamEvent = z.infer<typeof ToolCallStreamEventSchema>;
export type TextChunkStreamEvent = z.infer<typeof TextChunkStreamEventSchema>;
export type ErrorStreamEvent = z.infer<typeof ErrorStreamEventSchema>;
export type DoneStreamEvent = z.infer<typeof DoneStreamEventSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
