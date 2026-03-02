import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "../../adapters/local/index.js";
import { runStorageConformanceTests } from "../storage-conformance.js";

// ---------------------------------------------------------------------------
// Shared conformance suite
// ---------------------------------------------------------------------------

let sharedTempDir: string;
let sharedStorage: LocalStorage;

runStorageConformanceTests({
  name: "LocalStorage",
  create: async () => {
    sharedTempDir = await mkdtemp(join(tmpdir(), "storage-test-"));
    sharedStorage = new LocalStorage({ baseDir: sharedTempDir });
    return sharedStorage;
  },
  cleanup: async (storage) => {
    await storage.close();
    await rm(sharedTempDir, { recursive: true, force: true });
  },
});

// ---------------------------------------------------------------------------
// LocalStorage-specific tests
// ---------------------------------------------------------------------------

describe("LocalStorage — adapter-specific", () => {
  let storage: LocalStorage;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "storage-test-"));
    storage = new LocalStorage({ baseDir: tempDir });
  });

  afterEach(async () => {
    await storage.close();
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("directory creation", () => {
    it("auto-creates nested directories", async () => {
      const key = "user-1/docs/doc-1/nested/deep/file.txt";
      await storage.writeBuffer(key, Buffer.from("nested content"), {
        contentType: "text/plain",
      });

      const { buffer } = await storage.readBuffer(key);
      expect(buffer.toString()).toBe("nested content");
    });
  });

  describe("sidecar metadata files", () => {
    it("creates a .meta.json alongside the data file", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      await storage.writeBuffer(key, Buffer.from("test"), {
        contentType: "text/plain",
      });

      const dirPath = join(tempDir, "user-1/docs/doc-1");
      const files = await readdir(dirPath);
      expect(files).toContain("file.txt");
      expect(files).toContain("file.txt.meta.json");
    });

    it("deletes the sidecar when the data file is deleted", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      await storage.writeBuffer(key, Buffer.from("test"), {
        contentType: "text/plain",
      });

      await storage.delete(key);

      const dirPath = join(tempDir, "user-1/docs/doc-1");
      const files = await readdir(dirPath);
      expect(files).not.toContain("file.txt");
      expect(files).not.toContain("file.txt.meta.json");
    });

    it("excludes .meta.json files from list results", async () => {
      await storage.writeBuffer(
        "user-1/docs/doc-1/file.txt",
        Buffer.from("test"),
        { contentType: "text/plain" },
      );

      const result = await storage.list();

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]).toBe("user-1/docs/doc-1/file.txt");
    });

    it("excludes .meta.json files from stats count", async () => {
      await storage.writeBuffer(
        "user-1/docs/doc-1/file.txt",
        Buffer.from("hello"),
        { contentType: "text/plain" },
      );

      const stats = await storage.stats("user-1/");
      expect(stats.count).toBe(1);
    });
  });

  describe("metadata inference fallback", () => {
    it("infers metadata from file stats when sidecar is missing", async () => {
      // Write a file through the adapter to create the directory structure
      await storage.writeBuffer(
        "user-1/docs/doc-1/setup.txt",
        Buffer.from("setup"),
        { contentType: "text/plain" },
      );

      // Manually write a file without a sidecar .meta.json
      const dirPath = join(tempDir, "user-1/docs/doc-1");
      await writeFile(join(dirPath, "orphan.txt"), "orphan content");

      const { buffer, metadata } = await storage.readBuffer(
        "user-1/docs/doc-1/orphan.txt",
      );
      expect(buffer.toString()).toBe("orphan content");
      // Should fall back to application/octet-stream
      expect(metadata.contentType).toBe("application/octet-stream");
      expect(metadata.size).toBe(14); // "orphan content".length
    });
  });

  describe("corrupted metadata", () => {
    it("throws when sidecar contains invalid JSON", async () => {
      // Write a valid file first
      await storage.writeBuffer(
        "user-1/docs/doc-1/file.txt",
        Buffer.from("test"),
        { contentType: "text/plain" },
      );

      // Corrupt the sidecar
      const sidecarPath = join(
        tempDir,
        "user-1/docs/doc-1/file.txt.meta.json",
      );
      await writeFile(sidecarPath, "not valid json {{{");

      // Reading metadata should throw (JSON.parse error propagates)
      await expect(
        storage.readBuffer("user-1/docs/doc-1/file.txt"),
      ).rejects.toThrow();
    });
  });
});
