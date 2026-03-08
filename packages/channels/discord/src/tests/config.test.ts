import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptConfig, validateAndEncryptConfig } from "../config.js";
import { setDeps } from "../deps.js";

const mockEncrypt = vi.fn((v: string) => `encrypted:${v}`);
const mockDecrypt = vi.fn((v: string) =>
  v.startsWith("encrypted:") ? v.replace("encrypted:", "") : v,
);

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  setDeps({
    db: {} as never,
    schema: {} as never,
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
    processPromptRequest: vi.fn(),
    recordHistory: vi.fn(),
    logger: mockLogger,
  });
});

describe("validateAndEncryptConfig", () => {
  it("validates and encrypts a valid config", () => {
    const result = validateAndEncryptConfig({
      channel_id: "1234567890123456789",
      bot_token: "MTIzNDU2.AbCdEf.GhIjKl",
    });

    expect(result).toEqual({
      channel_id: "1234567890123456789",
      bot_token: "encrypted:MTIzNDU2.AbCdEf.GhIjKl",
      mention_mode: "all",
      voice_mode: "both",
      stt_enabled: true,
    });
    expect(mockEncrypt).toHaveBeenCalledWith("MTIzNDU2.AbCdEf.GhIjKl");
  });

  it("applies default values", () => {
    const result = validateAndEncryptConfig({
      channel_id: "123",
      bot_token: "token",
    });

    expect(result.mention_mode).toBe("all");
    expect(result.voice_mode).toBe("both");
    expect(result.stt_enabled).toBe(true);
  });

  it("accepts optional voice_channel_id", () => {
    const result = validateAndEncryptConfig({
      channel_id: "123",
      bot_token: "token",
      voice_channel_id: "456",
    });

    expect(result.voice_channel_id).toBe("456");
  });

  it("omits voice_channel_id when not provided", () => {
    const result = validateAndEncryptConfig({
      channel_id: "123",
      bot_token: "token",
    });

    expect(result).not.toHaveProperty("voice_channel_id");
  });

  it("accepts each valid mention_mode", () => {
    for (const mode of ["all", "mention_only", "mention_or_reply"]) {
      const result = validateAndEncryptConfig({
        channel_id: "123",
        bot_token: "token",
        mention_mode: mode,
      });
      expect(result.mention_mode).toBe(mode);
    }
  });

  it("throws on missing channel_id", () => {
    expect(() => validateAndEncryptConfig({ bot_token: "token" })).toThrow();
  });

  it("throws on missing bot_token", () => {
    expect(() => validateAndEncryptConfig({ channel_id: "123" })).toThrow();
  });

  it("throws on empty channel_id", () => {
    expect(() =>
      validateAndEncryptConfig({ channel_id: "", bot_token: "token" }),
    ).toThrow();
  });

  it("throws on empty bot_token", () => {
    expect(() =>
      validateAndEncryptConfig({ channel_id: "123", bot_token: "" }),
    ).toThrow();
  });

  it("rejects extra fields (strict mode)", () => {
    expect(() =>
      validateAndEncryptConfig({
        channel_id: "123",
        bot_token: "token",
        extra_field: "should fail",
      }),
    ).toThrow();
  });
});

describe("decryptConfig", () => {
  it("decrypts a valid stored config", () => {
    const result = decryptConfig({
      channel_id: "123",
      bot_token: "encrypted:my-token",
      mention_mode: "mention_only",
      voice_mode: "listen",
      stt_enabled: false,
    });

    expect(result).toEqual({
      channel_id: "123",
      bot_token: "my-token",
      mention_mode: "mention_only",
      voice_channel_id: undefined,
      voice_mode: "listen",
      stt_enabled: false,
    });
    expect(mockDecrypt).toHaveBeenCalledWith("encrypted:my-token");
  });

  it("returns null for null config", () => {
    expect(decryptConfig(null)).toBeNull();
  });

  it("returns null for non-object config", () => {
    expect(decryptConfig("string")).toBeNull();
    expect(decryptConfig(42)).toBeNull();
  });

  it("returns null for missing fields", () => {
    expect(decryptConfig({ channel_id: "123" })).toBeNull();
    expect(decryptConfig({ bot_token: "encrypted:token" })).toBeNull();
  });

  it("returns null when decrypt returns empty string", () => {
    mockDecrypt.mockReturnValueOnce("");

    const result = decryptConfig({
      channel_id: "123",
      bot_token: "encrypted:bad",
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("returns null when decrypt throws", () => {
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });

    const result = decryptConfig({
      channel_id: "123",
      bot_token: "encrypted:bad-token",
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it("applies defaults for missing optional fields", () => {
    const result = decryptConfig({
      channel_id: "123",
      bot_token: "encrypted:token",
    });

    expect(result?.mention_mode).toBe("all");
    expect(result?.voice_mode).toBe("both");
    expect(result?.stt_enabled).toBe(true);
  });
});
