import { describe, it, expect } from "vitest";
import {
  buildKey,
  parseKey,
  assetPrefix,
  categoryPrefix,
  userPrefix,
  isValidKey,
  isValidKeyComponent,
  sanitizeKeyComponent,
} from "../core/keys.js";

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
