import { describe, expect, it } from "vitest";
import {
  parseNoteUploadMetadata,
  prepareNoteFromUpload,
  validateNoteFileUpload,
} from "../../lib/services/notes.js";

// ---------------------------------------------------------------------------
// validateNoteFileUpload
// ---------------------------------------------------------------------------

describe("validateNoteFileUpload", () => {
  it("should accept a text/plain file", () => {
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    expect(validateNoteFileUpload(file)).toEqual({ valid: true });
  });

  it("should accept a text/markdown file", () => {
    const file = new File(["# heading"], "note.md", { type: "text/markdown" });
    expect(validateNoteFileUpload(file)).toEqual({ valid: true });
  });

  it("should accept an application/json file", () => {
    const file = new File(['{"key":"value"}'], "data.json", {
      type: "application/json",
    });
    expect(validateNoteFileUpload(file)).toEqual({ valid: true });
  });

  it("should reject unsupported MIME types", () => {
    const file = new File(["data"], "image.png", { type: "image/png" });
    const result = validateNoteFileUpload(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file type");
  });

  it("should reject undefined file", () => {
    const result = validateNoteFileUpload(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("No file provided");
  });

  it("should reject files exceeding 1MB", () => {
    const content = "x".repeat(1024 * 1024 + 1); // Just over 1MB
    const file = new File([content], "large.txt", { type: "text/plain" });
    const result = validateNoteFileUpload(file);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("File too large");
  });

  it("should accept a file exactly at the 1MB limit", () => {
    const content = "x".repeat(1024 * 1024); // Exactly 1MB
    const file = new File([content], "exact.txt", { type: "text/plain" });
    expect(validateNoteFileUpload(file)).toEqual({ valid: true });
  });
});

// ---------------------------------------------------------------------------
// parseNoteUploadMetadata
// ---------------------------------------------------------------------------

describe("parseNoteUploadMetadata", () => {
  it("should parse valid JSON metadata", () => {
    const result = parseNoteUploadMetadata(
      JSON.stringify({ title: "My Note", tags: ["a", "b"] }),
    );
    expect(result.valid).toBe(true);
    expect(result.metadata).toEqual({ title: "My Note", tags: ["a", "b"] });
  });

  it("should return empty object for undefined input", () => {
    const result = parseNoteUploadMetadata(undefined);
    expect(result.valid).toBe(true);
    expect(result.metadata).toEqual({});
  });

  it("should return empty object for empty string", () => {
    const result = parseNoteUploadMetadata("");
    expect(result.valid).toBe(true);
    expect(result.metadata).toEqual({});
  });

  it("should reject invalid JSON", () => {
    const result = parseNoteUploadMetadata("{not json");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid metadata JSON");
  });
});

// ---------------------------------------------------------------------------
// prepareNoteFromUpload
// ---------------------------------------------------------------------------

describe("prepareNoteFromUpload", () => {
  it("should pass through plain text content as-is", async () => {
    const file = new File(["Hello, world!"], "note.txt", {
      type: "text/plain",
    });
    const result = await prepareNoteFromUpload(file, {});

    expect(result.content).toBe("Hello, world!");
    expect(result.originalMimeType).toBe("text/plain");
  });

  it("should pass through markdown content as-is", async () => {
    const md = "# Title\n\nSome **bold** text.";
    const file = new File([md], "readme.md", { type: "text/markdown" });
    const result = await prepareNoteFromUpload(file, {});

    expect(result.content).toBe(md);
    expect(result.originalMimeType).toBe("text/markdown");
  });

  it("should wrap JSON content in a markdown code block", async () => {
    const json = '{"key": "value"}';
    const file = new File([json], "data.json", { type: "application/json" });
    const result = await prepareNoteFromUpload(file, {});

    expect(result.content).toBe(`# data\n\n\`\`\`json\n${json}\n\`\`\``);
    expect(result.originalMimeType).toBe("application/json");
  });

  it("should extract title from filename when not provided", async () => {
    const file = new File(["content"], "my-notes.txt", {
      type: "text/plain",
    });
    const result = await prepareNoteFromUpload(file, {});

    expect(result.title).toBe("my-notes");
  });

  it("should use provided title over filename", async () => {
    const file = new File(["content"], "note.txt", { type: "text/plain" });
    const result = await prepareNoteFromUpload(file, {
      title: "Custom Title",
    });

    expect(result.title).toBe("Custom Title");
  });

  it("should pass through tags from metadata", async () => {
    const file = new File(["content"], "note.txt", { type: "text/plain" });
    const result = await prepareNoteFromUpload(file, {
      tags: ["tag1", "tag2"],
    });

    expect(result.metadata.tags).toEqual(["tag1", "tag2"]);
  });

  it("should default tags to empty array", async () => {
    const file = new File(["content"], "note.txt", { type: "text/plain" });
    const result = await prepareNoteFromUpload(file, {});

    expect(result.metadata.tags).toEqual([]);
  });

  it("should strip file extension from JSON filename for title", async () => {
    const file = new File(['{"a":1}'], "config.settings.json", {
      type: "application/json",
    });
    const result = await prepareNoteFromUpload(file, {});

    // The code block header should use the filename without the last extension
    expect(result.content).toContain("# config.settings");
  });
});
