/**
 * Storage factory for the backend
 *
 * Provides a centralized way to get a storage instance with proper configuration.
 * Supports multiple backends via STORAGE_BACKEND environment variable.
 */

import type { Storage, StorageLogger } from "@eclaire/storage/core";
import { LocalStorage } from "@eclaire/storage/local";
import { createChildLogger } from "../logger.js";

// Re-export key utilities for convenience
export {
  buildKey,
  parseKey,
  assetPrefix,
  categoryPrefix,
  userPrefix,
} from "@eclaire/storage/core";

// Re-export types
export type {
  Storage,
  ObjectMetadata,
  StorageObject,
  WriteOptions,
  ListOptions,
  ListResult,
  StorageStats,
} from "@eclaire/storage/core";

// Re-export errors
export {
  StorageError,
  StorageNotFoundError,
  StorageAccessDeniedError,
  StorageInvalidKeyError,
} from "@eclaire/storage/core";

// Create a pino-compatible logger adapter
const pinoLogger = createChildLogger("storage");
const storageLogger: StorageLogger = {
  debug: (obj, msg) => pinoLogger.debug(obj, msg),
  info: (obj, msg) => pinoLogger.info(obj, msg),
  warn: (obj, msg) => pinoLogger.warn(obj, msg),
  error: (obj, msg) => pinoLogger.error(obj, msg),
};

let storageInstance: Storage | null = null;

/**
 * Get the storage base directory from environment variables
 */
function getBaseDir(): string {
  // Priority: STORAGE_PATH > USERS_DIR > WORKER_SHARED_DATA_PATH > ./data
  return (
    process.env.STORAGE_PATH ||
    process.env.USERS_DIR ||
    process.env.WORKER_SHARED_DATA_PATH ||
    "./data"
  );
}

/**
 * Get the configured storage backend
 */
function getBackend(): "local" | "s3" {
  const backend = process.env.STORAGE_BACKEND || "local";
  if (backend !== "local" && backend !== "s3") {
    throw new Error(`Unknown storage backend: ${backend}. Supported: local, s3`);
  }
  return backend;
}

/**
 * Get the storage instance
 *
 * Creates and caches a storage instance based on the STORAGE_BACKEND env var.
 * Currently supports:
 * - local: Local filesystem storage (default)
 * - s3: S3-compatible storage (not yet implemented)
 *
 * @returns Storage instance
 */
export function getStorage(): Storage {
  if (storageInstance) {
    return storageInstance;
  }

  const backend = getBackend();

  switch (backend) {
    case "local":
      storageInstance = new LocalStorage({
        baseDir: getBaseDir(),
        logger: storageLogger,
      });
      break;

    case "s3":
      throw new Error(
        "S3 storage backend is not yet implemented. Use STORAGE_BACKEND=local or omit the variable.",
      );

    default:
      throw new Error(`Unknown storage backend: ${backend}`);
  }

  pinoLogger.info({ backend, baseDir: getBaseDir() }, "Storage initialized");

  return storageInstance;
}

/**
 * Reset the storage instance (useful for testing)
 */
export async function resetStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.close();
    storageInstance = null;
  }
}
