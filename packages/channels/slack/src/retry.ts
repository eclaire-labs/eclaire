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
  "rate_limited",
  "ratelimited",
];

/**
 * Extracts the retry_after delay (in ms) from a Slack rate limit error, if present.
 */
export function getRetryAfterMs(err: unknown): number | null {
  if (!(err instanceof Error)) return null;

  // Slack Web API errors include retryAfter in the error data
  const slackError = err as Error & { data?: { retry_after?: number }; code?: string };
  if (slackError.code === "slack_webapi_rate_limited_error" || slackError.code === "rate_limited") {
    const retryAfter = slackError.data?.retry_after;
    if (typeof retryAfter === "number" && retryAfter > 0) {
      return retryAfter * 1000;
    }
    return 5000;
  }

  // Check error message for rate limiting
  if (err.message.toLowerCase().includes("rate_limited") || err.message.toLowerCase().includes("ratelimited")) {
    return 5000;
  }

  return null;
}

/**
 * Determines if an error is recoverable (worth retrying).
 * Includes Slack API rate limits and network errors.
 */
export function isRecoverableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  // Slack rate limit
  if (getRetryAfterMs(err) !== null) return true;

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

/**
 * Executes a function with exponential backoff retry for recoverable errors.
 */
export async function withRetry<T>(
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

      // Use retry_after from Slack 429 if available, otherwise exponential backoff
      const retryAfter = getRetryAfterMs(err);
      const backoff = retryAfter ?? Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = backoff * 0.1 * Math.random();
      const delay = backoff + jitter;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
