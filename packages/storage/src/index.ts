/**
 * @eclaire/storage - Storage abstraction with multiple backend support
 *
 * This package provides a unified interface for object storage with
 * support for local filesystem and in-memory backends.
 *
 * ## Usage
 *
 * Import core types and safety utilities:
 * ```typescript
 * import type { Storage, ObjectMetadata } from '@eclaire/storage';
 * ```
 *
 * Import adapters from their specific paths:
 * ```typescript
 * import { LocalStorage } from '@eclaire/storage/local';
 * import { MemoryStorage } from '@eclaire/storage/memory';
 * ```
 *
 * Import opinionated key helpers (optional):
 * ```typescript
 * import { buildKey, parseKey, assetPrefix } from '@eclaire/storage/keys';
 * ```
 */

// Re-export everything from core
export * from "./core/index.js";

// Re-export key helpers for convenience (also available via @eclaire/storage/keys)
export * from "./keys/index.js";
