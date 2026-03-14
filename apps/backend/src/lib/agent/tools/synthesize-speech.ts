/**
 * Synthesize Speech Tool
 *
 * Convert text to speech audio using the audio service (TTS).
 * Saves the output to user storage and returns the storage path.
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import { generateCleanId } from "@eclaire/core/id";
import z from "zod/v4";
import { synthesize } from "../../services/audio.js";
import { getStorage } from "../../storage/index.js";

const inputSchema = z.object({
  text: z.string().min(1).max(10000).describe("Text to convert to speech"),
  voice: z.string().optional().describe("Voice identifier"),
  format: z
    .enum(["wav", "mp3"])
    .optional()
    .describe("Output audio format (default: mp3)"),
});

export const synthesizeSpeechTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "synthesizeSpeech",
  label: "Synthesize Speech",
  description:
    "Convert text to speech audio using local text-to-speech. Returns the storage path of the generated audio file.",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    try {
      const format = input.format ?? "mp3";

      const audioBuffer = await synthesize({
        text: input.text,
        voice: input.voice,
        format,
      });

      // Save to user storage
      const storage = getStorage();
      const audioId = `aud-${generateCleanId()}`;
      const contentType = format === "wav" ? "audio/wav" : "audio/mpeg";
      const storagePath = `${ctx.userId}/audio/${audioId}.${format}`;

      await storage.writeBuffer(storagePath, audioBuffer, { contentType });

      return textResult(
        `Speech audio generated and saved (${audioBuffer.length} bytes, ${format}). Storage path: ${storagePath}`,
      );
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : "Speech synthesis failed",
      );
    }
  },
};
