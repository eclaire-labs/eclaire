/**
 * Storage error classes
 */

/**
 * Base error class for all storage errors
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "StorageError";
    // Maintain proper stack trace for V8 engines
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when an object is not found
 */
export class StorageNotFoundError extends StorageError {
  constructor(public readonly key: string) {
    super(`Object not found: ${key}`);
    this.name = "StorageNotFoundError";
  }
}

/**
 * Thrown when access to a key is denied
 */
export class StorageAccessDeniedError extends StorageError {
  constructor(
    public readonly key: string,
    message?: string,
  ) {
    super(message || `Access denied: ${key}`);
    this.name = "StorageAccessDeniedError";
  }
}

/**
 * Thrown when storage quota is exceeded
 */
export class StorageQuotaExceededError extends StorageError {
  constructor(message?: string) {
    super(message || "Storage quota exceeded");
    this.name = "StorageQuotaExceededError";
  }
}

/**
 * Thrown when a key is invalid (e.g., path traversal attempt)
 */
export class StorageInvalidKeyError extends StorageError {
  constructor(
    public readonly key: string,
    message?: string,
  ) {
    super(message || `Invalid storage key: ${key}`);
    this.name = "StorageInvalidKeyError";
  }
}
