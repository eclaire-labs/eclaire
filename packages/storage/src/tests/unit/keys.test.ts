import { describe, expect, it } from "vitest";
import { StorageInvalidKeyError } from "../../core/errors.js";
import {
  assetPrefix,
  assertSafeKey,
  assertSafePrefix,
  buildKey,
  categoryPrefix,
  isSafeKey,
  isSafePrefix,
  isValidKey,
  isValidKeyComponent,
  parseKey,
  sanitizeKeyComponent,
  userPrefix,
} from "../../core/keys.js";

describe("buildKey", () => {
  it("builds a key from components", () => {
    expect(buildKey("user-123", "documents", "doc-456", "original.pdf")).toBe(
      "user-123/documents/doc-456/original.pdf",
    );
  });

  it("handles nested file names", () => {
    expect(buildKey("user-123", "bookmarks", "bm-789", "images/img1.jpg")).toBe(
      "user-123/bookmarks/bm-789/images/img1.jpg",
    );
  });
});

describe("parseKey", () => {
  it("parses a valid key", () => {
    const result = parseKey("user-123/documents/doc-456/original.pdf");
    expect(result).toEqual({
      userId: "user-123",
      category: "documents",
      assetId: "doc-456",
      fileName: "original.pdf",
    });
  });

  it("parses a key with nested file name", () => {
    const result = parseKey("user-123/bookmarks/bm-789/images/img1.jpg");
    expect(result).toEqual({
      userId: "user-123",
      category: "bookmarks",
      assetId: "bm-789",
      fileName: "images/img1.jpg",
    });
  });

  it("returns null for invalid key", () => {
    expect(parseKey("user-123/documents")).toBeNull();
    expect(parseKey("user-123")).toBeNull();
    expect(parseKey("")).toBeNull();
  });
});

describe("prefix builders", () => {
  it("builds asset prefix", () => {
    expect(assetPrefix("user-123", "documents", "doc-456")).toBe(
      "user-123/documents/doc-456/",
    );
  });

  it("builds category prefix", () => {
    expect(categoryPrefix("user-123", "documents")).toBe("user-123/documents/");
  });

  it("builds user prefix", () => {
    expect(userPrefix("user-123")).toBe("user-123/");
  });
});

describe("isSafeKey", () => {
  it("accepts any key structure without path traversal", () => {
    expect(isSafeKey("a")).toBe(true);
    expect(isSafeKey("a/b")).toBe(true);
    expect(isSafeKey("a/b/c")).toBe(true);
    expect(isSafeKey("user-123/documents/doc-456/original.pdf")).toBe(true);
    expect(isSafeKey("some-file.txt")).toBe(true);
  });

  it("rejects empty keys", () => {
    expect(isSafeKey("")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafeKey("/absolute/path")).toBe(false);
    expect(isSafeKey("\\backslash")).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(isSafeKey("a/../b")).toBe(false);
    expect(isSafeKey("..")).toBe(false);
    expect(isSafeKey("a/..")).toBe(false);
  });

  it("rejects empty segments", () => {
    expect(isSafeKey("a//b")).toBe(false);
    expect(isSafeKey("a/./b")).toBe(false);
  });
});

describe("isSafePrefix", () => {
  it("accepts valid prefixes", () => {
    expect(isSafePrefix("")).toBe(true); // empty = list all
    expect(isSafePrefix("user-123/")).toBe(true);
    expect(isSafePrefix("user-123/documents/")).toBe(true);
  });

  it("rejects path traversal", () => {
    expect(isSafePrefix("../")).toBe(false);
    expect(isSafePrefix("a/../b/")).toBe(false);
  });

  it("rejects absolute paths", () => {
    expect(isSafePrefix("/absolute/")).toBe(false);
  });
});

describe("assertSafeKey", () => {
  it("does not throw for safe keys", () => {
    expect(() => assertSafeKey("user-1/docs/doc-1/file.txt")).not.toThrow();
  });

  it("throws StorageInvalidKeyError for unsafe keys", () => {
    expect(() => assertSafeKey("../evil")).toThrow(StorageInvalidKeyError);
    expect(() => assertSafeKey("")).toThrow(StorageInvalidKeyError);
    expect(() => assertSafeKey("/absolute")).toThrow(StorageInvalidKeyError);
    expect(() => assertSafeKey("a//b")).toThrow(StorageInvalidKeyError);
  });
});

describe("assertSafePrefix", () => {
  it("does not throw for safe prefixes", () => {
    expect(() => assertSafePrefix("")).not.toThrow();
    expect(() => assertSafePrefix("user-1/")).not.toThrow();
  });

  it("throws StorageInvalidKeyError for unsafe prefixes", () => {
    expect(() => assertSafePrefix("../evil/")).toThrow(StorageInvalidKeyError);
    expect(() => assertSafePrefix("/absolute/")).toThrow(
      StorageInvalidKeyError,
    );
  });
});

describe("isValidKeyComponent", () => {
  it("accepts valid components", () => {
    expect(isValidKeyComponent("user-123")).toBe(true);
    expect(isValidKeyComponent("documents")).toBe(true);
    expect(isValidKeyComponent("file.pdf")).toBe(true);
  });

  it("rejects empty or special components", () => {
    expect(isValidKeyComponent("")).toBe(false);
    expect(isValidKeyComponent(".")).toBe(false);
    expect(isValidKeyComponent("..")).toBe(false);
  });

  it("rejects path traversal attempts", () => {
    expect(isValidKeyComponent("../foo")).toBe(false);
    expect(isValidKeyComponent("/absolute")).toBe(false);
    expect(isValidKeyComponent("foo/..")).toBe(false);
  });
});

describe("isValidKey", () => {
  it("accepts valid keys", () => {
    expect(isValidKey("user-123/documents/doc-456/original.pdf")).toBe(true);
    expect(isValidKey("user-123/photos/photo-789/images/thumb.jpg")).toBe(true);
  });

  it("rejects invalid keys", () => {
    expect(isValidKey("")).toBe(false);
    expect(isValidKey("/absolute/path")).toBe(false);
    expect(isValidKey("user-123/../secrets/file")).toBe(false);
    expect(isValidKey("user-123/documents")).toBe(false); // too short
  });
});

describe("sanitizeKeyComponent", () => {
  it("removes path traversal attempts", () => {
    expect(sanitizeKeyComponent("../foo")).toBe("foo");
    expect(sanitizeKeyComponent("foo/../bar")).toBe("foo/bar");
  });

  it("removes leading/trailing slashes", () => {
    expect(sanitizeKeyComponent("/foo/")).toBe("foo");
    expect(sanitizeKeyComponent("///foo///")).toBe("foo");
  });

  it("collapses multiple slashes", () => {
    expect(sanitizeKeyComponent("foo//bar")).toBe("foo/bar");
  });
});
