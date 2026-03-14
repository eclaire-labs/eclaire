/**
 * Audio Routes
 *
 * REST endpoints for STT/TTS, proxying to the mlx-audio server.
 *
 *   GET  /api/audio/health          → audio server health
 *   POST /api/audio/transcriptions  → upload audio → { text }
 *   POST /api/audio/speech          → { text } → binary audio
 */

import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { createChildLogger } from "../lib/logger.js";
import {
  getAudioHealth,
  isAudioAvailable,
  synthesize,
  transcribe,
} from "../lib/services/audio.js";
import { withAuth } from "../middleware/with-auth.js";
import { SpeechRequestSchema } from "../schemas/audio-params.js";
import type { RouteVariables } from "../types/route-variables.js";

const logger = createChildLogger("audio");

export const audioRoutes = new Hono<{ Variables: RouteVariables }>();

// GET /api/audio/health — Audio service health check
audioRoutes.get(
  "/health",
  withAuth(async (c) => {
    const health = await getAudioHealth();
    return c.json(health);
  }, logger),
);

// POST /api/audio/transcriptions — Transcribe audio file to text
audioRoutes.post(
  "/transcriptions",
  withAuth(async (c) => {
    if (!isAudioAvailable()) {
      return c.json({ error: "Audio service is not available" }, 503);
    }

    const body = await c.req.parseBody();
    const file = body.file;

    if (!(file instanceof File)) {
      return c.json({ error: "Missing 'file' field in multipart form" }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const model = typeof body.model === "string" ? body.model : undefined;
    const language =
      typeof body.language === "string" ? body.language : undefined;

    const result = await transcribe({
      file: buffer,
      fileName: file.name,
      model,
      language,
    });

    logger.info(
      { text: result.text, textLength: result.text.length },
      "Transcription result",
    );

    return c.json(result);
  }, logger),
);

// POST /api/audio/speech — Synthesize text to audio
audioRoutes.post(
  "/speech",
  zValidator("json", SpeechRequestSchema),
  withAuth(async (c) => {
    if (!isAudioAvailable()) {
      return c.json({ error: "Audio service is not available" }, 503);
    }

    const { text, voice, speed, format, model } = c.req.valid("json");
    const outputFormat = format ?? "mp3";

    const audioBuffer = await synthesize({
      text,
      voice,
      speed,
      format: outputFormat,
      model,
    });

    const contentType = outputFormat === "wav" ? "audio/wav" : "audio/mpeg";

    return new Response(new Uint8Array(audioBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(audioBuffer.length),
      },
    });
  }, logger),
);
