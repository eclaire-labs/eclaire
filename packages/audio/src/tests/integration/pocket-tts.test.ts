/**
 * Pocket TTS Integration Tests
 *
 * Tests against a real pocket-tts server. Skips if unreachable.
 * Run with: pnpm --filter @eclaire/audio test:integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { PocketTtsClient } from "../../pocket-tts-client.js";
import { PocketTtsProvider } from "../../pocket-tts-provider.js";
import { hasWavHeader } from "../setup.js";

const BASE_URL =
  process.env.AUDIO_POCKET_TTS_BASE_URL ?? "http://127.0.0.1:8000";

const client = new PocketTtsClient({ baseUrl: BASE_URL, timeoutMs: 30000 });
const provider = new PocketTtsProvider({
  baseUrl: BASE_URL,
  requestTimeoutMs: 30000,
  defaultTtsModel: "pocket-tts",
  defaultTtsVoice: "alba",
});

describe("pocket-tts integration", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await client.ping();
    if (!serverAvailable) {
      console.log(`pocket-tts server not available at ${BASE_URL} — skipping`);
    }
  });

  describe("health", () => {
    it("ping returns true", ({ skip }) => {
      if (!serverAvailable) skip();
      expect(serverAvailable).toBe(true);
    });
  });

  describe("TTS", () => {
    it("synthesizes text to audio Buffer", async ({ skip }) => {
      if (!serverAvailable) skip();
      const buffer = await provider.synthesize({ text: "Hello world" });
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.length).toBeGreaterThan(100);
    });

    it("audio has valid WAV header", async ({ skip }) => {
      if (!serverAvailable) skip();
      const buffer = await provider.synthesize({ text: "Hello" });
      expect(hasWavHeader(buffer)).toBe(true);
    });

    it("synthesizes with different voices", async ({ skip }) => {
      if (!serverAvailable) skip();
      const buffer1 = await provider.synthesize({
        text: "Hello",
        voice: "alba",
      });
      const buffer2 = await provider.synthesize({
        text: "Hello",
        voice: "marius",
      });
      expect(buffer1.length).toBeGreaterThan(0);
      expect(buffer2.length).toBeGreaterThan(0);
    });

    it("synthesizeStream returns readable Response", async ({ skip }) => {
      if (!serverAvailable) skip();
      const response = await provider.synthesizeStream({ text: "Hello world" });
      expect(response.body).toBeTruthy();
      const reader = response.body!.getReader();
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      expect(value!.length).toBeGreaterThan(0);
      reader.cancel();
    });
  });
});
