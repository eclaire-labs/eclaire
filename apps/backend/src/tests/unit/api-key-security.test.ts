import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/index.js", () => ({
  config: {
    security: {
      apiKeyHmacVersion: "1",
      apiKeyHmacKeyV1: "test-hmac-pepper-key-for-unit-tests",
    },
  },
}));

import {
  formatApiKeyForDisplay,
  generateFullApiKey,
  hmacBase64,
  parseApiKey,
  verifyApiKeyHash,
} from "../../lib/api-key-security.js";

describe("parseApiKey", () => {
  it("parses a valid key into keyId and secret", () => {
    const key = "sk-ABCDEFghij12345-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef";
    const result = parseApiKey(key);
    expect(result).toEqual({
      keyId: "ABCDEFghij12345",
      secret: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
    });
  });

  it("returns null for missing sk- prefix", () => {
    expect(
      parseApiKey("xx-ABCDEFghij12345-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"),
    ).toBeNull();
  });

  it("returns null for wrong keyId length (too short)", () => {
    expect(parseApiKey("sk-short-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")).toBeNull();
  });

  it("returns null for wrong keyId length (too long)", () => {
    expect(
      parseApiKey("sk-ABCDEFghij123456-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"),
    ).toBeNull();
  });

  it("returns null for wrong secret length (too short)", () => {
    expect(parseApiKey("sk-ABCDEFghij12345-short")).toBeNull();
  });

  it("returns null for wrong secret length (too long)", () => {
    expect(
      parseApiKey("sk-ABCDEFghij12345-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefX"),
    ).toBeNull();
  });

  it("returns null for invalid characters in keyId", () => {
    expect(
      parseApiKey("sk-ABCDEF_hij12345-ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"),
    ).toBeNull();
  });

  it("returns null for invalid characters in secret", () => {
    expect(
      parseApiKey("sk-ABCDEFghij12345-ABCDEFGHIJKLMNOPQRSTUV!XYZabcde"),
    ).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseApiKey("")).toBeNull();
  });

  it("returns null for random non-matching string", () => {
    expect(parseApiKey("not-an-api-key-at-all")).toBeNull();
  });
});

describe("generateFullApiKey", () => {
  it("returns an object with all required fields", () => {
    const result = generateFullApiKey();
    expect(result).toHaveProperty("fullKey");
    expect(result).toHaveProperty("keyId");
    expect(result).toHaveProperty("hash");
    expect(result).toHaveProperty("hashVersion");
    expect(result).toHaveProperty("suffix");
  });

  it("fullKey matches expected format", () => {
    const { fullKey } = generateFullApiKey();
    expect(fullKey).toMatch(/^sk-[A-Za-z0-9]{15}-[A-Za-z0-9]{32}$/);
  });

  it("suffix is the last 4 characters of the secret", () => {
    const { fullKey, suffix } = generateFullApiKey();
    const secret = fullKey.split("-").slice(2).join("-");
    expect(suffix).toBe(secret.slice(-4));
  });

  it("hashVersion is 1", () => {
    const { hashVersion } = generateFullApiKey();
    expect(hashVersion).toBe(1);
  });

  it("hash is non-empty base64", () => {
    const { hash } = generateFullApiKey();
    expect(hash.length).toBeGreaterThan(0);
    expect(() => Buffer.from(hash, "base64")).not.toThrow();
  });

  it("successive calls produce unique keys", () => {
    const a = generateFullApiKey();
    const b = generateFullApiKey();
    expect(a.fullKey).not.toBe(b.fullKey);
    expect(a.keyId).not.toBe(b.keyId);
    expect(a.hash).not.toBe(b.hash);
  });

  it("keyId can be parsed back from fullKey", () => {
    const { fullKey, keyId } = generateFullApiKey();
    const parsed = parseApiKey(fullKey);
    expect(parsed).not.toBeNull();
    expect(parsed!.keyId).toBe(keyId);
  });
});

describe("verifyApiKeyHash", () => {
  it("returns true for a roundtrip generate-then-verify", () => {
    const { fullKey, hash, hashVersion } = generateFullApiKey();
    expect(verifyApiKeyHash(fullKey, hash, hashVersion)).toBe(true);
  });

  it("returns false for a different key against the same hash", () => {
    const { hash, hashVersion } = generateFullApiKey();
    const { fullKey: otherKey } = generateFullApiKey();
    expect(verifyApiKeyHash(otherKey, hash, hashVersion)).toBe(false);
  });

  it("returns false for unsupported hash version", () => {
    const { fullKey, hash } = generateFullApiKey();
    expect(verifyApiKeyHash(fullKey, hash, 2)).toBe(false);
    expect(verifyApiKeyHash(fullKey, hash, 0)).toBe(false);
  });

  it("returns false for tampered hash", () => {
    const { fullKey, hashVersion } = generateFullApiKey();
    expect(verifyApiKeyHash(fullKey, "tampered-hash-value", hashVersion)).toBe(
      false,
    );
  });
});

describe("formatApiKeyForDisplay", () => {
  it("formats as sk-{keyId}-****{suffix}", () => {
    const result = formatApiKeyForDisplay("ABCDEFghij12345", "cdef");
    expect(result).toBe("sk-ABCDEFghij12345-****cdef");
  });

  it("roundtrips with generated key data", () => {
    const { keyId, suffix } = generateFullApiKey();
    const display = formatApiKeyForDisplay(keyId, suffix);
    expect(display).toMatch(/^sk-[A-Za-z0-9]{15}-\*{4}[A-Za-z0-9]{4}$/);
    expect(display).toContain(keyId);
    expect(display).toContain(suffix);
  });
});

describe("hmacBase64", () => {
  it("is deterministic for the same inputs", () => {
    const a = hmacBase64("test-secret", "test-key");
    const b = hmacBase64("test-secret", "test-key");
    expect(a).toBe(b);
  });

  it("produces different output for different secrets", () => {
    const a = hmacBase64("secret-a", "test-key");
    const b = hmacBase64("secret-b", "test-key");
    expect(a).not.toBe(b);
  });

  it("produces different output for different keys", () => {
    const a = hmacBase64("test-secret", "key-a");
    const b = hmacBase64("test-secret", "key-b");
    expect(a).not.toBe(b);
  });

  it("output is valid base64", () => {
    const result = hmacBase64("test-secret", "test-key");
    const decoded = Buffer.from(result, "base64");
    expect(decoded.length).toBe(32); // SHA-256 produces 32 bytes
  });
});
