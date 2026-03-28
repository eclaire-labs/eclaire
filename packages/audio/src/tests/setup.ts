/**
 * Audio Test Setup and Utilities
 *
 * Shared test infrastructure for @eclaire/audio package tests.
 */

import { vi } from "vitest";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderConfig,
  AudioProviderHealth,
  AudioProviderId,
  ElevenLabsProviderConfig,
  PocketTtsProviderConfig,
  WhisperCppProviderConfig,
} from "../types.js";

// =============================================================================
// TEST CONFIGS
// =============================================================================

export const TEST_MLX_CONFIG: AudioProviderConfig = {
  baseUrl: "http://127.0.0.1:9100",
  requestTimeoutMs: 5000,
  defaultSttModel: "test-stt-model",
  defaultTtsModel: "test-tts-model",
  defaultTtsVoice: "test-voice",
};

export const TEST_ELEVENLABS_CONFIG: ElevenLabsProviderConfig = {
  apiKey: "test-api-key",
  requestTimeoutMs: 5000,
  defaultSttModel: "scribe_v1",
  defaultTtsModel: "eleven_multilingual_v2",
  defaultTtsVoice: "test-voice-id",
};

export const TEST_WHISPER_CPP_CONFIG: WhisperCppProviderConfig = {
  baseUrl: "http://127.0.0.1:8080",
  requestTimeoutMs: 5000,
  defaultSttModel: "whisper-large-v3",
};

export const TEST_POCKET_TTS_CONFIG: PocketTtsProviderConfig = {
  baseUrl: "http://127.0.0.1:8000",
  requestTimeoutMs: 5000,
  defaultTtsModel: "pocket-tts",
  defaultTtsVoice: "alba",
};

// =============================================================================
// MOCK FETCH
// =============================================================================

export interface MockFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  headers?: Headers;
  body?: ReadableStream<Uint8Array> | null;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}

export interface MockFetchInstance {
  fetch: ReturnType<typeof vi.fn>;
  calls: Array<{ url: string; init?: RequestInit }>;
  queueResponse: (response: MockFetchResponse) => void;
  queueJsonResponse: (data: unknown, status?: number) => void;
  queueTextResponse: (text: string, status?: number) => void;
  queueBinaryResponse: (buffer: Buffer, status?: number) => void;
  queueErrorResponse: (status: number, message: string) => void;
  reset: () => void;
}

export function createMockFetch(): MockFetchInstance {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  let responseQueue: MockFetchResponse[] = [];

  const mockFetch = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });

    const response = responseQueue.shift();
    if (!response) {
      throw new Error("No mock response configured");
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers ?? new Headers(),
      body: response.body ?? null,
      json: response.json ?? (async () => ({})),
      text: response.text ?? (async () => ""),
      arrayBuffer: response.arrayBuffer ?? (async () => new ArrayBuffer(0)),
    };
  });

  return {
    fetch: mockFetch,
    calls,
    queueResponse: (response: MockFetchResponse) => {
      responseQueue.push(response);
    },
    queueJsonResponse: (data: unknown, status = 200) => {
      responseQueue.push({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        json: async () => data,
        text: async () => JSON.stringify(data),
      });
    },
    queueTextResponse: (text: string, status = 200) => {
      responseQueue.push({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        text: async () => text,
      });
    },
    queueBinaryResponse: (buffer: Buffer, status = 200) => {
      const ab = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(ab).set(new Uint8Array(buffer));
      responseQueue.push({
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? "OK" : "Error",
        arrayBuffer: async () => ab,
      });
    },
    queueErrorResponse: (status: number, message: string) => {
      responseQueue.push({
        ok: false,
        status,
        statusText: message,
        text: async () => message,
      });
    },
    reset: () => {
      calls.length = 0;
      responseQueue = [];
      mockFetch.mockClear();
    },
  };
}

// =============================================================================
// MOCK AUDIO PROVIDER
// =============================================================================

export function createMockAudioProvider(
  overrides: Partial<AudioProviderCapabilities> & {
    providerId?: AudioProviderId;
  } = {},
): AudioProvider {
  const providerId = overrides.providerId ?? "mlx-audio";
  const capabilities: AudioProviderCapabilities = {
    stt: overrides.stt ?? false,
    tts: overrides.tts ?? false,
    streamingStt: overrides.streamingStt ?? false,
    streamingTts: overrides.streamingTts ?? false,
  };

  return {
    providerId,
    capabilities,
    transcribe: vi.fn(async () => ({ text: "mock transcription" })),
    synthesize: vi.fn(async () => Buffer.from("mock-audio")),
    synthesizeStream: vi.fn(async () => new Response("mock-stream")),
    checkHealth: vi.fn(
      async (): Promise<AudioProviderHealth> => ({
        providerId,
        status: "ready",
        capabilities,
        defaults: { sttModel: "m1", ttsModel: "m2", ttsVoice: "v1" },
      }),
    ),
  };
}

// =============================================================================
// AUDIO FORMAT HELPERS
// =============================================================================

/**
 * Generate a minimal valid WAV file with silence.
 */
export function generateSilenceWav(
  durationSecs: number,
  sampleRate = 16000,
): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const numSamples = Math.floor(sampleRate * durationSecs);
  const dataSize = numSamples * numChannels * bytesPerSample;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);

  // fmt sub-chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // sub-chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  // Data is all zeros (silence)

  return buffer;
}

/** Check if a Buffer starts with a valid WAV (RIFF/WAVE) header */
export function hasWavHeader(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  );
}

/** Check if a Buffer starts with a valid MP3 header (ID3 tag or frame sync) */
export function hasMp3Header(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  // ID3v2 tag
  if (buf.toString("ascii", 0, 3) === "ID3") return true;
  // MPEG frame sync (0xFF followed by 0xE0-0xFF)
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true;
  return false;
}
