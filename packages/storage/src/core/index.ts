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
// Key safety utilities (generic — no opinion on key structure)
export {
  assertSafeKey,
  assertSafePrefix,
  isSafeKey,
  isSafePrefix,
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
export { buildObjectMetadata, noopLogger } from "./types.js";
