/**
 * Retry engine shared by all channel adapters.
 *
 * The backoff loop and network-error classification live here; each adapter
 * supplies platform-specific classifiers via `createRetry()`:
 * - `isRecoverable`: extra recoverable check (e.g. a platform 429 error)
 * - `isNonRecoverable`: veto, checked first (e.g. Slack auth errors)
 * - `getRetryAfterMs`: extract a server-mandated retry delay from an error
 */

const RECOVERABLE_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENETUNREACH",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const RECOVERABLE_NAMES = new Set([
  "AbortError",
  "TimeoutError",
  "ConnectTimeoutError",
  "BodyTimeoutError",
]);

const RECOVERABLE_MESSAGE_PATTERNS = [
  "timeout",
  "network error",
  "socket hang up",
  "getaddrinfo",
  "network request failed",
];

/**
 * Determines if an error looks like a transient network failure
 * (connection resets, DNS failures, timeouts).
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Node.js network error codes
  const code = (err as NodeJS.ErrnoException).code;
  if (code && RECOVERABLE_CODES.has(code)) return true;

  // Error name classification
  if (RECOVERABLE_NAMES.has(err.name)) return true;

  // Message pattern matching
  const msg = err.message.toLowerCase();
  return RECOVERABLE_MESSAGE_PATTERNS.some((pattern) => msg.includes(pattern));
}

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (error: unknown, attempt: number) => void;
}

export interface RetryConfig {
  /** Extra platform-specific recoverable check, in addition to isNetworkError. */
  isRecoverable?: (err: unknown) => boolean;
  /** Platform-specific veto (e.g. auth errors). Checked first; wins over everything. */
  isNonRecoverable?: (err: unknown) => boolean;
  /** Extract a server-mandated retry delay (ms) from a 429-style error. */
  getRetryAfterMs?: (err: unknown) => number | null;
}

/**
 * Create a retry helper with platform-specific error classification.
 *
 * Delay semantics: a server-provided `retry_after` is respected exactly;
 * jitter is only applied to the synthetic exponential backoff.
 */
export function createRetry(config: RetryConfig = {}): {
  withRetry: <T>(fn: () => Promise<T>, opts?: RetryOptions) => Promise<T>;
  isRecoverableError: (err: unknown) => boolean;
} {
  function isRecoverableError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    if (config.isNonRecoverable?.(err)) return false;
    if (config.isRecoverable?.(err)) return true;
    return isNetworkError(err);
  }

  async function withRetry<T>(
    fn: () => Promise<T>,
    opts?: RetryOptions,
  ): Promise<T> {
    const maxAttempts = opts?.maxAttempts ?? 3;
    const baseDelayMs = opts?.baseDelayMs ?? 1000;
    const maxDelayMs = opts?.maxDelayMs ?? 30_000;

    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;

        if (attempt === maxAttempts || !isRecoverableError(err)) {
          throw err;
        }

        opts?.onRetry?.(err, attempt);

        // Use retry_after from the platform's 429 response if available,
        // otherwise exponential backoff with jitter
        const retryAfter = config.getRetryAfterMs?.(err) ?? null;
        const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
        const jitter = backoff * 0.1 * Math.random();
        const delay = retryAfter ?? backoff + jitter;

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }

  return { withRetry, isRecoverableError };
}
