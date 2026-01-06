/**
 * @eclaire/storage/core - Zero-dependency core types
 *
 * This module exports only types and pure functions with no external dependencies.
 * It can be imported by any module without bringing in adapter-specific code.
 */

// Errors
export {
  StorageAccessDeniedError,
  StorageError,
  StorageInvalidKeyError,
  StorageNotFoundError,
  StorageQuotaExceededError,
} from "./errors.js";
// Key utilities
export type { ParsedKey } from "./keys.js";
export {
  assetPrefix,
  buildKey,
  categoryPrefix,
  isValidKey,
  isValidKeyComponent,
  parseKey,
  sanitizeKeyComponent,
  userPrefix,
} from "./keys.js";
// Types
export type {
  ListOptions,
  ListResult,
  ObjectMetadata,
  Storage,
  StorageConfig,
  StorageLogger,
  StorageObject,
  StorageStats,
  WriteOptions,
} from "./types.js";
