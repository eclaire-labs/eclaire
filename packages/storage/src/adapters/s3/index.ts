/**
 * S3-compatible storage adapter
 *
 * TODO: Implement when needed. This is a placeholder for future S3 support.
 */

import type {
  Storage,
  StorageConfig,
  StorageObject,
  ObjectMetadata,
  WriteOptions,
  ListOptions,
  ListResult,
  StorageStats,
} from "../../core/types.js";

/**
 * S3 storage configuration
 */
export interface S3StorageConfig extends StorageConfig {
  /** S3 bucket name */
  bucket: string;

  /** AWS region */
  region: string;

  /** Optional endpoint for S3-compatible services (MinIO, R2, etc.) */
  endpoint?: string;

  /** Optional key prefix within the bucket */
  prefix?: string;

  /** AWS credentials (uses default chain if not provided) */
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * S3-compatible storage implementation
 *
 * TODO: Implement using @aws-sdk/client-s3
 */
export class S3Storage implements Storage {
  constructor(_config: S3StorageConfig) {
    throw new Error("S3Storage is not yet implemented. Use LocalStorage or MemoryStorage.");
  }

  write(
    _key: string,
    _stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream,
    _options: WriteOptions,
  ): Promise<void> {
    throw new Error("Not implemented");
  }

  writeBuffer(_key: string, _buffer: Buffer, _options: WriteOptions): Promise<void> {
    throw new Error("Not implemented");
  }

  read(_key: string): Promise<StorageObject> {
    throw new Error("Not implemented");
  }

  readBuffer(_key: string): Promise<{ buffer: Buffer; metadata: ObjectMetadata }> {
    throw new Error("Not implemented");
  }

  head(_key: string): Promise<ObjectMetadata | null> {
    throw new Error("Not implemented");
  }

  exists(_key: string): Promise<boolean> {
    throw new Error("Not implemented");
  }

  delete(_key: string): Promise<void> {
    throw new Error("Not implemented");
  }

  deletePrefix(_prefix: string): Promise<number> {
    throw new Error("Not implemented");
  }

  list(_options?: ListOptions): Promise<ListResult> {
    throw new Error("Not implemented");
  }

  stats(_prefix: string): Promise<StorageStats> {
    throw new Error("Not implemented");
  }

  close(): Promise<void> {
    throw new Error("Not implemented");
  }
}
