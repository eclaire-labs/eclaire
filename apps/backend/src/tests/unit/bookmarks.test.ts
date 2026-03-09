import { describe, expect, it } from "vitest";
import {
  type ChromeBookmarkItem,
  convertChromeTimestamp,
  extractBookmarksFromFolder,
  mapApiRequestToDbFields,
  mapBookmarkToApiResponse,
  normalizeBookmarkUrl,
  validateAndNormalizeBookmarkUrl,
} from "../../lib/services/bookmarks.js";
import { getMimeTypeFromStorageId } from "../../lib/services/mime-utils.js";

// --- normalizeBookmarkUrl ---

describe("normalizeBookmarkUrl", () => {
  it("should return URL as-is when it has https://", () => {
    expect(normalizeBookmarkUrl("https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("should return URL as-is when it has http://", () => {
    expect(normalizeBookmarkUrl("http://example.com")).toBe(
      "http://example.com",
    );
  });

  it("should add https:// when no protocol is present", () => {
    expect(normalizeBookmarkUrl("example.com")).toBe("https://example.com");
  });

  it("should trim whitespace", () => {
    expect(normalizeBookmarkUrl("  https://example.com  ")).toBe(
      "https://example.com",
    );
  });

  it("should handle URL with path and query", () => {
    expect(normalizeBookmarkUrl("example.com/path?q=1")).toBe(
      "https://example.com/path?q=1",
    );
  });

  it("should be case-insensitive for protocol detection", () => {
    expect(normalizeBookmarkUrl("HTTPS://example.com")).toBe(
      "HTTPS://example.com",
    );
    expect(normalizeBookmarkUrl("HTTP://example.com")).toBe(
      "HTTP://example.com",
    );
  });
});

// --- validateAndNormalizeBookmarkUrl ---

describe("validateAndNormalizeBookmarkUrl", () => {
  it("should return valid for a proper URL", () => {
    const result = validateAndNormalizeBookmarkUrl("https://example.com");
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe("https://example.com");
    expect(result.error).toBeUndefined();
  });

  it("should normalize URL without protocol and validate", () => {
    const result = validateAndNormalizeBookmarkUrl("example.com");
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe("https://example.com");
  });

  it("should return invalid for null", () => {
    const result = validateAndNormalizeBookmarkUrl(null);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("A valid URL is required.");
  });

  it("should return invalid for undefined", () => {
    const result = validateAndNormalizeBookmarkUrl(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("A valid URL is required.");
  });

  it("should return invalid for empty string", () => {
    const result = validateAndNormalizeBookmarkUrl("");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("A valid URL is required.");
  });

  it("should return invalid for whitespace-only string", () => {
    const result = validateAndNormalizeBookmarkUrl("   ");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("A valid URL is required.");
  });

  it("should return invalid for non-URL strings", () => {
    const result = validateAndNormalizeBookmarkUrl("not a url at all");
    expect(result.valid).toBe(false);
    expect(result.error).toBe("A valid URL is required.");
  });

  it("should validate URL with path", () => {
    const result = validateAndNormalizeBookmarkUrl(
      "https://example.com/path/to/page",
    );
    expect(result.valid).toBe(true);
    expect(result.normalizedUrl).toBe("https://example.com/path/to/page");
  });
});

// --- getMimeTypeFromStorageId ---

describe("getMimeTypeFromStorageId", () => {
  it("should return image/svg+xml for .svg files", () => {
    expect(getMimeTypeFromStorageId("favicon.svg")).toBe("image/svg+xml");
  });

  it("should return image/png for .png files", () => {
    expect(getMimeTypeFromStorageId("screenshot.png")).toBe("image/png");
  });

  it("should return image/jpeg for .jpg files", () => {
    expect(getMimeTypeFromStorageId("photo.jpg")).toBe("image/jpeg");
  });

  it("should return image/jpeg for .jpeg files", () => {
    expect(getMimeTypeFromStorageId("photo.jpeg")).toBe("image/jpeg");
  });

  it("should return image/gif for .gif files", () => {
    expect(getMimeTypeFromStorageId("animation.gif")).toBe("image/gif");
  });

  it("should return image/x-icon for .ico files", () => {
    expect(getMimeTypeFromStorageId("favicon.ico")).toBe("image/x-icon");
  });

  it("should return image/x-icon for extensionless files (fallback)", () => {
    expect(getMimeTypeFromStorageId("favicon")).toBe("image/x-icon");
  });

  it("should be case-insensitive", () => {
    expect(getMimeTypeFromStorageId("favicon.SVG")).toBe("image/svg+xml");
    expect(getMimeTypeFromStorageId("photo.JPG")).toBe("image/jpeg");
    expect(getMimeTypeFromStorageId("image.PNG")).toBe("image/png");
  });

  it("should handle paths with directories", () => {
    expect(getMimeTypeFromStorageId("user1/bookmarks/bm-123/favicon.png")).toBe(
      "image/png",
    );
  });
});

// --- mapBookmarkToApiResponse ---

describe("mapBookmarkToApiResponse", () => {
  it("should map originalUrl to url", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    });
    expect(result.url).toBe("https://example.com");
    expect(result.originalUrl).toBeUndefined();
  });

  it("should convert timestamps to ISO8601", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      createdAt: new Date("2025-06-15T12:30:00Z"),
      updatedAt: new Date("2025-06-15T12:30:00Z"),
    });
    expect(result.createdAt).toBe("2025-06-15T12:30:00.000Z");
    expect(result.updatedAt).toBe("2025-06-15T12:30:00.000Z");
  });

  it("should generate asset URLs from storage IDs", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
      faviconStorageId: "user1/bookmarks/bm-test123/favicon.png",
      screenshotDesktopStorageId: "user1/bookmarks/bm-test123/screenshot.jpg",
      pdfStorageId: "user1/bookmarks/bm-test123/page.pdf",
      extractedMdStorageId: "user1/bookmarks/bm-test123/extracted.md",
    });
    expect(result.faviconUrl).toBe("/api/bookmarks/bm-test123/favicon");
    expect(result.screenshotUrl).toBe("/api/bookmarks/bm-test123/screenshot");
    expect(result.pdfUrl).toBe("/api/bookmarks/bm-test123/pdf");
    expect(result.contentUrl).toBe("/api/bookmarks/bm-test123/content");
  });

  it("should return null for asset URLs when storage IDs are missing", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
      faviconStorageId: null,
      screenshotDesktopStorageId: null,
      pdfStorageId: null,
    });
    expect(result.faviconUrl).toBeNull();
    expect(result.screenshotUrl).toBeNull();
    expect(result.pdfUrl).toBeNull();
  });

  it("should handle null optional fields", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      normalizedUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      pageLastUpdatedAt: null,
      dueDate: null,
    });
    expect(result.normalizedUrl).toBeNull();
    expect(result.pageLastUpdatedAt).toBeNull();
    expect(result.dueDate).toBeNull();
  });

  it("should map processing status from queue job status", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "completed",
    });
    expect(result.processingStatus).toBe("completed");
  });

  it("should return null processingStatus when status is absent", () => {
    const result = mapBookmarkToApiResponse({
      id: "bm-test123",
      originalUrl: "https://example.com",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect(result.processingStatus).toBeNull();
  });
});

// --- mapApiRequestToDbFields ---

describe("mapApiRequestToDbFields", () => {
  it("should map url to originalUrl", () => {
    const result = mapApiRequestToDbFields({ url: "https://example.com" });
    expect(result.originalUrl).toBe("https://example.com");
    expect(result.url).toBeUndefined();
  });

  it("should pass through other fields unchanged", () => {
    const result = mapApiRequestToDbFields({
      title: "Test",
      description: "A test",
      isPinned: true,
    });
    expect(result.title).toBe("Test");
    expect(result.description).toBe("A test");
    expect(result.isPinned).toBe(true);
  });

  it("should handle empty object", () => {
    const result = mapApiRequestToDbFields({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("should not set originalUrl when url is absent", () => {
    const result = mapApiRequestToDbFields({ title: "Test" });
    expect(result.originalUrl).toBeUndefined();
  });
});

// --- convertChromeTimestamp ---

describe("convertChromeTimestamp", () => {
  it("should convert a known Chrome timestamp to the correct date", () => {
    // Chrome epoch: 1601-01-01T00:00:00Z
    // 2025-01-01T00:00:00Z in Chrome microseconds:
    // (Date.parse("2025-01-01T00:00:00Z") * 1000) + 11644473600000000
    const jsTimestamp = Date.parse("2025-01-01T00:00:00Z"); // ms since 1970
    const chromeTimestamp = String(jsTimestamp * 1000 + 11644473600000000);
    const result = convertChromeTimestamp(chromeTimestamp);
    expect(result.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("should handle the Unix epoch", () => {
    // Unix epoch in Chrome microseconds: 11644473600000000
    const result = convertChromeTimestamp("11644473600000000");
    expect(result.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("should handle Chrome epoch (timestamp 0)", () => {
    // Chrome epoch is Jan 1, 1601 — the conversion math produces a date
    // far in the past. We just verify it returns a valid Date, not an error.
    const result = convertChromeTimestamp("0");
    expect(result).toBeInstanceOf(Date);
    expect(result.getTime()).toBeLessThan(0); // Before Unix epoch
  });
});

// --- extractBookmarksFromFolder ---

describe("extractBookmarksFromFolder", () => {
  it("should return empty array for folder with no children", () => {
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Empty",
    };
    expect(extractBookmarksFromFolder(folder)).toEqual([]);
  });

  it("should extract flat bookmarks from folder", () => {
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Root",
      children: [
        {
          type: "url",
          name: "Example",
          url: "https://example.com",
          date_added: "13370000000000000", // some Chrome timestamp
        },
        {
          type: "url",
          name: "Test",
          url: "https://test.com",
          date_added: "13370000000000000",
        },
      ],
    };
    const result = extractBookmarksFromFolder(folder);
    expect(result).toHaveLength(2);
    expect(result[0]!.url).toBe("https://example.com");
    expect(result[0]!.title).toBe("Example");
    expect(result[1]!.url).toBe("https://test.com");
  });

  it("should convert folder path to lowercase tags", () => {
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Root",
      children: [
        {
          type: "url",
          name: "Example",
          url: "https://example.com",
        },
      ],
    };
    const result = extractBookmarksFromFolder(folder, ["Bookmarks-Bar"]);
    expect(result[0]!.tags).toEqual(["bookmarks-bar"]);
  });

  it("should recurse into nested folders and build tag path", () => {
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Root",
      children: [
        {
          type: "folder",
          name: "Tech",
          children: [
            {
              type: "folder",
              name: "JavaScript",
              children: [
                {
                  type: "url",
                  name: "MDN",
                  url: "https://developer.mozilla.org",
                },
              ],
            },
          ],
        },
      ],
    };
    const result = extractBookmarksFromFolder(folder);
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://developer.mozilla.org");
    expect(result[0]!.tags).toEqual(["tech", "javascript"]);
  });

  it("should handle mixed content (folders and URLs at same level)", () => {
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Root",
      children: [
        {
          type: "url",
          name: "TopLevel",
          url: "https://top.com",
        },
        {
          type: "folder",
          name: "Sub",
          children: [
            {
              type: "url",
              name: "Nested",
              url: "https://nested.com",
            },
          ],
        },
      ],
    };
    const result = extractBookmarksFromFolder(folder);
    expect(result).toHaveLength(2);
    expect(result[0]!.url).toBe("https://top.com");
    expect(result[0]!.tags).toEqual([]);
    expect(result[1]!.url).toBe("https://nested.com");
    expect(result[1]!.tags).toEqual(["sub"]);
  });

  it("should skip URL items without a url property", () => {
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Root",
      children: [
        {
          type: "url",
          name: "No URL",
          // url is missing
        },
        {
          type: "url",
          name: "Has URL",
          url: "https://example.com",
        },
      ],
    };
    const result = extractBookmarksFromFolder(folder);
    expect(result).toHaveLength(1);
    expect(result[0]!.url).toBe("https://example.com");
  });

  it("should use current date when date_added is missing", () => {
    const before = Date.now();
    const folder: ChromeBookmarkItem = {
      type: "folder",
      name: "Root",
      children: [
        {
          type: "url",
          name: "No Date",
          url: "https://example.com",
          // date_added is missing
        },
      ],
    };
    const result = extractBookmarksFromFolder(folder);
    const after = Date.now();
    expect(result[0]!.dateAdded.getTime()).toBeGreaterThanOrEqual(before);
    expect(result[0]!.dateAdded.getTime()).toBeLessThanOrEqual(after);
  });
});
