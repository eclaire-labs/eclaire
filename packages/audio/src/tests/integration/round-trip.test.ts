/**
 * TTS -> STT Round-Trip Integration Tests
 *
 * The most valuable integration test: TTS generates audio, then STT
 * transcribes it back. Validates both systems work end-to-end without
 * a human listener.
 *
 * Uses fuzzy matching — checks for key words rather than exact strings
 * to account for model variations, punctuation, and casing differences.
 *
 * Run with: pnpm --filter @eclaire/audio test:integration
 */

import { beforeAll, describe, expect, it } from "vitest";
import { MlxAudioClient } from "../../mlx-client.js";
import { MlxAudioProvider } from "../../mlx-provider.js";
import { PocketTtsClient } from "../../pocket-tts-client.js";
import { PocketTtsProvider } from "../../pocket-tts-provider.js";
import { WhisperCppClient } from "../../whisper-cpp-client.js";
import { WhisperCppProvider } from "../../whisper-cpp-provider.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MLX_BASE_URL = process.env.AUDIO_MLX_BASE_URL ?? "http://127.0.0.1:9100";
const MLX_STT_MODEL =
  process.env.AUDIO_MLX_STT_MODEL ?? "mlx-community/whisper-large-v3-turbo";
const MLX_TTS_MODEL =
  process.env.AUDIO_MLX_TTS_MODEL ?? "mlx-community/Kokoro-82M-bf16";
const WHISPER_CPP_BASE_URL =
  process.env.AUDIO_WHISPER_CPP_BASE_URL ?? "http://127.0.0.1:8080";
const POCKET_TTS_BASE_URL =
  process.env.AUDIO_POCKET_TTS_BASE_URL ?? "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// Provider instances
// ---------------------------------------------------------------------------

const mlxClient = new MlxAudioClient({
  baseUrl: MLX_BASE_URL,
  timeoutMs: 30000,
});
const mlxProvider = new MlxAudioProvider({
  baseUrl: MLX_BASE_URL,
  requestTimeoutMs: 30000,
  defaultSttModel: MLX_STT_MODEL,
  defaultTtsModel: MLX_TTS_MODEL,
  defaultTtsVoice: "af_heart",
});

const whisperCppClient = new WhisperCppClient({
  baseUrl: WHISPER_CPP_BASE_URL,
  timeoutMs: 30000,
});
const whisperCppProvider = new WhisperCppProvider({
  baseUrl: WHISPER_CPP_BASE_URL,
  requestTimeoutMs: 30000,
  defaultSttModel: "whisper-large-v3",
});

const pocketTtsClient = new PocketTtsClient({
  baseUrl: POCKET_TTS_BASE_URL,
  timeoutMs: 30000,
});
const pocketTtsProvider = new PocketTtsProvider({
  baseUrl: POCKET_TTS_BASE_URL,
  requestTimeoutMs: 30000,
  defaultTtsModel: "pocket-tts",
  defaultTtsVoice: "alba",
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function containsAnyWord(text: string, words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TTS -> STT round-trip", () => {
  let mlxAvailable = false;
  let whisperCppAvailable = false;
  let pocketTtsAvailable = false;

  beforeAll(async () => {
    [mlxAvailable, whisperCppAvailable, pocketTtsAvailable] = await Promise.all(
      [mlxClient.ping(), whisperCppClient.ping(), pocketTtsClient.ping()],
    );

    if (!mlxAvailable) {
      console.log(
        `mlx-audio server not available at ${MLX_BASE_URL} — round-trip tests will be skipped`,
      );
    }
  });

  it("mlx-audio TTS -> mlx-audio STT: recognizable transcription", async ({
    skip,
  }) => {
    if (!mlxAvailable) skip();

    // 1. Synthesize a short, clear sentence to WAV
    const audioBuffer = await mlxProvider.synthesize({
      text: "Hello world",
      format: "wav",
    });
    expect(audioBuffer.length).toBeGreaterThan(1000);

    // 2. Transcribe the generated audio
    //    mlx-audio STT may not have a model loaded — treat server errors as skip
    let result: { text: string };
    try {
      result = await mlxProvider.transcribe({
        file: audioBuffer,
        fileName: "round-trip.wav",
      });
    } catch (err) {
      console.log(
        `  mlx-audio STT unavailable (model may not be loaded): ${err instanceof Error ? err.message : err}`,
      );
      skip();
      return;
    }

    // 3. Fuzzy match — expect key words to survive the round-trip
    console.log(`  mlx->mlx transcription: "${result.text}"`);
    expect(containsAnyWord(result.text, ["hello", "world"])).toBe(true);
  });

  it("pocket-tts TTS -> mlx-audio STT: cross-provider round-trip", async ({
    skip,
  }) => {
    if (!mlxAvailable || !pocketTtsAvailable) skip();

    const audioBuffer = await pocketTtsProvider.synthesize({
      text: "Hello world",
    });

    let result: { text: string };
    try {
      result = await mlxProvider.transcribe({
        file: audioBuffer,
        fileName: "pocket-to-mlx.wav",
      });
    } catch (err) {
      console.log(
        `  mlx-audio STT unavailable: ${err instanceof Error ? err.message : err}`,
      );
      skip();
      return;
    }

    console.log(`  pocket->mlx transcription: "${result.text}"`);
    expect(containsAnyWord(result.text, ["hello", "world"])).toBe(true);
  });

  it("mlx-audio TTS -> whisper-cpp STT: cross-provider round-trip", async ({
    skip,
  }) => {
    if (!mlxAvailable || !whisperCppAvailable) skip();

    const audioBuffer = await mlxProvider.synthesize({
      text: "Hello world",
      format: "wav",
    });

    const result = await whisperCppProvider.transcribe({
      file: audioBuffer,
      fileName: "mlx-to-whisper.wav",
    });

    console.log(`  mlx->whisper transcription: "${result.text}"`);
    expect(containsAnyWord(result.text, ["hello", "world"])).toBe(true);
  });
});
