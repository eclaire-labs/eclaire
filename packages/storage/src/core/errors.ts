/**
 * Storage error classes
 */

/**
 * Base error class for all storage errors
 */
export class StorageError extends Error {
  override readonly name: string = "StorageError";
}

/**
 * Thrown when an object is not found
 */
export class StorageNotFoundError extends StorageError {
  override readonly name = "StorageNotFoundError";

  constructor(public readonly key: string) {
    super(`Object not found: ${key}`);
  }
}

/**
 * Thrown when access to a key is denied
 */
export class StorageAccessDeniedError extends StorageError {
  override readonly name = "StorageAccessDeniedError";

  constructor(
    public readonly key: string,
    message?: string,
  ) {
    super(message || `Access denied: ${key}`);
  }
}

/**
 * Thrown when storage quota is exceeded
 */
export class StorageQuotaExceededError extends StorageError {
  override readonly name = "StorageQuotaExceededError";

  constructor(message?: string) {
    super(message || "Storage quota exceeded");
  }
}

/**
 * Thrown when a key is invalid (e.g., path traversal attempt)
 */
export class StorageInvalidKeyError extends StorageError {
  override readonly name = "StorageInvalidKeyError";

  constructor(
    public readonly key: string,
    message?: string,
  ) {
    super(message || `Invalid storage key: ${key}`);
  }
}
