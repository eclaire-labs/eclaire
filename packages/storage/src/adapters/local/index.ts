/**
 * Local filesystem storage adapter
 *
 * Stores files on the local filesystem with sidecar .meta.json files for metadata.
 * Provides path traversal protection and automatic directory creation.
 */

import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  constants,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  StorageError,
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
import {
  deleteMetadata,
  isMetadataFile,
  readMetadataOrInfer,
  writeMetadata,
} from "./metadata.js";

/**
 * Local storage configuration
 */
export interface LocalStorageConfig extends StorageConfig {
  /** Base directory for storage */
  baseDir: string;

  /** File permissions for new files (default: 0o644) */
  fileMode?: number;

  /** Directory permissions (default: 0o755) */
  dirMode?: number;
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
 * Local filesystem storage implementation
 */
export class LocalStorage implements Storage {
  private readonly baseDir: string;
  private readonly fileMode: number;
  private readonly dirMode: number;
  private readonly logger: StorageLogger;

  constructor(config: LocalStorageConfig) {
    this.baseDir = normalize(config.baseDir);
    this.fileMode = config.fileMode ?? 0o644;
    this.dirMode = config.dirMode ?? 0o755;
    this.logger = config.logger ?? noopLogger;

    this.logger.debug({ baseDir: this.baseDir }, "LocalStorage initialized");
  }

  /**
   * Get the full filesystem path for a storage key
   */
  private getFullPath(key: string): string {
    if (!isValidKey(key)) {
      throw new StorageInvalidKeyError(
        key,
        "Invalid storage key format or path traversal attempt",
      );
    }

    const fullPath = join(this.baseDir, key);
    const normalizedPath = normalize(fullPath);

    // Ensure the path is within baseDir (defense in depth)
    const relativePath = relative(this.baseDir, normalizedPath);
    if (relativePath.startsWith("..") || relativePath.startsWith("/")) {
      throw new StorageInvalidKeyError(key, "Path traversal attempt detected");
    }

    return normalizedPath;
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await mkdir(dirPath, { recursive: true, mode: this.dirMode });
    } catch (error) {
      // Ignore if directory already exists
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  // ---- Write Operations ----

  async write(
    key: string,
    stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
    options: WriteOptions,
  ): Promise<void> {
    const filePath = this.getFullPath(key);
    const dirPath = dirname(filePath);

    await this.ensureDir(dirPath);

    // Convert web stream to node stream if needed
    let nodeStream: NodeJS.ReadableStream;
    if ("getReader" in stream) {
      nodeStream = Readable.fromWeb(
        stream as unknown as import("stream/web").ReadableStream,
      );
    } else {
      nodeStream = stream;
    }

    // Write the file
    const writeStream = createWriteStream(filePath, { mode: this.fileMode });

    try {
      await pipeline(nodeStream, writeStream);
    } catch (error) {
      // Clean up partial file on error
      try {
        await unlink(filePath);
      } catch {
        // Ignore cleanup errors
      }
      throw new StorageError(
        `Failed to write ${key}: ${(error as Error).message}`,
        error as Error,
      );
    }

    // Get file size and write metadata
    const stats = await stat(filePath);
    const now = new Date();

    const metadata: ObjectMetadata = {
      contentType: options.contentType,
      size: stats.size,
      createdAt: now,
      updatedAt: now,
      custom: options.custom,
    };

    await writeMetadata(filePath, metadata);

    this.logger.debug({ key, size: stats.size }, "File written");
  }

  async writeBuffer(
    key: string,
    buffer: Buffer,
    options: WriteOptions,
  ): Promise<void> {
    const stream = Readable.from(buffer);
    await this.write(key, stream as unknown as NodeJS.ReadableStream, options);
  }

  // ---- Read Operations ----

  async read(key: string): Promise<StorageObject> {
    const filePath = this.getFullPath(key);

    // Check if file exists
    try {
      await access(filePath, constants.R_OK);
    } catch {
      throw new StorageNotFoundError(key);
    }

    const metadata = await readMetadataOrInfer(filePath);

    // Create a web ReadableStream from the file
    const nodeStream = createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return {
      stream: webStream,
      metadata,
    };
  }

  async readBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; metadata: ObjectMetadata }> {
    const filePath = this.getFullPath(key);

    try {
      const buffer = await readFile(filePath);
      const metadata = await readMetadataOrInfer(filePath);

      return { buffer, metadata };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new StorageNotFoundError(key);
      }
      throw error;
    }
  }

  async head(key: string): Promise<ObjectMetadata | null> {
    const filePath = this.getFullPath(key);

    try {
      await access(filePath, constants.R_OK);
      return await readMetadataOrInfer(filePath);
    } catch {
      return null;
    }
  }

  async exists(key: string): Promise<boolean> {
    const filePath = this.getFullPath(key);

    try {
      await access(filePath, constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  // ---- Delete Operations ----

  async delete(key: string): Promise<void> {
    const filePath = this.getFullPath(key);

    try {
      await unlink(filePath);
      await deleteMetadata(filePath);
      this.logger.debug({ key }, "File deleted");
    } catch (error) {
      // No-op if file doesn't exist
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  async deletePrefix(prefix: string): Promise<number> {
    // Validate prefix (similar to key validation but allow trailing slash)
    if (prefix.includes("..") || prefix.startsWith("/")) {
      throw new StorageInvalidKeyError(prefix, "Invalid prefix");
    }

    const dirPath = join(this.baseDir, prefix);
    const normalizedPath = normalize(dirPath);

    // Ensure the path is within baseDir
    const relativePath = relative(this.baseDir, normalizedPath);
    if (relativePath.startsWith("..")) {
      throw new StorageInvalidKeyError(
        prefix,
        "Path traversal attempt detected",
      );
    }

    let count = 0;

    try {
      // Count files before deletion
      count = await this.countFilesRecursive(normalizedPath);

      // Delete the directory recursively
      await rm(normalizedPath, { recursive: true, force: true });

      this.logger.debug({ prefix, count }, "Prefix deleted");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return count;
  }

  /**
   * Count files recursively in a directory (excluding metadata files)
   */
  private async countFilesRecursive(dirPath: string): Promise<number> {
    let count = 0;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          count += await this.countFilesRecursive(entryPath);
        } else if (entry.isFile() && !isMetadataFile(entry.name)) {
          count++;
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return count;
  }

  // ---- List Operations ----

  async list(options?: ListOptions): Promise<ListResult> {
    const prefix = options?.prefix ?? "";
    const limit = options?.limit ?? 1000;
    const offset = options?.cursor ? parseInt(options.cursor, 10) : 0;

    // Validate prefix
    if (prefix.includes("..")) {
      throw new StorageInvalidKeyError(prefix, "Invalid prefix");
    }

    const searchDir = prefix ? join(this.baseDir, prefix) : this.baseDir;
    const normalizedSearch = normalize(searchDir);

    // Ensure within baseDir
    const relativePath = relative(this.baseDir, normalizedSearch);
    if (relativePath.startsWith("..")) {
      throw new StorageInvalidKeyError(
        prefix,
        "Path traversal attempt detected",
      );
    }

    const keys: string[] = [];
    await this.collectKeys(normalizedSearch, "", keys);

    // Apply pagination
    const paginatedKeys = keys.slice(offset, offset + limit);
    const hasMore = offset + limit < keys.length;

    return {
      keys: paginatedKeys.map((k) => (prefix ? prefix + k : k)),
      nextCursor: hasMore ? String(offset + limit) : undefined,
    };
  }

  /**
   * Recursively collect keys from a directory
   */
  private async collectKeys(
    basePath: string,
    relativePath: string,
    keys: string[],
  ): Promise<void> {
    try {
      const entries = await readdir(basePath, { withFileTypes: true });

      for (const entry of entries) {
        const entryRelativePath = relativePath
          ? `${relativePath}/${entry.name}`
          : entry.name;
        const entryFullPath = join(basePath, entry.name);

        if (entry.isDirectory()) {
          await this.collectKeys(entryFullPath, entryRelativePath, keys);
        } else if (entry.isFile() && !isMetadataFile(entry.name)) {
          keys.push(entryRelativePath);
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }
  }

  // ---- Statistics ----

  async stats(prefix: string): Promise<StorageStats> {
    // Validate prefix
    if (prefix.includes("..")) {
      throw new StorageInvalidKeyError(prefix, "Invalid prefix");
    }

    const searchDir = prefix ? join(this.baseDir, prefix) : this.baseDir;
    const normalizedSearch = normalize(searchDir);

    // Ensure within baseDir
    const relativePath = relative(this.baseDir, normalizedSearch);
    if (relativePath.startsWith("..") && relativePath !== "") {
      throw new StorageInvalidKeyError(
        prefix,
        "Path traversal attempt detected",
      );
    }

    return await this.calculateStats(normalizedSearch);
  }

  /**
   * Calculate storage statistics for a directory
   */
  private async calculateStats(dirPath: string): Promise<StorageStats> {
    let count = 0;
    let size = 0;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
          const subStats = await this.calculateStats(entryPath);
          count += subStats.count;
          size += subStats.size;
        } else if (entry.isFile() && !isMetadataFile(entry.name)) {
          const fileStat = await stat(entryPath);
          count++;
          size += fileStat.size;
        }
      }
    } catch {
      // Directory doesn't exist or not readable
    }

    return { count, size };
  }

  // ---- Lifecycle ----

  async close(): Promise<void> {
    // No resources to release for local storage
    this.logger.debug({}, "LocalStorage closed");
  }
}
