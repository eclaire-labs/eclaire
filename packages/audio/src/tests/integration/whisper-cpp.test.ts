/**
 * Whisper.cpp Integration Tests
 *
 * Tests against a real whisper-cpp server. Skips if unreachable.
 * Run with: pnpm --filter @eclaire/audio test:integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { WhisperCppClient } from "../../whisper-cpp-client.js";
import { WhisperCppProvider } from "../../whisper-cpp-provider.js";
import { generateSilenceWav } from "../setup.js";

const BASE_URL =
  process.env.AUDIO_WHISPER_CPP_BASE_URL ?? "http://127.0.0.1:8080";
const STT_MODEL = process.env.AUDIO_WHISPER_CPP_STT_MODEL ?? "whisper-large-v3";

const client = new WhisperCppClient({ baseUrl: BASE_URL, timeoutMs: 30000 });
const provider = new WhisperCppProvider({
  baseUrl: BASE_URL,
  requestTimeoutMs: 30000,
  defaultSttModel: STT_MODEL,
});

describe("whisper-cpp integration", () => {
  let serverAvailable = false;

  beforeAll(async () => {
    serverAvailable = await client.ping();
    if (!serverAvailable) {
      console.log(`whisper-cpp server not available at ${BASE_URL} — skipping`);
    }
  });

  describe("health", () => {
    it("ping returns true", ({ skip }) => {
      if (!serverAvailable) skip();
      expect(serverAvailable).toBe(true);
    });
  });

  describe("STT", () => {
    it("transcribes a silence WAV and returns text", async ({ skip }) => {
      if (!serverAvailable) skip();
      const silenceWav = generateSilenceWav(1);
      const result = await provider.transcribe({
        file: silenceWav,
        fileName: "silence.wav",
      });
      expect(typeof result.text).toBe("string");
    });

    it("handles language parameter", async ({ skip }) => {
      if (!serverAvailable) skip();
      const silenceWav = generateSilenceWav(1);
      const result = await provider.transcribe({
        file: silenceWav,
        fileName: "silence.wav",
        language: "en",
      });
      expect(typeof result.text).toBe("string");
    });
  });
});
