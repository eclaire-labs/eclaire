import { beforeEach, describe, expect, it, vi } from "vitest";

import { RapidMlxAudioProvider } from "../../rapid-mlx-provider.js";
import { TEST_RAPID_MLX_CONFIG } from "../setup.js";

const mockClient = {
  transcribe: vi.fn(async () => ({ text: "transcribed" })),
  synthesize: vi.fn(async () => Buffer.from("audio")),
  synthesizeStream: vi.fn(async () => new Response("stream")),
  ping: vi.fn(async () => true),
  listModels: vi.fn(async () => ({ data: [] })),
};

const mockReadAudioFile = vi.fn((filePath: string) => ({
  file: Buffer.from("file-data"),
  fileName: filePath.split("/").pop() ?? "audio.wav",
}));

vi.mock("../../rapid-mlx-client.js", () => ({
  RapidMlxAudioClient: class {
    constructor() {
      Object.assign(this, mockClient);
    }
  },
}));

vi.mock("../../mlx-client.js", () => ({
  readAudioFile: (...args: unknown[]) =>
    mockReadAudioFile(...(args as [string])),
}));

describe("RapidMlxAudioProvider", () => {
  let provider: RapidMlxAudioProvider;

  beforeEach(() => {
    for (const fn of Object.values(mockClient)) fn.mockClear();
    mockClient.ping.mockResolvedValue(true);
    mockReadAudioFile.mockClear();
    provider = new RapidMlxAudioProvider(TEST_RAPID_MLX_CONFIG);
  });

  // ---------------------------------------------------------------------------
  // capabilities
  // ---------------------------------------------------------------------------

  describe("capabilities", () => {
    it('has providerId "rapid-mlx"', () => {
      expect(provider.providerId).toBe("rapid-mlx");
    });

    it("reports streamingStt as false (no WebSocket STT)", () => {
      expect(provider.capabilities).toEqual({
        stt: true,
        tts: true,
        streamingStt: false,
        streamingTts: false,
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

    it('defaults format to "wav"', async () => {
      await provider.synthesize({ text: "Hello" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ format: "wav" }),
      );
    });

    it("maps instruct to instructions for Rapid-MLX", async () => {
      await provider.synthesize({ text: "Hello", instruct: "speak happily" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ instructions: "speak happily" }),
      );
    });

    it("passes speed through to client", async () => {
      await provider.synthesize({ text: "Hello", speed: 1.5 });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ speed: 1.5 }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    it("rejects unsupported streaming without calling the client", async () => {
      await expect(
        provider.synthesizeStream({ text: "Hello" }),
      ).rejects.toThrow(
        "Rapid-MLX does not support streaming speech synthesis",
      );
      expect(mockClient.synthesizeStream).not.toHaveBeenCalled();
    });
  });

  describe("checkHealth", () => {
    it('returns "ready" with defaults when ping succeeds', async () => {
      const health = await provider.checkHealth();
      expect(health.status).toBe("ready");
      expect(health.providerId).toBe("rapid-mlx");
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
