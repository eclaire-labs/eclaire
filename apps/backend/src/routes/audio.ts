/**
 * Audio Routes
 *
 * REST + WebSocket endpoints for STT/TTS, proxying to the mlx-audio server.
 *
 *   GET  /api/audio/health                    → audio server health
 *   POST /api/audio/transcriptions            → upload audio → { text }
 *   POST /api/audio/speech                    → { text } → binary audio
 *   WS   /api/audio/transcriptions/stream     → real-time streaming STT
 */

import { MlxRealtimeClient } from "@eclaire/audio";
import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { getAuthenticatedPrincipal } from "../lib/auth-utils.js";
import { createChildLogger } from "../lib/logger.js";
import {
  getAudioConfig,
  getAudioHealth,
  isAudioAvailable,
  synthesize,
  synthesizeStream,
  transcribe,
} from "../lib/services/audio.js";
import { getUpgradeWebSocket } from "../lib/websocket.js";
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

    const { text, voice, speed, format, model, stream } = c.req.valid("json");
    const outputFormat = format ?? "mp3";

    // Streaming mode: pipe mlx-audio response through to client
    if (stream) {
      const upstreamResponse = await synthesizeStream({
        text,
        voice,
        speed,
        format: outputFormat,
        model,
      });

      const contentType = outputFormat === "wav" ? "audio/wav" : "audio/mpeg";

      return new Response(
        upstreamResponse.body as ReadableStream<Uint8Array> | null,
        {
          headers: {
            "Content-Type": contentType,
            "Transfer-Encoding": "chunked",
          },
        },
      );
    }

    // Buffered mode (default)
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

// WS /api/audio/transcriptions/stream — Real-time streaming STT
audioRoutes.get(
  "/transcriptions/stream",
  async (c, next) => {
    // Authenticate before upgrading to WebSocket
    const principal = await getAuthenticatedPrincipal(c);
    if (!principal) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    c.set("principal", principal);
    return next();
  },
  async (c, next) => {
    const upgradeWebSocket = getUpgradeWebSocket();
    const handler = upgradeWebSocket((c) => {
      let mlxClient: MlxRealtimeClient | null = null;

      return {
        onOpen: async (_event, ws) => {
          if (!isAudioAvailable()) {
            ws.send(
              JSON.stringify({
                type: "error",
                error: "Audio service is not available",
              }),
            );
            ws.close(1011, "Audio service unavailable");
            return;
          }

          const audioConfig = getAudioConfig();
          if (!audioConfig) {
            ws.close(1011, "Audio not configured");
            return;
          }

          const model = c.req.query("model") || audioConfig.defaultSttModel;
          const language = c.req.query("language") || undefined;

          mlxClient = new MlxRealtimeClient({
            baseUrl: audioConfig.baseUrl,
            model,
            language,
          });

          mlxClient.onDelta((text) => {
            ws.send(JSON.stringify({ type: "delta", delta: text }));
          });

          mlxClient.onComplete((text) => {
            ws.send(JSON.stringify({ type: "complete", text }));
          });

          mlxClient.onError((err) => {
            logger.error({ error: err.message }, "mlx-audio WebSocket error");
            ws.send(JSON.stringify({ type: "error", error: err.message }));
          });

          mlxClient.onClose(() => {
            logger.debug("mlx-audio WebSocket closed");
          });

          try {
            await mlxClient.connect();
            ws.send(JSON.stringify({ type: "connected" }));
            logger.info({ model, language }, "Streaming STT session started");
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Connection failed";
            logger.error(
              { error: msg },
              "Failed to connect to mlx-audio WebSocket",
            );
            ws.send(
              JSON.stringify({
                type: "error",
                error: `STT service connection failed: ${msg}`,
              }),
            );
            ws.close(1011, "Upstream connection failed");
          }
        },

        onMessage: (event, _ws) => {
          if (!mlxClient?.isConnected) return;

          const { data } = event;
          // Binary data = PCM audio chunk → forward to mlx-audio
          if (data instanceof ArrayBuffer) {
            mlxClient.sendAudio(Buffer.from(data));
          } else if (Buffer.isBuffer(data)) {
            mlxClient.sendAudio(data);
          } else if (typeof data === "string") {
            // JSON control message (e.g. {"action": "stop"})
            try {
              JSON.parse(data); // validate it's JSON
              mlxClient.sendJson(JSON.parse(data));
            } catch {
              // Not valid JSON — ignore
            }
          }
        },

        onClose: () => {
          logger.info("Streaming STT session ended");
          mlxClient?.close();
          mlxClient = null;
        },

        onError: (event) => {
          logger.error({ error: String(event) }, "Client WebSocket error");
          mlxClient?.close();
          mlxClient = null;
        },
      };
    });

    return handler(c, next);
  },
);
