import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalStorage } from "../adapters/local/index.js";
import {
  StorageInvalidKeyError,
  StorageNotFoundError,
} from "../core/errors.js";

describe("LocalStorage", () => {
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

  describe("writeBuffer and readBuffer", () => {
    it("writes and reads a buffer", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      const buffer = Buffer.from("hello world");

      await storage.writeBuffer(key, buffer, { contentType: "text/plain" });

      const { buffer: result, metadata } = await storage.readBuffer(key);
      expect(result.toString()).toBe("hello world");
      expect(metadata.contentType).toBe("text/plain");
      expect(metadata.size).toBe(11);
    });

    it("creates directories automatically", async () => {
      const key = "user-1/docs/doc-1/nested/deep/file.txt";
      const buffer = Buffer.from("nested content");

      await storage.writeBuffer(key, buffer, { contentType: "text/plain" });

      const { buffer: result } = await storage.readBuffer(key);
      expect(result.toString()).toBe("nested content");
    });

    it("stores custom metadata", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      const buffer = Buffer.from("hello");

      await storage.writeBuffer(key, buffer, {
        contentType: "text/plain",
        custom: { originalFilename: "myfile.txt" },
      });

      const { metadata } = await storage.readBuffer(key);
      expect(metadata.custom?.originalFilename).toBe("myfile.txt");
    });

    it("creates sidecar metadata file", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      const buffer = Buffer.from("test");

      await storage.writeBuffer(key, buffer, { contentType: "text/plain" });

      const dirPath = join(tempDir, "user-1/docs/doc-1");
      const files = await readdir(dirPath);
      expect(files).toContain("file.txt");
      expect(files).toContain("file.txt.meta.json");
    });

    it("throws StorageNotFoundError for missing key", async () => {
      await expect(
        storage.readBuffer("user-1/docs/doc-1/nonexistent.txt"),
      ).rejects.toThrow(StorageNotFoundError);
    });

    it("throws StorageInvalidKeyError for path traversal", async () => {
      const buffer = Buffer.from("test");
      await expect(
        storage.writeBuffer("user-1/../../../evil", buffer, {
          contentType: "text/plain",
        }),
      ).rejects.toThrow(StorageInvalidKeyError);
    });
  });

  describe("write and read (streaming)", () => {
    it("writes and reads a stream", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      const buffer = Buffer.from("streaming content");

      // Create a web ReadableStream
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(buffer);
          controller.close();
        },
      });

      await storage.write(key, stream, { contentType: "text/plain" });

      const { stream: resultStream, metadata } = await storage.read(key);
      const reader = resultStream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const result = Buffer.concat(chunks).toString();

      expect(result).toBe("streaming content");
      expect(metadata.contentType).toBe("text/plain");
    });
  });

  describe("exists", () => {
    it("returns true for existing key", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      await storage.writeBuffer(key, Buffer.from("test"), {
        contentType: "text/plain",
      });

      expect(await storage.exists(key)).toBe(true);
    });

    it("returns false for non-existing key", async () => {
      expect(await storage.exists("user-1/docs/doc-1/nonexistent.txt")).toBe(
        false,
      );
    });
  });

  describe("head", () => {
    it("returns metadata for existing key", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      await storage.writeBuffer(key, Buffer.from("test"), {
        contentType: "text/plain",
      });

      const metadata = await storage.head(key);
      expect(metadata).not.toBeNull();
      expect(metadata?.contentType).toBe("text/plain");
      expect(metadata?.size).toBe(4);
    });

    it("returns null for non-existing key", async () => {
      expect(
        await storage.head("user-1/docs/doc-1/nonexistent.txt"),
      ).toBeNull();
    });
  });

  describe("delete", () => {
    it("deletes an existing file and its metadata", async () => {
      const key = "user-1/docs/doc-1/file.txt";
      await storage.writeBuffer(key, Buffer.from("test"), {
        contentType: "text/plain",
      });

      await storage.delete(key);

      expect(await storage.exists(key)).toBe(false);

      // Check metadata file is also deleted
      const dirPath = join(tempDir, "user-1/docs/doc-1");
      const files = await readdir(dirPath);
      expect(files).not.toContain("file.txt");
      expect(files).not.toContain("file.txt.meta.json");
    });

    it("is a no-op for non-existing key", async () => {
      // Should not throw
      await storage.delete("user-1/docs/doc-1/nonexistent.txt");
    });
  });

  describe("deletePrefix", () => {
    it("deletes all files with prefix", async () => {
      await storage.writeBuffer("user-1/docs/doc-1/a.txt", Buffer.from("a"), {
        contentType: "text/plain",
      });
      await storage.writeBuffer("user-1/docs/doc-1/b.txt", Buffer.from("b"), {
        contentType: "text/plain",
      });
      await storage.writeBuffer("user-1/docs/doc-2/c.txt", Buffer.from("c"), {
        contentType: "text/plain",
      });

      const deleted = await storage.deletePrefix("user-1/docs/doc-1/");

      expect(deleted).toBe(2);
      expect(await storage.exists("user-1/docs/doc-1/a.txt")).toBe(false);
      expect(await storage.exists("user-1/docs/doc-1/b.txt")).toBe(false);
      expect(await storage.exists("user-1/docs/doc-2/c.txt")).toBe(true);
    });

    it("returns 0 when no files match", async () => {
      const deleted = await storage.deletePrefix("nonexistent/");
      expect(deleted).toBe(0);
    });

    it("throws for path traversal", async () => {
      await expect(storage.deletePrefix("../evil/")).rejects.toThrow(
        StorageInvalidKeyError,
      );
    });
  });

  describe("list", () => {
    it("lists all files", async () => {
      await storage.writeBuffer("user-1/docs/doc-1/a.txt", Buffer.from("a"), {
        contentType: "text/plain",
      });
      await storage.writeBuffer("user-1/docs/doc-2/b.txt", Buffer.from("b"), {
        contentType: "text/plain",
      });

      const result = await storage.list();

      expect(result.keys).toHaveLength(2);
      expect(result.keys).toContain("user-1/docs/doc-1/a.txt");
      expect(result.keys).toContain("user-1/docs/doc-2/b.txt");
    });

    it("lists files with prefix", async () => {
      await storage.writeBuffer("user-1/docs/doc-1/a.txt", Buffer.from("a"), {
        contentType: "text/plain",
      });
      await storage.writeBuffer(
        "user-1/photos/photo-1/b.jpg",
        Buffer.from("b"),
        {
          contentType: "image/jpeg",
        },
      );

      const result = await storage.list({ prefix: "user-1/docs/" });

      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]).toBe("user-1/docs/doc-1/a.txt");
    });

    it("excludes metadata files from listing", async () => {
      await storage.writeBuffer(
        "user-1/docs/doc-1/file.txt",
        Buffer.from("test"),
        {
          contentType: "text/plain",
        },
      );

      const result = await storage.list();

      // Should only contain the actual file, not the .meta.json
      expect(result.keys).toHaveLength(1);
      expect(result.keys[0]).toBe("user-1/docs/doc-1/file.txt");
    });
  });

  describe("stats", () => {
    it("calculates stats for prefix", async () => {
      await storage.writeBuffer(
        "user-1/docs/doc-1/a.txt",
        Buffer.from("hello"),
        {
          contentType: "text/plain",
        },
      );
      await storage.writeBuffer(
        "user-1/docs/doc-1/b.txt",
        Buffer.from("world"),
        {
          contentType: "text/plain",
        },
      );
      await storage.writeBuffer(
        "user-1/photos/photo-1/c.jpg",
        Buffer.from("jpg"),
        {
          contentType: "image/jpeg",
        },
      );

      const docsStats = await storage.stats("user-1/docs/");
      expect(docsStats.count).toBe(2);
      expect(docsStats.size).toBe(10); // "hello" + "world"

      const userStats = await storage.stats("user-1/");
      expect(userStats.count).toBe(3);
      expect(userStats.size).toBe(13); // "hello" + "world" + "jpg"
    });

    it("returns zero for non-existent prefix", async () => {
      const stats = await storage.stats("nonexistent/");
      expect(stats.count).toBe(0);
      expect(stats.size).toBe(0);
    });

    it("throws for path traversal", async () => {
      await expect(storage.stats("../evil/")).rejects.toThrow(
        StorageInvalidKeyError,
      );
    });
  });
});
