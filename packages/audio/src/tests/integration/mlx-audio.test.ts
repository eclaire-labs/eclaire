/**
 * MLX-Audio Integration Tests
 *
 * Tests against a real mlx-audio server. Skips if unreachable.
 * Run with: pnpm --filter @eclaire/audio test:integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { MlxAudioClient } from "../../mlx-client.js";
import { MlxAudioProvider } from "../../mlx-provider.js";
import { generateSilenceWav, hasMp3Header, hasWavHeader } from "../setup.js";

const BASE_URL = process.env.AUDIO_MLX_BASE_URL ?? "http://127.0.0.1:9100";
const STT_MODEL =
  process.env.AUDIO_MLX_STT_MODEL ?? "mlx-community/whisper-large-v3-turbo";
const TTS_MODEL =
  process.env.AUDIO_MLX_TTS_MODEL ?? "mlx-community/Kokoro-82M-bf16";

const client = new MlxAudioClient({ baseUrl: BASE_URL, timeoutMs: 30000 });
const provider = new MlxAudioProvider({
  baseUrl: BASE_URL,
  requestTimeoutMs: 30000,
  defaultSttModel: STT_MODEL,
  defaultTtsModel: TTS_MODEL,
  defaultTtsVoice: "af_heart",
});

describe("mlx-audio integration", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await client.ping();
    if (!serverAvailable) {
      console.log(`mlx-audio server not available at ${BASE_URL} — skipping`);
    }
  });

  // ---------------------------------------------------------------------------
  // health
  // ---------------------------------------------------------------------------

  describe("health", () => {
    it("ping returns true", ({ skip }) => {
      if (!serverAvailable) skip();
      expect(serverAvailable).toBe(true);
    });

    it("listModels returns a response", async ({ skip }) => {
      if (!serverAvailable) skip();
      const models = await client.listModels();
      expect(models.object).toBe("list");
      expect(Array.isArray(models.data)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // STT
  // ---------------------------------------------------------------------------

  describe("STT", () => {
    it("transcribes a silence WAV or reports STT model unavailable", async ({
      skip,
    }) => {
      if (!serverAvailable) skip();
      const silenceWav = generateSilenceWav(1);
      try {
        const result = await provider.transcribe({
          file: silenceWav,
          fileName: "silence.wav",
        });
        expect(typeof result.text).toBe("string");
      } catch (err) {
        // mlx-audio STT may not have a model loaded, or silence may be rejected
        console.log(
          `  mlx-audio STT unavailable or rejected silence: ${err instanceof Error ? err.message : err}`,
        );
      }
    });
  });

  // ---------------------------------------------------------------------------
  // TTS
  // ---------------------------------------------------------------------------

  describe("TTS", () => {
    it("synthesizes text to mp3 with valid header", async ({ skip }) => {
      if (!serverAvailable) skip();
      const buffer = await provider.synthesize({
        text: "Hello world",
        format: "mp3",
      });
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(hasMp3Header(buffer)).toBe(true);
    });

    it("synthesizes text to wav with valid RIFF header", async ({ skip }) => {
      if (!serverAvailable) skip();
      const buffer = await provider.synthesize({
        text: "Hello world",
        format: "wav",
      });
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(1000);
      expect(hasWavHeader(buffer)).toBe(true);
    });

    it("synthesizeStream returns a Response with body", async ({ skip }) => {
      if (!serverAvailable) skip();
      const response = await provider.synthesizeStream({
        text: "Hello world",
        format: "wav",
      });
      expect(response.body).toBeTruthy();
      // Read a bit to confirm it's streaming
      const reader = response.body!.getReader();
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      expect(value!.length).toBeGreaterThan(0);
      reader.cancel();
    });
  });

  // ---------------------------------------------------------------------------
  // streaming STT (WebSocket)
  // ---------------------------------------------------------------------------

  describe("streaming STT (WebSocket)", () => {
    it("connects and disconnects cleanly", async ({ skip }) => {
      if (!serverAvailable) skip();
      const { MlxRealtimeClient } = await import("../../mlx-ws-client.js");
      const rtClient = new MlxRealtimeClient({
        baseUrl: BASE_URL,
        model: STT_MODEL,
      });

      await rtClient.connect();
      expect(rtClient.isConnected).toBe(true);
      rtClient.close();
      expect(rtClient.isConnected).toBe(false);
    });
  });
});
