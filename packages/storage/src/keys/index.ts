/**
 * @eclaire/storage/keys - Opinionated key helpers
 *
 * Utilities for building and parsing storage keys following the
 * `{userId}/{category}/{assetId}/{fileName}` convention.
 *
 * These are optional helpers — the Storage interface works with any string key.
 * Import from `@eclaire/storage/core` for generic safety validators instead.
 */

export type { ParsedKey } from "../core/keys.js";
export {
  assetPrefix,
  buildKey,
  categoryPrefix,
  isValidKey,
  isValidKeyComponent,
  parseKey,
  sanitizeKeyComponent,
  userPrefix,
} from "../core/keys.js";
