import { beforeEach, describe, expect, it, vi } from "vitest";
import { ElevenLabsProvider } from "../../elevenlabs-provider.js";
import { TEST_ELEVENLABS_CONFIG } from "../setup.js";

const mockClient = {
  transcribe: vi.fn(async () => ({ text: "transcribed" })),
  synthesize: vi.fn(async () => Buffer.from("audio")),
  synthesizeStream: vi.fn(async () => new Response("stream")),
  checkSubscription: vi.fn(async () => true),
};

const mockReadAudioFile = vi.fn((filePath: string) => ({
  file: Buffer.from("file-data"),
  fileName: filePath.split("/").pop() ?? "audio.wav",
}));

vi.mock("../../elevenlabs-client.js", () => ({
  ElevenLabsClient: class {
    constructor() {
      Object.assign(this, mockClient);
    }
  },
}));

vi.mock("../../mlx-client.js", () => ({
  readAudioFile: (...args: unknown[]) =>
    mockReadAudioFile(...(args as [string])),
}));

describe("ElevenLabsProvider", () => {
  let provider: ElevenLabsProvider;

  beforeEach(() => {
    for (const fn of Object.values(mockClient)) fn.mockClear();
    mockClient.checkSubscription.mockResolvedValue(true);
    mockReadAudioFile.mockClear();
    provider = new ElevenLabsProvider(TEST_ELEVENLABS_CONFIG);
  });

  // ---------------------------------------------------------------------------
  // capabilities
  // ---------------------------------------------------------------------------

  describe("capabilities", () => {
    it('has providerId "elevenlabs"', () => {
      expect(provider.providerId).toBe("elevenlabs");
    });

    it("reports correct capabilities", () => {
      expect(provider.capabilities).toEqual({
        stt: true,
        tts: true,
        streamingStt: false,
        streamingTts: true,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // transcribe
  // ---------------------------------------------------------------------------

  describe("transcribe", () => {
    it("uses defaultSttModel from config", async () => {
      await provider.transcribe({ file: Buffer.from("audio") });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ model: "scribe_v1" }),
      );
    });

    it("reads file from path when input.file is a string", async () => {
      await provider.transcribe({ file: "/path/to/audio.wav" });
      expect(mockReadAudioFile).toHaveBeenCalledWith("/path/to/audio.wav");
    });

    it("uses Buffer directly when input.file is a Buffer", async () => {
      const buf = Buffer.from("audio-data");
      await provider.transcribe({ file: buf });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ file: buf }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesize
  // ---------------------------------------------------------------------------

  describe("synthesize", () => {
    it('maps "mp3" to "mp3_44100_128" for ElevenLabs API', async () => {
      await provider.synthesize({ text: "Hello", format: "mp3" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat: "mp3_44100_128" }),
      );
    });

    it('maps "wav" to "pcm_16000" for ElevenLabs API', async () => {
      await provider.synthesize({ text: "Hello", format: "wav" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat: "pcm_16000" }),
      );
    });

    it('defaults format to "mp3" -> "mp3_44100_128"', async () => {
      await provider.synthesize({ text: "Hello" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat: "mp3_44100_128" }),
      );
    });

    it("throws if no voice ID configured and none provided", async () => {
      const noVoiceConfig = { ...TEST_ELEVENLABS_CONFIG, defaultTtsVoice: "" };
      const p = new ElevenLabsProvider(noVoiceConfig);
      await expect(p.synthesize({ text: "Hello" })).rejects.toThrow(
        "requires a voice ID",
      );
    });

    it("passes speed through to client", async () => {
      await provider.synthesize({ text: "Hello", speed: 0.8 });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ speed: 0.8 }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // synthesizeStream
  // ---------------------------------------------------------------------------

  describe("synthesizeStream", () => {
    it('defaults format to "wav" -> "pcm_16000"', async () => {
      await provider.synthesizeStream({ text: "Hello" });
      expect(mockClient.synthesizeStream).toHaveBeenCalledWith(
        expect.objectContaining({ outputFormat: "pcm_16000" }),
      );
    });

    it("throws if no voice ID", async () => {
      const noVoiceConfig = { ...TEST_ELEVENLABS_CONFIG, defaultTtsVoice: "" };
      const p = new ElevenLabsProvider(noVoiceConfig);
      await expect(p.synthesizeStream({ text: "Hello" })).rejects.toThrow(
        "requires a voice ID",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // checkHealth
  // ---------------------------------------------------------------------------

  describe("checkHealth", () => {
    it('returns "ready" with defaults on valid subscription', async () => {
      const health = await provider.checkHealth();
      expect(health.status).toBe("ready");
      expect(health.defaults).toEqual({
        sttModel: "scribe_v1",
        ttsModel: "eleven_multilingual_v2",
        ttsVoice: "test-voice-id",
      });
    });

    it('returns "unavailable" on invalid subscription', async () => {
      mockClient.checkSubscription.mockResolvedValueOnce(false);
      const health = await provider.checkHealth();
      expect(health.status).toBe("unavailable");
    });

    it('returns "unavailable" when check throws', async () => {
      mockClient.checkSubscription.mockRejectedValueOnce(new Error("network"));
      const health = await provider.checkHealth();
      expect(health.status).toBe("unavailable");
    });
  });
});
