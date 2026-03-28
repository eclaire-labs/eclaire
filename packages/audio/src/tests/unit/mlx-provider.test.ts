import { beforeEach, describe, expect, it, vi } from "vitest";
import { MlxAudioProvider } from "../../mlx-provider.js";
import { TEST_MLX_CONFIG } from "../setup.js";

// Shared mock state
const mockClient = {
  transcribe: vi.fn(async () => ({ text: "transcribed" })),
  synthesize: vi.fn(async () => Buffer.from("audio")),
  synthesizeStream: vi.fn(async () => new Response("stream")),
  ping: vi.fn(async () => true),
  listModels: vi.fn(async () => ({ object: "list", data: [] })),
};

const mockReadAudioFile = vi.fn((filePath: string) => ({
  file: Buffer.from("file-data"),
  fileName: filePath.split("/").pop() ?? "audio.wav",
}));

vi.mock("../../mlx-client.js", () => ({
  MlxAudioClient: class {
    constructor() {
      Object.assign(this, mockClient);
    }
  },
  readAudioFile: (...args: unknown[]) =>
    mockReadAudioFile(...(args as [string])),
}));

describe("MlxAudioProvider", () => {
  let provider: MlxAudioProvider;

  beforeEach(() => {
    for (const fn of Object.values(mockClient)) fn.mockClear();
    mockClient.ping.mockResolvedValue(true);
    mockReadAudioFile.mockClear();
    provider = new MlxAudioProvider(TEST_MLX_CONFIG);
  });

  // ---------------------------------------------------------------------------
  // capabilities
  // ---------------------------------------------------------------------------

  describe("capabilities", () => {
    it('has providerId "mlx-audio"', () => {
      expect(provider.providerId).toBe("mlx-audio");
    });

    it("reports all capabilities as true", () => {
      expect(provider.capabilities).toEqual({
        stt: true,
        tts: true,
        streamingStt: true,
        streamingTts: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // transcribe
  // ---------------------------------------------------------------------------

  describe("transcribe", () => {
    it("uses defaultSttModel when input.model is undefined", async () => {
      await provider.transcribe({ file: Buffer.from("audio") });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ model: "test-stt-model" }),
      );
    });

    it("passes explicit model when provided", async () => {
      await provider.transcribe({
        file: Buffer.from("audio"),
        model: "custom-model",
      });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ model: "custom-model" }),
      );
    });

    it("reads file from disk when input.file is a string path", async () => {
      await provider.transcribe({ file: "/path/to/audio.wav" });
      expect(mockReadAudioFile).toHaveBeenCalledWith("/path/to/audio.wav");
    });

    it("uses input.fileName when provided", async () => {
      await provider.transcribe({
        file: Buffer.from("audio"),
        fileName: "custom.mp3",
      });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: "custom.mp3" }),
      );
    });

    it("passes language through to client", async () => {
      await provider.transcribe({ file: Buffer.from("audio"), language: "fr" });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ language: "fr" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesize
  // ---------------------------------------------------------------------------

  describe("synthesize", () => {
    it("uses defaultTtsModel when input.model is undefined", async () => {
      await provider.synthesize({ text: "Hello" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ model: "test-tts-model" }),
      );
    });

    it("uses defaultTtsVoice when input.voice is undefined", async () => {
      await provider.synthesize({ text: "Hello" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ voice: "test-voice" }),
      );
    });

    it('defaults format to "mp3"', async () => {
      await provider.synthesize({ text: "Hello" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ format: "mp3" }),
      );
    });

    it('defaults to "en-Emma_woman" when model contains "vibevoice" and no voice set', async () => {
      const noVoiceConfig = { ...TEST_MLX_CONFIG, defaultTtsVoice: "" };
      const p = new MlxAudioProvider(noVoiceConfig);
      await p.synthesize({
        text: "Hello",
        model: "mlx-community/VibeVoice-0.5B",
      });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ voice: "en-Emma_woman" }),
      );
    });

    it("passes speed and instruct through to client", async () => {
      await provider.synthesize({
        text: "Hello",
        speed: 1.5,
        instruct: "happy",
      });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ speed: 1.5, instruct: "happy" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    it('defaults format to "wav" (different from synthesize)', async () => {
      await provider.synthesizeStream({ text: "Hello" });
      expect(mockClient.synthesizeStream).toHaveBeenCalledWith(
        expect.objectContaining({ format: "wav" }),
      );
    });

    it("applies VibeVoice default voice logic", async () => {
      const noVoiceConfig = { ...TEST_MLX_CONFIG, defaultTtsVoice: "" };
      const p = new MlxAudioProvider(noVoiceConfig);
      await p.synthesizeStream({ text: "Hello", model: "vibevoice-model" });
      expect(mockClient.synthesizeStream).toHaveBeenCalledWith(
        expect.objectContaining({ voice: "en-Emma_woman" }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // checkHealth
  // ---------------------------------------------------------------------------

  describe("checkHealth", () => {
    it('returns "ready" with defaults when ping succeeds', async () => {
      const health = await provider.checkHealth();
      expect(health.status).toBe("ready");
      expect(health.providerId).toBe("mlx-audio");
      expect(health.defaults).toEqual({
        sttModel: "test-stt-model",
        ttsModel: "test-tts-model",
        ttsVoice: "test-voice",
      });
    });

    it('returns "unavailable" when ping returns false', async () => {
      mockClient.ping.mockResolvedValueOnce(false);
      const health = await provider.checkHealth();
      expect(health.status).toBe("unavailable");
      expect(health.defaults).toBeUndefined();
    });

    it('returns "unavailable" when ping throws', async () => {
      mockClient.ping.mockRejectedValueOnce(new Error("network error"));
      const health = await provider.checkHealth();
      expect(health.status).toBe("unavailable");
    });
  });
});
