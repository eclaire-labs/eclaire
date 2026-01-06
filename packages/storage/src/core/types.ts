/**
 * @eclaire/storage/core - Zero-dependency core types for the storage system
 *
 * These interfaces define the contract that all storage adapters must implement.
 * They are designed to be generic and reusable across different backends.
 */

// ============================================================================
// Metadata Types
// ============================================================================

/**
 * Metadata stored with every object
 */
export interface ObjectMetadata {
  /** MIME type of the content */
  contentType: string;

  /** Size in bytes */
  size: number;

  /** When the object was created */
  createdAt: Date;

  /** When the object was last modified */
  updatedAt: Date;

  /** Custom application metadata (e.g., { originalFilename: 'doc.pdf' }) */
  custom?: Record<string, string>;
}

/**
 * Result returned when reading an object
 */
export interface StorageObject {
  /** The object data as a stream */
  stream: ReadableStream<Uint8Array>;

  /** Object metadata */
  metadata: ObjectMetadata;
}

/**
 * Options when writing an object
 */
export interface WriteOptions {
  /** MIME type (required) */
  contentType: string;

  /** Custom metadata key-value pairs */
  custom?: Record<string, string>;
}

// ============================================================================
// List and Stats Types
// ============================================================================

/**
 * Options for listing objects
 */
export interface ListOptions {
  /** Only list objects with this prefix */
  prefix?: string;

  /** Maximum number of results */
  limit?: number;

  /** Pagination cursor from previous response */
  cursor?: string;
}

/**
 * Result of listing objects
 */
export interface ListResult {
  /** Object keys matching the query */
  keys: string[];

  /** Cursor for next page (undefined if no more) */
  nextCursor?: string;
}

/**
 * Storage statistics for a path prefix
 */
export interface StorageStats {
  /** Total number of objects */
  count: number;

  /** Total size in bytes */
  size: number;
}

// ============================================================================
// Logger Interface
// ============================================================================

/**
 * Minimal logger interface required by storage adapters
 *
 * This allows adapters to log without depending on a specific logging library.
 * Users can provide any logger that implements this interface.
 */
export interface StorageLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Base storage configuration
 */
export interface StorageConfig {
  /** Logger instance */
  logger?: StorageLogger;
}

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Core storage interface - the "port" in ports & adapters
 *
 * All methods use structured path keys like:
 * - 'user-123/documents/doc-456/original.pdf'
 * - 'user-123/photos/photo-789/thumbnail.jpg'
 *
 * Keys are just strings - the storage layer doesn't know about asset types.
 */
export interface Storage {
  // ---- Write Operations ----

  /**
   * Write an object from a stream
   *
   * Creates parent "directories" implicitly (for local adapter).
   * Overwrites if the key already exists.
   *
   * @param key - Storage key (e.g., 'user-123/documents/doc-456/file.pdf')
   * @param stream - Data to write
   * @param options - Write options including contentType
   */
  write(
    key: string,
    stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
    options: WriteOptions,
  ): Promise<void>;

  /**
   * Write an object from a buffer
   *
   * Convenience method that wraps write().
   *
   * @param key - Storage key
   * @param buffer - Data to write
   * @param options - Write options including contentType
   */
  writeBuffer(
    key: string,
    buffer: Buffer,
    options: WriteOptions,
  ): Promise<void>;

  // ---- Read Operations ----

  /**
   * Read an object as a stream with metadata
   *
   * @param key - Storage key
   * @returns Object stream and metadata
   * @throws StorageNotFoundError if not found
   */
  read(key: string): Promise<StorageObject>;

  /**
   * Read an object as a buffer with metadata
   *
   * @param key - Storage key
   * @returns Buffer and metadata
   * @throws StorageNotFoundError if not found
   */
  readBuffer(
    key: string,
  ): Promise<{ buffer: Buffer; metadata: ObjectMetadata }>;

  /**
   * Get object metadata without reading content
   *
   * @param key - Storage key
   * @returns Metadata or null if not found
   */
  head(key: string): Promise<ObjectMetadata | null>;

  /**
   * Check if an object exists
   *
   * @param key - Storage key
   * @returns true if exists, false otherwise
   */
  exists(key: string): Promise<boolean>;

  // ---- Delete Operations ----

  /**
   * Delete a single object
   *
   * No-op if object doesn't exist (does not throw).
   *
   * @param key - Storage key
   */
  delete(key: string): Promise<void>;

  /**
   * Delete all objects with a given prefix
   *
   * Useful for deleting all files for an asset.
   *
   * @param prefix - Key prefix (e.g., 'user-123/documents/doc-456/')
   * @returns Number of objects deleted
   */
  deletePrefix(prefix: string): Promise<number>;

  // ---- List Operations ----

  /**
   * List objects matching a prefix
   *
   * @param options - List options (prefix, limit, cursor)
   * @returns Matching keys with optional pagination cursor
   */
  list(options?: ListOptions): Promise<ListResult>;

  // ---- Statistics ----

  /**
   * Get storage statistics for a prefix
   *
   * @param prefix - Key prefix (e.g., 'user-123/' for all user files)
   * @returns Count and total size of matching objects
   */
  stats(prefix: string): Promise<StorageStats>;

  // ---- Lifecycle ----

  /**
   * Close the storage client and release resources
   */
  close(): Promise<void>;
}
