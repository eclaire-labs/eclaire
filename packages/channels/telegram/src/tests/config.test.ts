import { describe, expect, it, beforeEach, vi } from "vitest";
import { setDeps } from "../deps.js";
import { validateAndEncryptConfig, decryptConfig } from "../config.js";

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
    findChannel: vi.fn(),
    findChannelById: vi.fn(),
    findActiveChannels: vi.fn(),
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
      chat_identifier: "-1001234567890",
      bot_token: "123456:ABC-DEF",
    });

    expect(result).toEqual({
      chat_identifier: "-1001234567890",
      bot_token: "encrypted:123456:ABC-DEF",
    });
    expect(mockEncrypt).toHaveBeenCalledWith("123456:ABC-DEF");
  });

  it("throws on missing chat_identifier", () => {
    expect(() =>
      validateAndEncryptConfig({
        bot_token: "123456:ABC-DEF",
      }),
    ).toThrow();
  });

  it("throws on missing bot_token", () => {
    expect(() =>
      validateAndEncryptConfig({
        chat_identifier: "-1001234567890",
      }),
    ).toThrow();
  });

  it("throws on empty chat_identifier", () => {
    expect(() =>
      validateAndEncryptConfig({
        chat_identifier: "",
        bot_token: "123456:ABC-DEF",
      }),
    ).toThrow();
  });

  it("throws on empty bot_token", () => {
    expect(() =>
      validateAndEncryptConfig({
        chat_identifier: "-1001234567890",
        bot_token: "",
      }),
    ).toThrow();
  });

  it("rejects extra fields (strict mode)", () => {
    expect(() =>
      validateAndEncryptConfig({
        chat_identifier: "-1001234567890",
        bot_token: "123456:ABC-DEF",
        extra_field: "should fail",
      }),
    ).toThrow();
  });
});

describe("decryptConfig", () => {
  it("decrypts a valid stored config", () => {
    const result = decryptConfig({
      chat_identifier: "-1001234567890",
      bot_token: "encrypted:123456:ABC-DEF",
    });

    expect(result).toEqual({
      chat_identifier: "-1001234567890",
      bot_token: "123456:ABC-DEF",
    });
    expect(mockDecrypt).toHaveBeenCalledWith("encrypted:123456:ABC-DEF");
  });

  it("returns null for null config", () => {
    expect(decryptConfig(null)).toBeNull();
  });

  it("returns null for non-object config", () => {
    expect(decryptConfig("string")).toBeNull();
  });

  it("returns null for missing fields", () => {
    expect(decryptConfig({ chat_identifier: "-1001234567890" })).toBeNull();
    expect(decryptConfig({ bot_token: "encrypted:token" })).toBeNull();
  });

  it("returns null when decrypt throws", () => {
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });

    const result = decryptConfig({
      chat_identifier: "-1001234567890",
      bot_token: "encrypted:bad-token",
    });

    expect(result).toBeNull();
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
