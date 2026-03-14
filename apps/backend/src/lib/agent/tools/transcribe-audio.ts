/**
 * Transcribe Audio Tool
 *
 * Transcribe an audio file to text using the audio service (STT).
 */

import {
  errorResult,
  textResult,
  type RuntimeToolDefinition,
} from "@eclaire/ai";
import z from "zod/v4";
import { transcribe } from "../../services/audio.js";

const inputSchema = z.object({
  filePath: z.string().describe("Path to the audio file to transcribe"),
  language: z.string().optional().describe("Language code (e.g. 'en', 'fr')"),
});

export const transcribeAudioTool: RuntimeToolDefinition<typeof inputSchema> = {
  name: "transcribeAudio",
  label: "Transcribe Audio",
  description:
    "Transcribe an audio file to text using local speech-to-text. Supports common audio formats (wav, mp3, m4a, etc.).",
  inputSchema,
  execute: async (_callId, input, _ctx) => {
    try {
      const result = await transcribe({
        file: input.filePath,
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
