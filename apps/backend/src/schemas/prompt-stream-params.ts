// schemas/prompt-stream-params.ts
import { z } from "zod";
import { PromptRequestSchema } from "./prompt-params";

// Stream-specific request schema (inherits from base prompt request)
export const StreamPromptRequestSchema = PromptRequestSchema.extend({
  stream: z.literal(true).optional().default(true),
});

// TypeScript types
export type StreamPromptRequest = z.infer<typeof StreamPromptRequestSchema>;
