/**
 * Audio API Schemas
 *
 * Zod schemas for audio route request validation.
 */

import z from "zod/v4";

export const SpeechRequestSchema = z.object({
  text: z.string().min(1).max(10000).describe("Text to synthesize to speech"),
  voice: z.string().optional().describe("Voice identifier"),
  speed: z
    .number()
    .min(0.25)
    .max(4.0)
    .optional()
    .describe("Speech speed multiplier"),
  format: z
    .enum(["mp3", "wav"])
    .optional()
    .describe("Output audio format (default: mp3)"),
  model: z.string().optional().describe("Override the default TTS model"),
});

export type SpeechRequest = z.infer<typeof SpeechRequestSchema>;
