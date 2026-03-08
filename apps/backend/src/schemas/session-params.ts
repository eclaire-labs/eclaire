// schemas/session-params.ts
import z from "zod/v4";
import { ContextSchema } from "./prompt-params.js";

export const CreateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const SendMessageSchema = z.object({
  prompt: z.string().min(1),
  context: ContextSchema.optional(),
  enableThinking: z.boolean().optional(),
});

export const UpdateSessionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export const ListSessionsSchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
});

// TypeScript types
export type CreateSessionRequest = z.infer<typeof CreateSessionSchema>;
export type SendMessageRequest = z.infer<typeof SendMessageSchema>;
export type UpdateSessionRequest = z.infer<typeof UpdateSessionSchema>;
export type ListSessionsQuery = z.infer<typeof ListSessionsSchema>;
