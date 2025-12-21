/**
 * @eclaire/storage/core - Zero-dependency core types
 *
 * This module exports only types and pure functions with no external dependencies.
 * It can be imported by any module without bringing in adapter-specific code.
 */

// Types
export type {
  ObjectMetadata,
  StorageObject,
  WriteOptions,
  ListOptions,
  ListResult,
  StorageStats,
  StorageLogger,
  StorageConfig,
  Storage,
} from "./types.js";

// Errors
export {
  StorageError,
  StorageNotFoundError,
  StorageAccessDeniedError,
  StorageQuotaExceededError,
  StorageInvalidKeyError,
} from "./errors.js";

// Key utilities
export type { ParsedKey } from "./keys.js";
export {
  buildKey,
  parseKey,
  assetPrefix,
  categoryPrefix,
  userPrefix,
  isValidKey,
  isValidKeyComponent,
  sanitizeKeyComponent,
} from "./keys.js";
