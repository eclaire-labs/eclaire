/**
 * In-memory storage adapter for testing
 *
 * Stores all data in memory using a Map. Useful for unit tests
 * where you don't want to hit the filesystem.
 */

import { Readable } from "node:stream";
import { StorageNotFoundError } from "../../core/errors.js";
import { assertSafeKey, assertSafePrefix } from "../../core/keys.js";
import {
  type ListOptions,
  type ListResult,
  buildObjectMetadata,
  noopLogger,
  type ObjectMetadata,
  type Storage,
  type StorageConfig,
  type StorageLogger,
  type StorageObject,
  type StorageStats,
  type WriteOptions,
} from "../../core/types.js";

/**
 * Stored object in memory
 */
interface StoredObject {
  buffer: Buffer;
  metadata: ObjectMetadata;
}

/**
 * In-memory storage implementation for testing
 */
export class MemoryStorage implements Storage {
  private readonly store: Map<string, StoredObject> = new Map();
  private readonly logger: StorageLogger;

  constructor(config?: StorageConfig) {
    this.logger = config?.logger ?? noopLogger;
    this.logger.debug({}, "MemoryStorage initialized");
  }

  // ---- Write Operations ----

  async write(
    key: string,
    stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
    options: WriteOptions,
  ): Promise<void> {
    assertSafeKey(key);

    // Collect stream into buffer
    const chunks: Uint8Array[] = [];

    if ("getReader" in stream) {
      // Web ReadableStream
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
    } else {
      // Node.js ReadableStream
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
    }

    const buffer = Buffer.concat(chunks);
    const metadata = buildObjectMetadata(buffer.length, options);

    this.store.set(key, { buffer, metadata });
    this.logger.debug({ key, size: buffer.length }, "Object stored");
  }

  async writeBuffer(
    key: string,
    buffer: Buffer,
    options: WriteOptions,
  ): Promise<void> {
    assertSafeKey(key);

    const metadata = buildObjectMetadata(buffer.length, options);

    this.store.set(key, { buffer: Buffer.from(buffer), metadata });
    this.logger.debug({ key, size: buffer.length }, "Object stored");
  }

  // ---- Read Operations ----

  async read(key: string): Promise<StorageObject> {
    assertSafeKey(key);

    const stored = this.store.get(key);
    if (!stored) {
      throw new StorageNotFoundError(key);
    }

    // Create a web ReadableStream from the buffer
    const nodeStream = Readable.from(stored.buffer);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return {
      stream: webStream,
      metadata: { ...stored.metadata },
    };
  }

  async readBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; metadata: ObjectMetadata }> {
    assertSafeKey(key);

    const stored = this.store.get(key);
    if (!stored) {
      throw new StorageNotFoundError(key);
    }

    return {
      buffer: Buffer.from(stored.buffer),
      metadata: { ...stored.metadata },
    };
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    assertSafeKey(key);

    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }

    return { ...stored.metadata };
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    return this.store.has(key);
  }

  // ---- Delete Operations ----

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    this.store.delete(key);
    this.logger.debug({ key }, "Object deleted");
  }

  async deletePrefix(prefix: string): Promise<number> {
    assertSafePrefix(prefix);

    let count = 0;
    const keysToDelete: string[] = [];

    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.store.delete(key);
      count++;
    }

    this.logger.debug({ prefix, count }, "Prefix deleted");
    return count;
  }

  // ---- List Operations ----

  async list(options?: ListOptions): Promise<ListResult> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    if (prefix) {
      assertSafePrefix(prefix);
    }

    const matchingKeys: string[] = [];

    for (const key of this.store.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        matchingKeys.push(key);
      }
    }

    // Sort for consistent ordering
    matchingKeys.sort();

    // Apply pagination
    const paginatedKeys = matchingKeys.slice(offset, offset + limit);
    const hasMore = offset + limit < matchingKeys.length;

    return {
      keys: paginatedKeys,
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  // ---- Statistics ----

  async stats(prefix: string): Promise<StorageStats> {
    assertSafePrefix(prefix);

    let count = 0;
    let size = 0;

    for (const [key, stored] of this.store.entries()) {
      if (key.startsWith(prefix)) {
        count++;
        size += stored.metadata.size;
      }
    }

    return { count, size };
  }

  // ---- Lifecycle ----

  async close(): Promise<void> {
    this.logger.debug({}, "MemoryStorage closed");
  }

  // ---- Test Utilities ----

  /**
   * Clear all stored objects (useful for tests)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get the number of stored objects
   */
  get size(): number {
    return this.store.size;
  }
}
