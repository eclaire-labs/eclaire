/**
 * In-memory storage adapter for testing
 *
 * Stores all data in memory using a Map. Useful for unit tests
 * where you don't want to hit the filesystem.
 */

import { Readable } from "node:stream";
import {
  StorageInvalidKeyError,
  StorageNotFoundError,
} from "../../core/errors.js";
import { isValidKey } from "../../core/keys.js";
import type {
  ListOptions,
  ListResult,
  ObjectMetadata,
  Storage,
  StorageConfig,
  StorageLogger,
  StorageObject,
  StorageStats,
  WriteOptions,
} from "../../core/types.js";

/**
 * Stored object in memory
 */
interface StoredObject {
  buffer: Buffer;
  metadata: ObjectMetadata;
}

/**
 * No-op logger for when none is provided
 */
const noopLogger: StorageLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

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

  /**
   * Validate a key and throw if invalid
   */
  private validateKey(key: string): void {
    if (!isValidKey(key)) {
      throw new StorageInvalidKeyError(key, "Invalid storage key format");
    }
  }

  /**
   * Validate a prefix
   */
  private validatePrefix(prefix: string): void {
    if (prefix.includes("..") || prefix.startsWith("/")) {
      throw new StorageInvalidKeyError(prefix, "Invalid prefix");
    }
  }

  // ---- Write Operations ----

  async write(
    key: string,
    stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
    options: WriteOptions,
  ): Promise<void> {
    this.validateKey(key);

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
    const now = new Date();

    const metadata: ObjectMetadata = {
      contentType: options.contentType,
      size: buffer.length,
      createdAt: now,
      updatedAt: now,
      custom: options.custom,
    };

    this.store.set(key, { buffer, metadata });
    this.logger.debug({ key, size: buffer.length }, "Object stored");
  }

  async writeBuffer(
    key: string,
    buffer: Buffer,
    options: WriteOptions,
  ): Promise<void> {
    this.validateKey(key);

    const now = new Date();

    const metadata: ObjectMetadata = {
      contentType: options.contentType,
      size: buffer.length,
      createdAt: now,
      updatedAt: now,
      custom: options.custom,
    };

    this.store.set(key, { buffer: Buffer.from(buffer), metadata });
    this.logger.debug({ key, size: buffer.length }, "Object stored");
  }

  // ---- Read Operations ----

  async read(key: string): Promise<StorageObject> {
    this.validateKey(key);

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
    this.validateKey(key);

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
    this.validateKey(key);

    const stored = this.store.get(key);
    if (!stored) {
      return null;
    }

    return { ...stored.metadata };
  }

  async exists(key: string): Promise<boolean> {
    this.validateKey(key);
    return this.store.has(key);
  }

  // ---- Delete Operations ----

  async delete(key: string): Promise<void> {
    this.validateKey(key);
    this.store.delete(key);
    this.logger.debug({ key }, "Object deleted");
  }

  async deletePrefix(prefix: string): Promise<number> {
    this.validatePrefix(prefix);

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
      this.validatePrefix(prefix);
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
    this.validatePrefix(prefix);

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
    this.store.clear();
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
