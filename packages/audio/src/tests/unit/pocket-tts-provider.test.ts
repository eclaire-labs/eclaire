import { beforeEach, describe, expect, it, vi } from "vitest";
import { PocketTtsProvider } from "../../pocket-tts-provider.js";
import { TEST_POCKET_TTS_CONFIG } from "../setup.js";

const mockClient = {
  synthesize: vi.fn(async () => Buffer.from("audio")),
  synthesizeStream: vi.fn(async () => new Response("stream")),
  ping: vi.fn(async () => true),
};

vi.mock("../../pocket-tts-client.js", () => ({
  PocketTtsClient: class {
    constructor() {
      Object.assign(this, mockClient);
    }
  },
}));

describe("PocketTtsProvider", () => {
  let provider: PocketTtsProvider;

  beforeEach(() => {
    for (const fn of Object.values(mockClient)) fn.mockClear();
    mockClient.ping.mockResolvedValue(true);
    provider = new PocketTtsProvider(TEST_POCKET_TTS_CONFIG);
  });

  describe("capabilities", () => {
    it('has providerId "pocket-tts"', () => {
      expect(provider.providerId).toBe("pocket-tts");
    });

    it("reports TTS only (with streaming)", () => {
      expect(provider.capabilities).toEqual({
        stt: false,
        tts: true,
        streamingStt: false,
        streamingTts: true,
      });
    });
  });

  describe("transcribe", () => {
    it("throws not supported", async () => {
      await expect(
        provider.transcribe({ file: Buffer.from("audio") }),
      ).rejects.toThrow("does not support speech-to-text");
    });
  });

  describe("synthesize", () => {
    it("uses defaultTtsVoice from config", async () => {
      await provider.synthesize({ text: "Hello" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ voice: "alba" }),
      );
    });

    it("uses explicit voice when provided", async () => {
      await provider.synthesize({ text: "Hello", voice: "marius" });
      expect(mockClient.synthesize).toHaveBeenCalledWith(
        expect.objectContaining({ voice: "marius" }),
      );
    });
  });

  describe("synthesizeStream", () => {
    it("delegates with voice from config", async () => {
      await provider.synthesizeStream({ text: "Hello" });
      expect(mockClient.synthesizeStream).toHaveBeenCalledWith(
        expect.objectContaining({ voice: "alba" }),
      );
    });
  });

  describe("checkHealth", () => {
    it('returns "ready" with TTS defaults when ping succeeds', async () => {
      const health = await provider.checkHealth();
      expect(health.status).toBe("ready");
      expect(health.defaults?.ttsVoice).toBe("alba");
    });

    it('returns "unavailable" when ping fails', async () => {
      mockClient.ping.mockResolvedValueOnce(false);
      const health = await provider.checkHealth();
      expect(health.status).toBe("unavailable");
    });
  });
});
