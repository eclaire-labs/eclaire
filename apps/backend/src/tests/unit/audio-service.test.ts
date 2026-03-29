/**
 * Audio Service Unit Tests
 *
 * Tests the audio service layer (provider registry, routing, health aggregation).
 * Uses vi.resetModules() for isolation since the service uses module-level state.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AudioProvider,
  AudioProviderCapabilities,
  AudioProviderHealth,
  AudioProviderId,
} from "@eclaire/audio";

// ---------------------------------------------------------------------------
// Mock provider factory
// ---------------------------------------------------------------------------

function createMockProvider(
  id: AudioProviderId,
  caps: Partial<AudioProviderCapabilities> = {},
): AudioProvider {
  const capabilities: AudioProviderCapabilities = {
    stt: caps.stt ?? false,
    tts: caps.tts ?? false,
    streamingStt: caps.streamingStt ?? false,
    streamingTts: caps.streamingTts ?? false,
  };

  return {
    providerId: id,
    capabilities,
    transcribe: vi.fn(async () => ({ text: "test transcription" })),
    synthesize: vi.fn(async () => Buffer.from("test-audio")),
    synthesizeStream: vi.fn(async () => new Response("test-stream")),
    checkHealth: vi.fn(
      async (): Promise<AudioProviderHealth> => ({
        providerId: id,
        status: "ready",
        capabilities,
        defaults: { sttModel: "m1", ttsModel: "m2", ttsVoice: "v1" },
      }),
    ),
  };
}

// ---------------------------------------------------------------------------
// Mock the provider constructors
// ---------------------------------------------------------------------------

const mockProviders: Record<string, AudioProvider> = {};

vi.mock("@eclaire/audio", () => ({
  MlxAudioProvider: class {
    constructor() {
      Object.assign(this, mockProviders["mlx-audio"]);
    }
  },
  MlxRealtimeClient: class {
    isConnected = false;
    async connect() {
      this.isConnected = true;
    }
    sendAudio() {}
    sendJson() {}
    close() {}
    onDelta() {}
    onComplete() {}
    onError() {}
    onClose() {}
  },
  ElevenLabsProvider: class {
    constructor() {
      Object.assign(this, mockProviders.elevenlabs);
    }
  },
  WhisperCppProvider: class {
    constructor() {
      Object.assign(this, mockProviders["whisper-cpp"]);
    }
  },
  PocketTtsProvider: class {
    constructor() {
      Object.assign(this, mockProviders["pocket-tts"]);
    }
  },
}));

vi.mock("../../lib/logger.js", () => ({
  createChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Dynamic import for fresh module per test
// ---------------------------------------------------------------------------

type AudioServiceModule = typeof import("../../lib/services/audio.js");

async function freshAudioService(): Promise<AudioServiceModule> {
  vi.resetModules();
  return import("../../lib/services/audio.js");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Audio Service", () => {
  beforeEach(() => {
    // Reset shared mock providers
    mockProviders["mlx-audio"] = createMockProvider("mlx-audio", {
      stt: true,
      tts: true,
      streamingStt: true,
      streamingTts: true,
    });
    mockProviders.elevenlabs = createMockProvider("elevenlabs", {
      stt: true,
      tts: true,
      streamingTts: true,
    });
    mockProviders["whisper-cpp"] = createMockProvider("whisper-cpp", {
      stt: true,
    });
    mockProviders["pocket-tts"] = createMockProvider("pocket-tts", {
      tts: true,
      streamingTts: true,
    });
  });

  // ---------------------------------------------------------------------------
  // initAudioProviders / isAudioAvailable / getAvailableProviders
  // ---------------------------------------------------------------------------

  describe("initAudioProviders", () => {
    it("isAudioAvailable returns false before init", async () => {
      const svc = await freshAudioService();
      expect(svc.isAudioAvailable()).toBe(false);
    });

    it("isAudioAvailable returns true after init with mlxAudio", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      expect(svc.isAudioAvailable()).toBe(true);
    });

    it("creates providers for all provided configs", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        elevenLabs: {
          apiKey: "k",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "v",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
        pocketTts: {
          baseUrl: "http://localhost:8000",
          requestTimeoutMs: 5000,
          defaultTtsModel: "m",
          defaultTtsVoice: "v",
        },
      });
      expect(svc.getAvailableProviders()).toHaveLength(4);
      expect(svc.getAvailableProviders()).toContain("mlx-audio");
      expect(svc.getAvailableProviders()).toContain("elevenlabs");
      expect(svc.getAvailableProviders()).toContain("whisper-cpp");
      expect(svc.getAvailableProviders()).toContain("pocket-tts");
    });

    it("getAvailableProviders returns empty array before init", async () => {
      const svc = await freshAudioService();
      expect(svc.getAvailableProviders()).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // transcribe
  // ---------------------------------------------------------------------------

  describe("transcribe", () => {
    it("defaults to mlx-audio when no provider specified", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      const audioInput = Buffer.from("audio");
      const result = await svc.transcribe({ file: audioInput });
      expect(result.text).toBe("test transcription");
      expect(mockProviders["mlx-audio"]!.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ file: audioInput }),
      );
    });

    it("routes to specified provider", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
      });
      await svc.transcribe({ file: Buffer.from("audio") }, "whisper-cpp");
      expect(mockProviders["whisper-cpp"]!.transcribe).toHaveBeenCalled();
    });

    it("throws for unknown provider", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      await expect(
        svc.transcribe({ file: Buffer.from("audio") }, "unknown"),
      ).rejects.toThrow("not configured");
    });

    it("rejects if provider lacks STT capability", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        pocketTts: {
          baseUrl: "http://localhost:8000",
          requestTimeoutMs: 5000,
          defaultTtsModel: "m",
          defaultTtsVoice: "v",
        },
      });
      await expect(
        svc.transcribe({ file: Buffer.from("audio") }, "pocket-tts"),
      ).rejects.toThrow("does not support STT");
    });
  });

  // ---------------------------------------------------------------------------
  // synthesize
  // ---------------------------------------------------------------------------

  describe("synthesize", () => {
    it("defaults to mlx-audio when no provider specified", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      const result = await svc.synthesize({ text: "Hello" });
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("rejects if provider lacks TTS capability", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
      });
      await expect(
        svc.synthesize({ text: "Hello" }, "whisper-cpp"),
      ).rejects.toThrow("does not support TTS");
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    it("rejects if provider lacks TTS capability", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
      });
      await expect(
        svc.synthesizeStream({ text: "Hello" }, "whisper-cpp"),
      ).rejects.toThrow("does not support TTS");
    });
  });

  // ---------------------------------------------------------------------------
  // getAudioHealth
  // ---------------------------------------------------------------------------

  describe("getAudioHealth", () => {
    it('returns "unavailable" when no providers configured', async () => {
      const svc = await freshAudioService();
      const health = await svc.getAudioHealth();
      expect(health.status).toBe("unavailable");
    });

    it("aggregates health from all providers", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
      });
      const health = await svc.getAudioHealth();
      expect(health.providers).toHaveLength(2);
      const providerIds = health.providers.map(
        (p: { providerId: string }) => p.providerId,
      );
      expect(providerIds).toContain("mlx-audio");
      expect(providerIds).toContain("whisper-cpp");
      expect(health.status).toBe("ready");
    });

    it('top-level status is "ready" if any provider is ready', async () => {
      const svc = await freshAudioService();
      // Make mlx-audio unavailable
      (
        mockProviders["mlx-audio"]!.checkHealth as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        providerId: "mlx-audio",
        status: "unavailable",
        capabilities: mockProviders["mlx-audio"]!.capabilities,
      });
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
      });
      const health = await svc.getAudioHealth();
      // whisper-cpp is still ready
      expect(health.status).toBe("ready");
    });

    it("defaults come from mlx-audio (default provider)", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      const health = await svc.getAudioHealth();
      expect(health.defaults).toBeDefined();
      expect(health.streamingEnabled).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // createRealtimeClient
  // ---------------------------------------------------------------------------

  describe("createRealtimeClient", () => {
    it("returns client for mlx-audio with streaming STT", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      const client = svc.createRealtimeClient();
      expect(client).not.toBeNull();
    });

    it("returns null for providers without streaming STT", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
        whisperCpp: {
          baseUrl: "http://localhost:8080",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
        },
      });
      const client = svc.createRealtimeClient("whisper-cpp");
      expect(client).toBeNull();
    });

    it("returns null for unconfigured providers", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });
      const client = svc.createRealtimeClient("elevenlabs");
      expect(client).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // createProcessAudioMessage
  // ---------------------------------------------------------------------------

  describe("createProcessAudioMessage", () => {
    it("composes STT -> AI -> optional TTS pipeline", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });

      const processPromptRequest = vi.fn(async () => ({
        response: "AI reply",
      }));
      const recordHistory = vi.fn();
      const process = svc.createProcessAudioMessage({
        processPromptRequest,
        recordHistory,
      });

      const audioInput = Buffer.from("audio");
      const result = await process("user-1", audioInput, {
        format: "wav",
        ttsEnabled: true,
        ttsFormat: "mp3",
        channelId: "ch-1",
        agentActorId: "eclaire",
      });

      // Verify STT received the audio input
      expect(mockProviders["mlx-audio"]!.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ file: audioInput }),
      );
      // Verify AI received the transcribed text
      expect(processPromptRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-1",
          prompt: "test transcription",
        }),
      );
      // Verify TTS received the AI response
      expect(mockProviders["mlx-audio"]!.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ text: "AI reply" }),
      );
      // Verify result
      expect(result.response).toBe("AI reply");
      expect(result.audioResponse).toBeDefined();
    });

    it("throws when audio service not available", async () => {
      const svc = await freshAudioService();
      const process = svc.createProcessAudioMessage({
        processPromptRequest: vi.fn(),
        recordHistory: vi.fn(),
      });
      await expect(process("user-1", Buffer.from("audio"), {})).rejects.toThrow(
        "Audio service not available",
      );
    });

    it("returns undefined response when transcription is empty", async () => {
      const svc = await freshAudioService();
      // Make transcribe return empty text
      (
        mockProviders["mlx-audio"]!.transcribe as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        text: "",
      });
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });

      const processPromptRequest = vi.fn();
      const process = svc.createProcessAudioMessage({
        processPromptRequest,
        recordHistory: vi.fn(),
      });

      const result = await process("user-1", Buffer.from("audio"), {
        format: "wav",
      });
      expect(processPromptRequest).not.toHaveBeenCalled();
      expect(result.response).toBeUndefined();
    });

    it("skips TTS when ttsEnabled is false", async () => {
      const svc = await freshAudioService();
      svc.initAudioProviders({
        mlxAudio: {
          baseUrl: "http://localhost:9100",
          requestTimeoutMs: 5000,
          defaultSttModel: "m",
          defaultTtsModel: "m",
          defaultTtsVoice: "",
        },
      });

      const process = svc.createProcessAudioMessage({
        processPromptRequest: vi.fn(async () => ({ response: "reply" })),
        recordHistory: vi.fn(),
      });

      const result = await process("user-1", Buffer.from("audio"), {
        format: "wav",
        ttsEnabled: false,
      });
      expect(result.audioResponse).toBeUndefined();
    });
  });
});
