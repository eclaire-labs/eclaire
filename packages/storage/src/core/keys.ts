import { StorageInvalidKeyError } from "./errors.js";

/**
 * Key utilities for building and parsing storage keys
 *
 * Keys follow the pattern: {userId}/{category}/{assetId}/{fileName}
 * Examples:
 * - 'user-123/documents/doc-456/original.pdf'
 * - 'user-123/photos/photo-789/thumbnail.jpg'
 * - 'user-123/bookmarks/bm-abc/screenshot.png'
 */

/**
 * Parsed key components
 */
export interface ParsedKey {
  userId: string;
  category: string;
  assetId: string;
  fileName: string;
}

/**
 * Build a storage key from components
 *
 * @param userId - User identifier
 * @param category - Asset category (e.g., 'documents', 'photos')
 * @param assetId - Asset identifier
 * @param fileName - File name (can include nested path like 'images/img1.jpg')
 * @returns Storage key
 *
 * @example
 * buildKey('user-123', 'documents', 'doc-456', 'original.pdf')
 * // => 'user-123/documents/doc-456/original.pdf'
 *
 * buildKey('user-123', 'bookmarks', 'bm-789', 'images/img1.jpg')
 * // => 'user-123/bookmarks/bm-789/images/img1.jpg'
 */
export function buildKey(
  userId: string,
  category: string,
  assetId: string,
  fileName: string,
): string {
  return `${userId}/${category}/${assetId}/${fileName}`;
}

/**
 * Parse a storage key into components
 *
 * @param key - Storage key
 * @returns Parsed components or null if invalid format
 *
 * @example
 * parseKey('user-123/documents/doc-456/original.pdf')
 * // => { userId: 'user-123', category: 'documents', assetId: 'doc-456', fileName: 'original.pdf' }
 *
 * parseKey('user-123/bookmarks/bm-789/images/img1.jpg')
 * // => { userId: 'user-123', category: 'bookmarks', assetId: 'bm-789', fileName: 'images/img1.jpg' }
 */
export function parseKey(key: string): ParsedKey | null {
  const parts = key.split("/");
  const [userId, category, assetId, ...rest] = parts;
  if (!userId || !category || !assetId || rest.length === 0) return null;

  return {
    userId,
    category,
    assetId,
    // fileName can include nested paths (e.g., 'images/img1.jpg')
    fileName: rest.join("/"),
  };
}

/**
 * Build prefix for listing all files of an asset
 *
 * @param userId - User identifier
 * @param category - Asset category
 * @param assetId - Asset identifier
 * @returns Prefix ending with '/'
 *
 * @example
 * assetPrefix('user-123', 'documents', 'doc-456')
 * // => 'user-123/documents/doc-456/'
 */
export function assetPrefix(
  userId: string,
  category: string,
  assetId: string,
): string {
  return `${userId}/${category}/${assetId}/`;
}

/**
 * Build prefix for listing all assets of a category for a user
 *
 * @param userId - User identifier
 * @param category - Asset category
 * @returns Prefix ending with '/'
 *
 * @example
 * categoryPrefix('user-123', 'documents')
 * // => 'user-123/documents/'
 */
export function categoryPrefix(userId: string, category: string): string {
  return `${userId}/${category}/`;
}

/**
 * Build prefix for listing all storage for a user
 *
 * @param userId - User identifier
 * @returns Prefix ending with '/'
 *
 * @example
 * userPrefix('user-123')
 * // => 'user-123/'
 */
export function userPrefix(userId: string): string {
  return `${userId}/`;
}

// ============================================================================
// Generic safety validators (used by adapters — no opinion on key structure)
// ============================================================================

/**
 * Check if a key is safe for storage operations.
 *
 * This is a **generic safety check** — it prevents path traversal and
 * other dangerous patterns but does NOT enforce any particular key structure.
 * Adapters should use this for key validation.
 *
 * @param key - Storage key to validate
 * @returns true if safe, false if dangerous
 */
export function isSafeKey(key: string): boolean {
  if (!key || key.startsWith("/") || key.startsWith("\\")) return false;
  if (key.includes("..")) return false;

  // Every segment must be non-empty (no "a//b")
  const parts = key.split("/");
  return parts.every((p) => p.length > 0 && p !== "." && p !== "..");
}

/**
 * Check if a prefix is safe for storage operations.
 *
 * Similar to {@link isSafeKey} but allows trailing slash and empty string
 * (which means "list everything").
 */
export function isSafePrefix(prefix: string): boolean {
  if (!prefix) return true; // empty prefix = list all
  if (prefix.startsWith("/") || prefix.startsWith("\\")) return false;
  if (prefix.includes("..")) return false;
  return true;
}

/**
 * Assert a key is safe, throwing {@link StorageInvalidKeyError} if not.
 *
 * Convenience wrapper used by adapters to validate keys before operations.
 */
export function assertSafeKey(key: string): void {
  if (!isSafeKey(key)) {
    throw new StorageInvalidKeyError(
      key,
      "Invalid storage key format or path traversal attempt",
    );
  }
}

/**
 * Assert a prefix is safe, throwing {@link StorageInvalidKeyError} if not.
 *
 * Convenience wrapper used by adapters to validate prefixes before operations.
 */
export function assertSafePrefix(prefix: string): void {
  if (!isSafePrefix(prefix)) {
    throw new StorageInvalidKeyError(prefix, "Invalid prefix");
  }
}

// ============================================================================
// Domain-specific validators (optional — for apps using the userId/category/assetId/fileName convention)
// ============================================================================

/**
 * Validate a key component (prevent path traversal)
 *
 * @param component - Key component to validate
 * @returns true if valid, false otherwise
 */
export function isValidKeyComponent(component: string): boolean {
  // Reject empty, '.', '..', or components with path separators
  if (!component || component === "." || component === "..") {
    return false;
  }
  // Reject absolute paths or path traversal attempts
  if (
    component.includes("..") ||
    component.startsWith("/") ||
    component.startsWith("\\")
  ) {
    return false;
  }
  return true;
}

/**
 * Validate a full storage key against the domain convention:
 * `{userId}/{category}/{assetId}/{fileName}`
 *
 * This is stricter than {@link isSafeKey} — it requires at least 4 path segments.
 * Use this in application code when you want to enforce the key structure.
 * Adapters use {@link isSafeKey} instead so the package stays generic.
 *
 * @param key - Storage key to validate
 * @returns true if valid, false otherwise
 */
export function isValidKey(key: string): boolean {
  if (!isSafeKey(key)) return false;

  const parts = key.split("/");
  if (parts.length < 4) {
    return false;
  }

  // Check first 3 components (userId, category, assetId)
  for (let i = 0; i < 3; i++) {
    const part = parts[i];
    if (!part || !isValidKeyComponent(part)) {
      return false;
    }
  }

  // fileName can be a path, but still can't have '..'
  const fileName = parts.slice(3).join("/");
  if (!fileName || fileName.includes("..")) {
    return false;
  }

  return true;
}

/**
 * Sanitize a key component (remove dangerous characters)
 *
 * @param component - Component to sanitize
 * @returns Sanitized component
 */
export function sanitizeKeyComponent(component: string): string {
  return component
    .replace(/\.\./g, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\/+/g, "/")
    .trim();
}
