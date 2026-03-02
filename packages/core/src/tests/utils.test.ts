import { describe, expect, it } from "vitest";
import {
  formatRequiredTimestamp,
  formatToISO8601,
  getErrorMessage,
  getMimeTypeFromExtension,
  getMimeTypeWithDefault,
  isValidUrl,
} from "../utils.js";

describe("getErrorMessage", () => {
  it("extracts message from Error object", () => {
    expect(getErrorMessage(new Error("test"))).toBe("test");
  });

  it("extracts message from Error subclass", () => {
    expect(getErrorMessage(new TypeError("type err"))).toBe("type err");
  });

  it("converts string to string", () => {
    expect(getErrorMessage("string error")).toBe("string error");
  });

  it("converts number to string", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("returns 'Unknown error' for null", () => {
    expect(getErrorMessage(null)).toBe("Unknown error");
  });

  it("returns 'Unknown error' for undefined", () => {
    expect(getErrorMessage(undefined)).toBe("Unknown error");
  });

  it("converts boolean false to string", () => {
    expect(getErrorMessage(false)).toBe("false");
  });

  it("converts empty string to empty string", () => {
    expect(getErrorMessage("")).toBe("");
  });
});

describe("getMimeTypeFromExtension", () => {
  it("returns correct MIME type for common image extensions", () => {
    expect(getMimeTypeFromExtension("photo.jpg")).toBe("image/jpeg");
    expect(getMimeTypeFromExtension("photo.png")).toBe("image/png");
    expect(getMimeTypeFromExtension("photo.webp")).toBe("image/webp");
  });

  it("returns correct MIME type for document extensions", () => {
    expect(getMimeTypeFromExtension("file.pdf")).toBe("application/pdf");
    expect(getMimeTypeFromExtension("file.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
  });

  it("returns correct MIME type for audio/video", () => {
    expect(getMimeTypeFromExtension("song.mp3")).toBe("audio/mpeg");
    expect(getMimeTypeFromExtension("video.mp4")).toBe("video/mp4");
  });

  it("handles full file paths", () => {
    expect(getMimeTypeFromExtension("/path/to/file.pdf")).toBe(
      "application/pdf",
    );
  });

  it("handles filenames with multiple dots", () => {
    expect(getMimeTypeFromExtension("archive.2024.01.zip")).toBe(
      "application/zip",
    );
  });

  it("is case insensitive", () => {
    expect(getMimeTypeFromExtension("FILE.JPG")).toBe("image/jpeg");
    expect(getMimeTypeFromExtension("doc.PDF")).toBe("application/pdf");
  });

  it("returns undefined for unknown extension", () => {
    expect(getMimeTypeFromExtension("file.xyz")).toBeUndefined();
  });

  it("returns undefined for file with no extension", () => {
    expect(getMimeTypeFromExtension("README")).toBeUndefined();
  });

  it("returns undefined for null input", () => {
    expect(getMimeTypeFromExtension(null)).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(getMimeTypeFromExtension(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(getMimeTypeFromExtension("")).toBeUndefined();
  });

  it("handles .jpeg and .jpg both mapping to image/jpeg", () => {
    expect(getMimeTypeFromExtension("a.jpeg")).toBe(
      getMimeTypeFromExtension("a.jpg"),
    );
  });

  it("handles .tif and .tiff both mapping to image/tiff", () => {
    expect(getMimeTypeFromExtension("a.tif")).toBe(
      getMimeTypeFromExtension("a.tiff"),
    );
  });

  it("handles .htm and .html both mapping to text/html", () => {
    expect(getMimeTypeFromExtension("a.htm")).toBe(
      getMimeTypeFromExtension("a.html"),
    );
  });
});

describe("getMimeTypeWithDefault", () => {
  it("returns MIME type when extension is known", () => {
    expect(getMimeTypeWithDefault("file.pdf")).toBe("application/pdf");
  });

  it("returns default for unknown extension", () => {
    expect(getMimeTypeWithDefault("file.xyz")).toBe("application/octet-stream");
  });

  it("returns custom default when provided", () => {
    expect(getMimeTypeWithDefault("file.xyz", "text/plain")).toBe("text/plain");
  });

  it("returns default for null input", () => {
    expect(getMimeTypeWithDefault(null)).toBe("application/octet-stream");
  });

  it("returns default for undefined input", () => {
    expect(getMimeTypeWithDefault(undefined)).toBe("application/octet-stream");
  });
});

describe("isValidUrl", () => {
  it("accepts https URL", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
  });

  it("accepts http URL", () => {
    expect(isValidUrl("http://example.com")).toBe(true);
  });

  it("accepts URL with path and query", () => {
    expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
  });

  it("accepts URL with port", () => {
    expect(isValidUrl("https://localhost:3000")).toBe(true);
  });

  it("rejects plain string", () => {
    expect(isValidUrl("not a url")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidUrl("")).toBe(false);
  });

  it("rejects relative path", () => {
    expect(isValidUrl("/path/to/resource")).toBe(false);
  });
});

describe("formatToISO8601", () => {
  it("formats Date object to ISO 8601", () => {
    expect(formatToISO8601(new Date("2024-01-15T10:30:00Z"))).toBe(
      "2024-01-15T10:30:00.000Z",
    );
  });

  it("formats number (epoch milliseconds) to ISO 8601", () => {
    expect(formatToISO8601(0)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("formats valid date string to ISO 8601", () => {
    const result = formatToISO8601("2024-06-15");
    expect(result).not.toBeNull();
    expect(result!.startsWith("2024-06-15")).toBe(true);
  });

  it("returns null for null input", () => {
    expect(formatToISO8601(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(formatToISO8601(undefined)).toBeNull();
  });

  it("returns null for invalid date string", () => {
    expect(formatToISO8601("not-a-date")).toBeNull();
  });

  it("returns null for Invalid Date object", () => {
    expect(formatToISO8601(new Date("invalid"))).toBeNull();
  });

  it("returns null for NaN", () => {
    expect(formatToISO8601(Number.NaN)).toBeNull();
  });

  it("handles negative epoch (before 1970)", () => {
    expect(formatToISO8601(-86400000)).toBe("1969-12-31T00:00:00.000Z");
  });
});

describe("formatRequiredTimestamp", () => {
  it("formats valid Date to ISO 8601", () => {
    const result = formatRequiredTimestamp(new Date("2024-01-15T10:30:00Z"));
    expect(result).toBe("2024-01-15T10:30:00.000Z");
  });

  it("formats valid epoch number", () => {
    expect(formatRequiredTimestamp(0)).toBe("1970-01-01T00:00:00.000Z");
  });

  it("throws for invalid date string", () => {
    expect(() => formatRequiredTimestamp("invalid")).toThrow(
      "Invalid required timestamp",
    );
  });

  it("throws for NaN", () => {
    expect(() => formatRequiredTimestamp(Number.NaN)).toThrow(
      "Invalid required timestamp",
    );
  });

  it("includes the invalid value in the error message", () => {
    expect(() => formatRequiredTimestamp("bad-date")).toThrow("bad-date");
  });
});
