import { beforeEach, describe, expect, it, vi } from "vitest";
import { WhisperCppProvider } from "../../whisper-cpp-provider.js";
import { TEST_WHISPER_CPP_CONFIG } from "../setup.js";

const mockClient = {
  transcribe: vi.fn(async () => ({ text: "transcribed" })),
  ping: vi.fn(async () => true),
};

vi.mock("../../whisper-cpp-client.js", () => ({
  WhisperCppClient: class {
    constructor() {
      Object.assign(this, mockClient);
    }
  },
}));

vi.mock("../../mlx-client.js", () => ({
  readAudioFile: vi.fn((filePath: string) => ({
    file: Buffer.from("file-data"),
    fileName: filePath.split("/").pop() ?? "audio.wav",
  })),
}));

describe("WhisperCppProvider", () => {
  let provider: WhisperCppProvider;

  beforeEach(() => {
    for (const fn of Object.values(mockClient)) fn.mockClear();
    mockClient.ping.mockResolvedValue(true);
    provider = new WhisperCppProvider(TEST_WHISPER_CPP_CONFIG);
  });

  describe("capabilities", () => {
    it('has providerId "whisper-cpp"', () => {
      expect(provider.providerId).toBe("whisper-cpp");
    });

    it("reports STT only", () => {
      expect(provider.capabilities).toEqual({
        stt: true,
        tts: false,
        streamingStt: false,
        streamingTts: false,
      });
    });
  });

  describe("transcribe", () => {
    it("delegates to client with language", async () => {
      await provider.transcribe({ file: Buffer.from("audio"), language: "en" });
      expect(mockClient.transcribe).toHaveBeenCalledWith(
        expect.objectContaining({ language: "en" }),
      );
    });
  });

  describe("synthesize", () => {
    it("throws not supported", async () => {
      await expect(provider.synthesize({ text: "Hello" })).rejects.toThrow(
        "does not support text-to-speech",
      );
    });
  });

  describe("synthesizeStream", () => {
    it("throws not supported", async () => {
      await expect(
        provider.synthesizeStream({ text: "Hello" }),
      ).rejects.toThrow("does not support text-to-speech");
    });
  });

  describe("checkHealth", () => {
    it('returns "ready" when ping succeeds', async () => {
      const health = await provider.checkHealth();
      expect(health.status).toBe("ready");
      expect(health.providerId).toBe("whisper-cpp");
    });

    it('returns "unavailable" when ping returns false', async () => {
      mockClient.ping.mockResolvedValueOnce(false);
      const health = await provider.checkHealth();
      expect(health.status).toBe("unavailable");
    });
  });
});
