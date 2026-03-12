import { describe, it, expect, beforeEach } from "vitest";
import { setDeps } from "../deps.js";
import { validateAndEncryptConfig, decryptConfig } from "../config.js";

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

// Simple mock encrypt/decrypt that reverses the string
const mockEncrypt = (value: string) => `enc:${value}`;
const mockDecrypt = (value: string) =>
  value.startsWith("enc:") ? value.slice(4) : value;

beforeEach(() => {
  setDeps({
    findChannel: async () => null,
    findChannelById: async () => null,
    findActiveChannels: async () => [],
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
    processPromptRequest: async () => ({}),
    recordHistory: async () => {},
    logger: mockLogger,
  });
});

describe("validateAndEncryptConfig", () => {
  it("validates and encrypts a valid config", () => {
    const result = validateAndEncryptConfig({
      bot_token: "xoxb-test-token",
      app_token: "xapp-test-token",
      channel_id: "C1234567890",
    });

    expect(result.channel_id).toBe("C1234567890");
    expect(result.bot_token).toBe("enc:xoxb-test-token");
    expect(result.app_token).toBe("enc:xapp-test-token");
    expect(result.mention_mode).toBe("all");
  });

  it("accepts custom mention_mode", () => {
    const result = validateAndEncryptConfig({
      bot_token: "xoxb-test-token",
      app_token: "xapp-test-token",
      channel_id: "C1234567890",
      mention_mode: "mention_only",
    });

    expect(result.mention_mode).toBe("mention_only");
  });

  it("throws on missing required fields", () => {
    expect(() => validateAndEncryptConfig({})).toThrow();
    expect(() =>
      validateAndEncryptConfig({ bot_token: "xoxb-test" }),
    ).toThrow();
    expect(() =>
      validateAndEncryptConfig({ bot_token: "xoxb-test", channel_id: "C123" }),
    ).toThrow();
  });

  it("throws on empty required fields", () => {
    expect(() =>
      validateAndEncryptConfig({
        bot_token: "",
        app_token: "xapp-test",
        channel_id: "C123",
      }),
    ).toThrow();
  });
});

describe("decryptConfig", () => {
  it("decrypts a valid stored config", () => {
    const stored = {
      channel_id: "C1234567890",
      bot_token: "enc:xoxb-test-token",
      app_token: "enc:xapp-test-token",
      mention_mode: "mention_only",
    };

    const result = decryptConfig(stored);

    expect(result).not.toBeNull();
    expect(result!.channel_id).toBe("C1234567890");
    expect(result!.bot_token).toBe("xoxb-test-token");
    expect(result!.app_token).toBe("xapp-test-token");
    expect(result!.mention_mode).toBe("mention_only");
  });

  it("defaults mention_mode to 'all'", () => {
    const stored = {
      channel_id: "C123",
      bot_token: "enc:xoxb-test",
      app_token: "enc:xapp-test",
    };

    const result = decryptConfig(stored);
    expect(result!.mention_mode).toBe("all");
  });

  it("returns null for non-object input", () => {
    expect(decryptConfig(null)).toBeNull();
    expect(decryptConfig(undefined)).toBeNull();
    expect(decryptConfig("string")).toBeNull();
  });

  it("returns null for missing required fields", () => {
    expect(decryptConfig({ channel_id: "C123" })).toBeNull();
    expect(
      decryptConfig({ channel_id: "C123", bot_token: "enc:tok" }),
    ).toBeNull();
  });
});
