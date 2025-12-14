/**
 * @eclaire/queue/core - Error types for the queue system
 *
 * These error types are used to communicate specific failure modes
 * to the queue driver, allowing it to handle them appropriately.
 */

/**
 * Base class for all queue-related errors
 */
export class QueueError extends Error {
  /** Error code for programmatic handling */
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "QueueError";
    this.code = code;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Thrown when a job encounters rate limiting
 *
 * This error tells the queue driver to reschedule the job for later
 * WITHOUT counting it as a failed attempt. The job will be retried
 * after the specified delay.
 *
 * @example
 * ```typescript
 * async function processBookmark(ctx: JobContext<BookmarkData>) {
 *   const { url } = ctx.job.data;
 *
 *   const rateLimitInfo = await checkRateLimit(url);
 *   if (rateLimitInfo.limited) {
 *     // Reschedule without counting as failure
 *     throw new RateLimitError(rateLimitInfo.retryAfter);
 *   }
 *
 *   // Process the bookmark...
 * }
 * ```
 */
export class RateLimitError extends QueueError {
  /** How long to wait before retrying (milliseconds) */
  readonly retryAfter: number;

  constructor(retryAfter: number, message?: string) {
    super(
      message || `Rate limited, retry after ${retryAfter}ms`,
      "RATE_LIMITED",
    );
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when a job fails but should be retried
 *
 * This is an explicit way to signal that the error is transient
 * and the job should be retried (if attempts remain). The queue
 * driver will apply the configured backoff strategy.
 *
 * @example
 * ```typescript
 * async function processImage(ctx: JobContext<ImageData>) {
 *   try {
 *     await uploadToStorage(ctx.job.data);
 *   } catch (error) {
 *     if (isNetworkError(error)) {
 *       // Network errors are transient, retry
 *       throw new RetryableError(`Network error: ${error.message}`);
 *     }
 *     throw error;
 *   }
 * }
 * ```
 */
export class RetryableError extends QueueError {
  constructor(message: string) {
    super(message, "RETRYABLE");
    this.name = "RetryableError";
  }
}

/**
 * Thrown when a job fails permanently and should NOT be retried
 *
 * Use this when you know the error cannot be resolved by retrying,
 * such as invalid input data, missing resources, or business logic errors.
 *
 * @example
 * ```typescript
 * async function processDocument(ctx: JobContext<DocumentData>) {
 *   const { documentId } = ctx.job.data;
 *
 *   const doc = await getDocument(documentId);
 *   if (!doc) {
 *     // Document doesn't exist - no point retrying
 *     throw new PermanentError(`Document ${documentId} not found`);
 *   }
 *
 *   // Process the document...
 * }
 * ```
 */
export class PermanentError extends QueueError {
  constructor(message: string) {
    super(message, "PERMANENT");
    this.name = "PermanentError";
  }
}

/**
 * Thrown when a job times out during processing
 *
 * This is typically thrown by the queue driver, not user code.
 * It indicates the job exceeded its allowed processing time.
 */
export class JobTimeoutError extends QueueError {
  /** The job ID that timed out */
  readonly jobId: string;

  /** The timeout duration (milliseconds) */
  readonly timeout: number;

  constructor(jobId: string, timeout: number) {
    super(`Job ${jobId} timed out after ${timeout}ms`, "JOB_TIMEOUT");
    this.name = "JobTimeoutError";
    this.jobId = jobId;
    this.timeout = timeout;
  }
}

/**
 * Thrown when a job is not found
 */
export class JobNotFoundError extends QueueError {
  /** The ID or key that was not found */
  readonly jobIdOrKey: string;

  constructor(jobIdOrKey: string) {
    super(`Job not found: ${jobIdOrKey}`, "JOB_NOT_FOUND");
    this.name = "JobNotFoundError";
    this.jobIdOrKey = jobIdOrKey;
  }
}

/**
 * Thrown when attempting to replace a job that is currently being processed
 *
 * This error is thrown when enqueuing with `replace: 'if_not_active'` and
 * a job with the same (name, key) is currently in the 'processing' state.
 */
export class JobAlreadyActiveError extends QueueError {
  /** The queue/job type name */
  readonly queueName: string;

  /** The idempotency key of the active job */
  readonly key: string;

  /** The ID of the active job */
  readonly jobId: string;

  constructor(queueName: string, key: string, jobId: string) {
    super(
      `Cannot replace job: a job with key '${key}' in queue '${queueName}' is currently being processed (id: ${jobId})`,
      "JOB_ALREADY_ACTIVE",
    );
    this.name = "JobAlreadyActiveError";
    this.queueName = queueName;
    this.key = key;
    this.jobId = jobId;
  }
}

/**
 * Thrown when there's a connection error to the queue backend
 */
export class ConnectionError extends QueueError {
  /** The underlying error that caused the connection failure */
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "CONNECTION_ERROR");
    this.name = "ConnectionError";
    this.cause = cause;
  }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an error is a RateLimitError
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

/**
 * Check if an error is a RetryableError
 */
export function isRetryableError(error: unknown): error is RetryableError {
  return error instanceof RetryableError;
}

/**
 * Check if an error is a PermanentError
 */
export function isPermanentError(error: unknown): error is PermanentError {
  return error instanceof PermanentError;
}

/**
 * Check if an error is any QueueError
 */
export function isQueueError(error: unknown): error is QueueError {
  return error instanceof QueueError;
}

/**
 * Check if an error is a JobAlreadyActiveError
 */
export function isJobAlreadyActiveError(
  error: unknown,
): error is JobAlreadyActiveError {
  return error instanceof JobAlreadyActiveError;
}

/**
 * Extract rate limit delay from an error, if applicable
 *
 * @param error - The error to check
 * @returns Delay in milliseconds, or null if not a rate limit error
 */
export function getRateLimitDelay(error: unknown): number | null {
  if (isRateLimitError(error)) {
    return error.retryAfter;
  }
  return null;
}

/**
 * Create a RateLimitError from a delay value
 *
 * Convenience function for creating rate limit errors
 *
 * @param delay - Delay in milliseconds
 * @param message - Optional custom message
 */
export function createRateLimitError(
  delay: number,
  message?: string,
): RateLimitError {
  return new RateLimitError(delay, message);
}
