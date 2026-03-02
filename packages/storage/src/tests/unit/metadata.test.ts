import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deleteMetadata,
  getMetadataPath,
  isMetadataFile,
  readMetadata,
  readMetadataOrInfer,
  writeMetadata,
} from "../../adapters/local/metadata.js";
import type { ObjectMetadata } from "../../core/types.js";

describe("getMetadataPath", () => {
  it("appends .meta.json to the file path", () => {
    expect(getMetadataPath("/data/file.txt")).toBe("/data/file.txt.meta.json");
  });

  it("works with paths that already have extensions", () => {
    expect(getMetadataPath("/data/photo.jpg")).toBe(
      "/data/photo.jpg.meta.json",
    );
  });
});

describe("isMetadataFile", () => {
  it("returns true for .meta.json files", () => {
    expect(isMetadataFile("file.txt.meta.json")).toBe(true);
    expect(isMetadataFile("photo.jpg.meta.json")).toBe(true);
  });

  it("returns false for regular files", () => {
    expect(isMetadataFile("file.txt")).toBe(false);
    expect(isMetadataFile("photo.jpg")).toBe(false);
    expect(isMetadataFile("data.json")).toBe(false);
  });
});

describe("writeMetadata and readMetadata", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "metadata-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("round-trips metadata through write and read", async () => {
    const filePath = join(tempDir, "file.txt");
    const metadata: ObjectMetadata = {
      contentType: "text/plain",
      size: 42,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-06-15T12:00:00Z"),
      custom: { source: "upload" },
    };

    await writeMetadata(filePath, metadata);
    const result = await readMetadata(filePath);

    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("text/plain");
    expect(result!.size).toBe(42);
    expect(result!.createdAt).toEqual(new Date("2025-01-01T00:00:00Z"));
    expect(result!.updatedAt).toEqual(new Date("2025-06-15T12:00:00Z"));
    expect(result!.custom).toEqual({ source: "upload" });
  });

  it("returns null when sidecar does not exist", async () => {
    const filePath = join(tempDir, "nonexistent.txt");
    const result = await readMetadata(filePath);
    expect(result).toBeNull();
  });

  it("round-trips metadata without custom fields", async () => {
    const filePath = join(tempDir, "file.txt");
    const metadata: ObjectMetadata = {
      contentType: "application/pdf",
      size: 100,
      createdAt: new Date("2025-03-01T00:00:00Z"),
      updatedAt: new Date("2025-03-01T00:00:00Z"),
    };

    await writeMetadata(filePath, metadata);
    const result = await readMetadata(filePath);

    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("application/pdf");
    expect(result!.custom).toBeUndefined();
  });
});

describe("readMetadataOrInfer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "metadata-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns sidecar metadata when it exists", async () => {
    const filePath = join(tempDir, "file.txt");
    await writeFile(filePath, "content");

    const metadata: ObjectMetadata = {
      contentType: "text/plain",
      size: 7,
      createdAt: new Date("2025-01-01T00:00:00Z"),
      updatedAt: new Date("2025-01-01T00:00:00Z"),
    };
    await writeMetadata(filePath, metadata);

    const result = await readMetadataOrInfer(filePath);
    expect(result.contentType).toBe("text/plain");
  });

  it("infers metadata from file stats when sidecar is missing", async () => {
    const filePath = join(tempDir, "file.txt");
    await writeFile(filePath, "hello world");

    const result = await readMetadataOrInfer(filePath);

    expect(result.contentType).toBe("application/octet-stream");
    expect(result.size).toBe(11);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("uses custom default content type for inference", async () => {
    const filePath = join(tempDir, "file.txt");
    await writeFile(filePath, "data");

    const result = await readMetadataOrInfer(filePath, "text/plain");
    expect(result.contentType).toBe("text/plain");
  });
});

describe("deleteMetadata", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "metadata-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("removes the sidecar file", async () => {
    const filePath = join(tempDir, "file.txt");
    const metadata: ObjectMetadata = {
      contentType: "text/plain",
      size: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await writeMetadata(filePath, metadata);
    expect(await readMetadata(filePath)).not.toBeNull();

    await deleteMetadata(filePath);
    expect(await readMetadata(filePath)).toBeNull();
  });

  it("is a no-op when sidecar does not exist", async () => {
    const filePath = join(tempDir, "nonexistent.txt");
    // Should not throw
    await deleteMetadata(filePath);
  });
});
