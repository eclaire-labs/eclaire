import { beforeEach, describe, expect, it } from "vitest";
import { MemoryStorage } from "../../adapters/memory/index.js";
import { runStorageConformanceTests } from "../storage-conformance.js";

// Run the full conformance suite against MemoryStorage
runStorageConformanceTests({
  name: "MemoryStorage",
  create: () => new MemoryStorage(),
});

// MemoryStorage-specific tests
describe("MemoryStorage — adapter-specific", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  describe("size property", () => {
    it("returns 0 for empty storage", () => {
      expect(storage.size).toBe(0);
    });

    it("reflects the number of stored objects", async () => {
      await storage.writeBuffer("user-1/docs/doc-1/a.txt", Buffer.from("a"), {
        contentType: "text/plain",
      });
      await storage.writeBuffer("user-1/docs/doc-2/b.txt", Buffer.from("b"), {
        contentType: "text/plain",
      });

      expect(storage.size).toBe(2);
    });
  });

  describe("clear", () => {
    it("removes all data", async () => {
      await storage.writeBuffer(
        "user-1/docs/doc-1/a.txt",
        Buffer.from("test"),
        { contentType: "text/plain" },
      );

      storage.clear();

      expect(storage.size).toBe(0);
    });
  });

  describe("close", () => {
    it("does not destroy data", async () => {
      await storage.writeBuffer(
        "user-1/docs/doc-1/a.txt",
        Buffer.from("test"),
        { contentType: "text/plain" },
      );

      await storage.close();

      // close() releases resources but preserves data
      expect(storage.size).toBe(1);
    });
  });
});
