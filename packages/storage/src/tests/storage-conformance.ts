/**
 * Shared conformance test suite for Storage adapters.
 *
 * Runs the same behavioral tests against any adapter to guarantee
 * consistent implementation of the Storage interface.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  StorageInvalidKeyError,
  StorageNotFoundError,
} from "../core/errors.js";
import type { Storage } from "../core/types.js";

export interface ConformanceOptions {
  /** Human-readable adapter name used in describe blocks */
  name: string;
  /** Factory that creates a fresh Storage instance before each test */
  create: () => Storage | Promise<Storage>;
  /** Optional cleanup called after each test (e.g. remove temp dirs) */
  cleanup?: (storage: Storage) => Promise<void>;
}

/**
 * Run the full Storage conformance suite.
 *
 * Call this from adapter-specific test files:
 * ```ts
 * runStorageConformanceTests({
 *   name: "MemoryStorage",
 *   create: () => new MemoryStorage(),
 * });
 * ```
 */
export function runStorageConformanceTests(opts: ConformanceOptions): void {
  describe(`${opts.name} — conformance`, () => {
    let storage: Storage;

    beforeEach(async () => {
      storage = await opts.create();
    });

    afterEach(async () => {
      if (opts.cleanup) {
        await opts.cleanup(storage);
      } else {
        await storage.close();
      }
    });

    // ================================================================
    // Write + Read (buffer)
    // ================================================================

    describe("writeBuffer and readBuffer", () => {
      it("round-trips a buffer", async () => {
        const key = "user-1/docs/doc-1/file.txt";
        const buffer = Buffer.from("hello world");

        await storage.writeBuffer(key, buffer, { contentType: "text/plain" });

        const { buffer: result, metadata } = await storage.readBuffer(key);
        expect(result.toString()).toBe("hello world");
        expect(metadata.contentType).toBe("text/plain");
        expect(metadata.size).toBe(11);
      });

      it("preserves custom metadata", async () => {
        const key = "user-1/docs/doc-1/file.txt";
        const buffer = Buffer.from("hello");

        await storage.writeBuffer(key, buffer, {
          contentType: "text/plain",
          custom: { originalFilename: "myfile.txt" },
        });

        const { metadata } = await storage.readBuffer(key);
        expect(metadata.custom?.originalFilename).toBe("myfile.txt");
      });

      it("overwrites existing key with new content", async () => {
        const key = "user-1/docs/doc-1/file.txt";

        await storage.writeBuffer(key, Buffer.from("first"), {
          contentType: "text/plain",
        });
        await storage.writeBuffer(key, Buffer.from("second"), {
          contentType: "application/octet-stream",
        });

        const { buffer, metadata } = await storage.readBuffer(key);
        expect(buffer.toString()).toBe("second");
        expect(metadata.contentType).toBe("application/octet-stream");
        expect(metadata.size).toBe(6);
      });

      it("throws StorageNotFoundError for missing key", async () => {
        await expect(
          storage.readBuffer("user-1/docs/doc-1/nonexistent.txt"),
        ).rejects.toThrow(StorageNotFoundError);
      });

      it("throws StorageInvalidKeyError for path traversal on write", async () => {
        await expect(
          storage.writeBuffer("../evil/path", Buffer.from("x"), {
            contentType: "text/plain",
          }),
        ).rejects.toThrow(StorageInvalidKeyError);
      });

      it("throws StorageInvalidKeyError for path traversal on read", async () => {
        await expect(storage.readBuffer("../evil")).rejects.toThrow(
          StorageInvalidKeyError,
        );
      });
    });

    // ================================================================
    // Write + Read (streaming)
    // ================================================================

    describe("write and read (streaming)", () => {
      it("round-trips a stream", async () => {
        const key = "user-1/docs/doc-1/file.txt";
        const data = Buffer.from("streaming content");

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(data);
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

      it("throws StorageNotFoundError for missing key via read()", async () => {
        await expect(
          storage.read("user-1/docs/doc-1/nonexistent.txt"),
        ).rejects.toThrow(StorageNotFoundError);
      });
    });

    // ================================================================
    // exists
    // ================================================================

    describe("exists", () => {
      it("returns true for existing key", async () => {
        const key = "user-1/docs/doc-1/file.txt";
        await storage.writeBuffer(key, Buffer.from("test"), {
          contentType: "text/plain",
        });

        expect(await storage.exists(key)).toBe(true);
      });

      it("returns false for non-existing key", async () => {
        expect(
          await storage.exists("user-1/docs/doc-1/nonexistent.txt"),
        ).toBe(false);
      });

      it("throws StorageInvalidKeyError for path traversal", async () => {
        await expect(storage.exists("../evil")).rejects.toThrow(
          StorageInvalidKeyError,
        );
      });
    });

    // ================================================================
    // head
    // ================================================================

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

      it("throws StorageInvalidKeyError for path traversal", async () => {
        await expect(storage.head("../evil")).rejects.toThrow(
          StorageInvalidKeyError,
        );
      });
    });

    // ================================================================
    // delete
    // ================================================================

    describe("delete", () => {
      it("deletes an existing key", async () => {
        const key = "user-1/docs/doc-1/file.txt";
        await storage.writeBuffer(key, Buffer.from("test"), {
          contentType: "text/plain",
        });

        await storage.delete(key);

        expect(await storage.exists(key)).toBe(false);
      });

      it("is a no-op for non-existing key", async () => {
        // Should not throw
        await storage.delete("user-1/docs/doc-1/nonexistent.txt");
      });

      it("throws StorageInvalidKeyError for path traversal", async () => {
        await expect(storage.delete("../evil")).rejects.toThrow(
          StorageInvalidKeyError,
        );
      });
    });

    // ================================================================
    // deletePrefix
    // ================================================================

    describe("deletePrefix", () => {
      it("deletes all keys with prefix", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("a"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/docs/doc-1/b.txt",
          Buffer.from("b"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/docs/doc-2/c.txt",
          Buffer.from("c"),
          { contentType: "text/plain" },
        );

        const deleted = await storage.deletePrefix("user-1/docs/doc-1/");

        expect(deleted).toBe(2);
        expect(await storage.exists("user-1/docs/doc-1/a.txt")).toBe(false);
        expect(await storage.exists("user-1/docs/doc-1/b.txt")).toBe(false);
        expect(await storage.exists("user-1/docs/doc-2/c.txt")).toBe(true);
      });

      it("returns 0 when no keys match", async () => {
        const deleted = await storage.deletePrefix("nonexistent/");
        expect(deleted).toBe(0);
      });

      it("throws StorageInvalidKeyError for path traversal", async () => {
        await expect(storage.deletePrefix("../evil/")).rejects.toThrow(
          StorageInvalidKeyError,
        );
      });
    });

    // ================================================================
    // list
    // ================================================================

    describe("list", () => {
      it("lists all keys", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("a"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/docs/doc-2/b.txt",
          Buffer.from("b"),
          { contentType: "text/plain" },
        );

        const result = await storage.list();

        expect(result.keys).toHaveLength(2);
        expect(result.keys).toContain("user-1/docs/doc-1/a.txt");
        expect(result.keys).toContain("user-1/docs/doc-2/b.txt");
      });

      it("filters by prefix", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("a"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/photos/photo-1/b.jpg",
          Buffer.from("b"),
          { contentType: "image/jpeg" },
        );

        const result = await storage.list({ prefix: "user-1/docs/" });

        expect(result.keys).toHaveLength(1);
        expect(result.keys[0]).toBe("user-1/docs/doc-1/a.txt");
      });

      it("supports pagination with limit and cursor", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("a"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/docs/doc-2/b.txt",
          Buffer.from("b"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/docs/doc-3/c.txt",
          Buffer.from("c"),
          { contentType: "text/plain" },
        );

        const page1 = await storage.list({ limit: 2 });
        expect(page1.keys).toHaveLength(2);
        expect(page1.nextCursor).toBeDefined();

        const page2 = await storage.list({
          limit: 2,
          cursor: page1.nextCursor,
        });
        expect(page2.keys).toHaveLength(1);
        expect(page2.nextCursor).toBeUndefined();

        // All three keys present across pages
        const allKeys = [...page1.keys, ...page2.keys];
        expect(allKeys).toHaveLength(3);
        expect(allKeys).toContain("user-1/docs/doc-1/a.txt");
        expect(allKeys).toContain("user-1/docs/doc-2/b.txt");
        expect(allKeys).toContain("user-1/docs/doc-3/c.txt");
      });

      it("returns empty result for non-matching prefix", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("a"),
          { contentType: "text/plain" },
        );

        const result = await storage.list({ prefix: "user-2/" });
        expect(result.keys).toHaveLength(0);
        expect(result.nextCursor).toBeUndefined();
      });

      it("throws StorageInvalidKeyError for path traversal in prefix", async () => {
        await expect(
          storage.list({ prefix: "../evil/" }),
        ).rejects.toThrow(StorageInvalidKeyError);
      });
    });

    // ================================================================
    // stats
    // ================================================================

    describe("stats", () => {
      it("calculates count and size for prefix", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("hello"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/docs/doc-1/b.txt",
          Buffer.from("world"),
          { contentType: "text/plain" },
        );
        await storage.writeBuffer(
          "user-1/photos/photo-1/c.jpg",
          Buffer.from("jpg"),
          { contentType: "image/jpeg" },
        );

        const docsStats = await storage.stats("user-1/docs/");
        expect(docsStats.count).toBe(2);
        expect(docsStats.size).toBe(10); // "hello" + "world"

        const userStats = await storage.stats("user-1/");
        expect(userStats.count).toBe(3);
        expect(userStats.size).toBe(13); // "hello" + "world" + "jpg"
      });

      it("returns zero for non-matching prefix", async () => {
        const stats = await storage.stats("nonexistent/");
        expect(stats.count).toBe(0);
        expect(stats.size).toBe(0);
      });

      it("throws StorageInvalidKeyError for path traversal", async () => {
        await expect(storage.stats("../evil/")).rejects.toThrow(
          StorageInvalidKeyError,
        );
      });
    });

    // ================================================================
    // close
    // ================================================================

    describe("close", () => {
      it("can be called without error", async () => {
        await storage.writeBuffer(
          "user-1/docs/doc-1/a.txt",
          Buffer.from("test"),
          { contentType: "text/plain" },
        );

        // Should not throw
        await storage.close();
      });
    });
  });
}
