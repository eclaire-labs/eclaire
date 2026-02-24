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
  if (parts.length < 4) return null;

  return {
    userId: parts[0]!,
    category: parts[1]!,
    assetId: parts[2]!,
    // fileName can include nested paths (e.g., 'images/img1.jpg')
    fileName: parts.slice(3).join("/"),
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
 * Validate a full storage key
 *
 * @param key - Storage key to validate
 * @returns true if valid, false otherwise
 */
export function isValidKey(key: string): boolean {
  if (!key || key.startsWith("/") || key.includes("..")) {
    return false;
  }

  const parts = key.split("/");
  if (parts.length < 4) {
    return false;
  }

  // Check first 3 components (userId, category, assetId)
  for (let i = 0; i < 3; i++) {
    if (!isValidKeyComponent(parts[i]!)) {
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
