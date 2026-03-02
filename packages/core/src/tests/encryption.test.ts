import * as crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createEncryption, parseEncryptionKey } from "../encryption.js";

const VALID_KEY = crypto.randomBytes(32);
const VALID_HEX_KEY = VALID_KEY.toString("hex");

describe("parseEncryptionKey", () => {
  it("converts a 64-character hex string to a 32-byte Buffer", () => {
    const result = parseEncryptionKey(VALID_HEX_KEY);
    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(32);
    expect(result.equals(VALID_KEY)).toBe(true);
  });

  it("throws when hex string is too short", () => {
    expect(() => parseEncryptionKey("abcd")).toThrow("64 hex characters");
  });

  it("throws when hex string is too long", () => {
    expect(() => parseEncryptionKey("a".repeat(128))).toThrow("128 characters");
  });

  it("throws when hex string is empty", () => {
    expect(() => parseEncryptionKey("")).toThrow("0 characters");
  });

  it("handles all-zero key", () => {
    const result = parseEncryptionKey("0".repeat(64));
    expect(result.length).toBe(32);
    expect(result.every((b) => b === 0)).toBe(true);
  });

  it("handles all-ff key", () => {
    const result = parseEncryptionKey("f".repeat(64));
    expect(result.length).toBe(32);
    expect(result.every((b) => b === 0xff)).toBe(true);
  });
});

describe("createEncryption", () => {
  describe("factory validation", () => {
    it("accepts a 32-byte key", () => {
      const service = createEncryption(VALID_KEY);
      expect(typeof service.encrypt).toBe("function");
      expect(typeof service.decrypt).toBe("function");
      expect(typeof service.validate).toBe("function");
    });

    it("throws for 16-byte key", () => {
      expect(() => createEncryption(crypto.randomBytes(16))).toThrow(
        "must be 32 bytes",
      );
    });

    it("throws for empty buffer", () => {
      expect(() => createEncryption(Buffer.alloc(0))).toThrow("got 0 bytes");
    });

    it("throws for 64-byte key", () => {
      expect(() => createEncryption(crypto.randomBytes(64))).toThrow(
        "got 64 bytes",
      );
    });
  });

  describe("encrypt", () => {
    const service = createEncryption(VALID_KEY);

    it("returns a string in v1:iv:authTag:data format", () => {
      const result = service.encrypt("hello");
      expect(result).toMatch(/^v1:[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
    });

    it("produces different ciphertext on each call (unique IV)", () => {
      const a = service.encrypt("same text");
      const b = service.encrypt("same text");
      expect(a).not.toBe(b);
    });

    it("encrypts empty string", () => {
      const result = service.encrypt("");
      expect(result).toMatch(/^v1:[0-9a-f]{32}:[0-9a-f]{32}:/);
    });

    it("encrypts string with unicode characters", () => {
      const result = service.encrypt("Caf\u00e9 \u{1F600}");
      expect(result).toMatch(/^v1:/);
    });

    it("encrypts very long string", () => {
      const result = service.encrypt("x".repeat(100_000));
      expect(result).toMatch(/^v1:/);
    });
  });

  describe("decrypt", () => {
    const service = createEncryption(VALID_KEY);

    it("decrypts a value encrypted by the same key", () => {
      expect(service.decrypt(service.encrypt("hello world"))).toBe(
        "hello world",
      );
    });

    it("returns null for empty string (encrypted data is empty hex)", () => {
      // encrypt("") produces v1:iv:tag: where the data segment is "",
      // and decrypt treats empty data as invalid format
      expect(service.decrypt(service.encrypt(""))).toBeNull();
    });

    it("roundtrips unicode content", () => {
      const text = "Caf\u00e9 \u{1F600} \u4F60\u597D";
      expect(service.decrypt(service.encrypt(text))).toBe(text);
    });

    it("roundtrips multi-line content", () => {
      const text = "line1\nline2\ttab\r\nwindows";
      expect(service.decrypt(service.encrypt(text))).toBe(text);
    });

    it("returns null for wrong version prefix", () => {
      const encrypted = service.encrypt("test");
      const tampered = encrypted.replace("v1:", "v2:");
      expect(service.decrypt(tampered)).toBeNull();
    });

    it("returns null for malformed input (too few parts)", () => {
      expect(service.decrypt("v1:abcd:efgh")).toBeNull();
    });

    it("returns null for malformed input (too many parts)", () => {
      expect(service.decrypt("v1:a:b:c:d")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(service.decrypt("")).toBeNull();
    });

    it("returns null for non-encrypted text", () => {
      expect(service.decrypt("plain text")).toBeNull();
    });

    it("returns null when auth tag is tampered", () => {
      const encrypted = service.encrypt("secret");
      const parts = encrypted.split(":");
      // Flip a character in the auth tag
      const tag = parts[2]!;
      parts[2] = (tag[0] === "a" ? "b" : "a") + tag.slice(1);
      expect(service.decrypt(parts.join(":"))).toBeNull();
    });

    it("returns null when ciphertext is tampered", () => {
      const encrypted = service.encrypt("secret");
      const parts = encrypted.split(":");
      const data = parts[3]!;
      parts[3] = (data[0] === "a" ? "b" : "a") + data.slice(1);
      expect(service.decrypt(parts.join(":"))).toBeNull();
    });

    it("returns null when IV is tampered", () => {
      const encrypted = service.encrypt("secret");
      const parts = encrypted.split(":");
      const iv = parts[1]!;
      parts[1] = (iv[0] === "a" ? "b" : "a") + iv.slice(1);
      expect(service.decrypt(parts.join(":"))).toBeNull();
    });

    it("returns null when decrypting with a different key", () => {
      const encrypted = service.encrypt("secret");
      const otherService = createEncryption(crypto.randomBytes(32));
      expect(otherService.decrypt(encrypted)).toBeNull();
    });
  });

  describe("decrypt with logger", () => {
    it("calls logger.error on decryption failure", () => {
      const logger = { error: vi.fn(), info: vi.fn() };
      const service = createEncryption(VALID_KEY, { logger });
      service.decrypt("invalid");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.any(String) }),
        expect.stringContaining("Decryption failed"),
      );
    });

    it("includes encrypted text length in error log", () => {
      const logger = { error: vi.fn(), info: vi.fn() };
      const service = createEncryption(VALID_KEY, { logger });
      service.decrypt("some-invalid-text");
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ encryptedTextLength: 17 }),
        expect.any(String),
      );
    });
  });

  describe("validate", () => {
    it("returns true when encryption is properly configured", () => {
      const service = createEncryption(VALID_KEY);
      expect(service.validate()).toBe(true);
    });

    it("calls logger.info on successful validation", () => {
      const logger = { error: vi.fn(), info: vi.fn() };
      const service = createEncryption(VALID_KEY, { logger });
      service.validate();
      expect(logger.info).toHaveBeenCalledWith(
        "Encryption service validation passed",
      );
    });
  });
});
