/**
 * Transcribe Audio Tool
 *
 * Transcribe a stored media item's audio to text using the audio service (STT).
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { transcribe } from "../../services/audio.js";
import { getMediaBuffer } from "../../services/media.js";

const inputSchema = z.object({
  mediaId: z
    .string()
    .describe("ID of the media item to transcribe (e.g. 'med-abc123')"),
  language: z.string().optional().describe("Language code (e.g. 'en', 'fr')"),
});

export const transcribeAudioTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "transcribeAudio",
  label: "Transcribe Audio",
  description:
    "Transcribe a stored media item's audio to text using local speech-to-text. Use getMedia first to check if a transcript already exists.",
  accessLevel: "read",
  inputSchema,
  execute: async (_callId, input, ctx) => {
    try {
      const media = await getMediaBuffer(input.mediaId, ctx.userId);

      const result = await transcribe({
        file: media.buffer,
        fileName: media.originalFilename || "audio.wav",
        language: input.language,
      });

      return textResult(result.text);
    } catch (error) {
      return errorResult(
        error instanceof Error ? error.message : "Transcription failed",
      );
    }
  },
};
