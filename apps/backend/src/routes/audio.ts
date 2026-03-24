/**
 * Audio Routes
 *
 * REST + WebSocket endpoints for STT/TTS, routing to the appropriate audio provider.
 *
 *   GET  /api/audio/health                    → audio service health (all providers)
 *   POST /api/audio/transcriptions            → upload audio → { text }
 *   POST /api/audio/speech                    → { text } → binary audio
 *   WS   /api/audio/transcriptions/stream     → real-time streaming STT
 */

import { Hono } from "hono";
import { validator as zValidator } from "hono-openapi";
import { assertPrincipalScopes } from "../lib/auth-principal.js";
import { getAuthenticatedPrincipal } from "../lib/auth-utils.js";
import { ForbiddenError } from "../lib/errors.js";
import { createChildLogger } from "../lib/logger.js";
import {
  createRealtimeClient,
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
    const sttProvider =
      typeof body.provider === "string" ? body.provider : undefined;

    const result = await transcribe(
      {
        file: buffer,
        fileName: file.name,
        model,
        language,
      },
      sttProvider,
    );

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

    const { text, voice, speed, format, model, instruct, stream, provider } =
      c.req.valid("json");
    const outputFormat = format ?? "mp3";

    // Streaming mode: pipe upstream response through to client
    if (stream) {
      const upstreamResponse = await synthesizeStream(
        {
          text,
          voice,
          speed,
          format: outputFormat,
          model,
          instruct,
        },
        provider,
      );

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
    const audioBuffer = await synthesize(
      {
        text,
        voice,
        speed,
        format: outputFormat,
        model,
        instruct,
      },
      provider,
    );

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
    // Authenticate and enforce scopes before upgrading to WebSocket
    const principal = await getAuthenticatedPrincipal(c);
    if (!principal) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    try {
      assertPrincipalScopes(principal, ["audio:write"]);
    } catch (error) {
      if (error instanceof ForbiddenError) {
        return c.json({ error: error.message }, 403);
      }
      throw error;
    }
    c.set("principal", principal);
    return next();
  },
  async (c, next) => {
    const upgradeWebSocket = getUpgradeWebSocket();
    const handler = upgradeWebSocket((c) => {
      let realtimeClient: ReturnType<typeof createRealtimeClient> = null;

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

          const sttProvider = c.req.query("provider") || undefined;
          const model = c.req.query("model") || undefined;
          const language = c.req.query("language") || undefined;

          realtimeClient = createRealtimeClient(sttProvider, model, language);

          if (!realtimeClient) {
            const providerName = sttProvider || "mlx-audio";
            ws.send(
              JSON.stringify({
                type: "error",
                error: `Streaming STT is not supported by provider "${providerName}"`,
              }),
            );
            ws.close(1011, "Provider does not support streaming STT");
            return;
          }

          realtimeClient.onDelta((text) => {
            ws.send(JSON.stringify({ type: "delta", delta: text }));
          });

          realtimeClient.onComplete((text) => {
            ws.send(JSON.stringify({ type: "complete", text }));
          });

          realtimeClient.onError((err) => {
            logger.error({ error: err.message }, "Upstream WebSocket error");
            ws.send(JSON.stringify({ type: "error", error: err.message }));
          });

          realtimeClient.onClose(() => {
            logger.debug("Upstream WebSocket closed");
          });

          try {
            await realtimeClient.connect();
            ws.send(JSON.stringify({ type: "connected" }));
            logger.info(
              { provider: sttProvider || "mlx-audio", model, language },
              "Streaming STT session started",
            );
          } catch (err) {
            const msg =
              err instanceof Error ? err.message : "Connection failed";
            logger.error(
              { error: msg },
              "Failed to connect to upstream WebSocket",
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
          if (!realtimeClient?.isConnected) return;

          const { data } = event;
          // Binary data = PCM audio chunk → forward to upstream
          if (data instanceof ArrayBuffer) {
            realtimeClient.sendAudio(Buffer.from(data));
          } else if (Buffer.isBuffer(data)) {
            realtimeClient.sendAudio(data);
          } else if (typeof data === "string") {
            // JSON control message (e.g. {"action": "stop"})
            try {
              JSON.parse(data); // validate it's JSON
              realtimeClient.sendJson(JSON.parse(data));
            } catch {
              // Not valid JSON — ignore
            }
          }
        },

        onClose: () => {
          logger.info("Streaming STT session ended");
          realtimeClient?.close();
          realtimeClient = null;
        },

        onError: (event) => {
          logger.error({ error: String(event) }, "Client WebSocket error");
          realtimeClient?.close();
          realtimeClient = null;
        },
      };
    });

    return handler(c, next);
  },
);
