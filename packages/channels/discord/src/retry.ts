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
 * Determines if an error is recoverable (worth retrying).
 * discord.js handles API rate limits internally, so this focuses on network errors.
 */
export function isRecoverableError(err: unknown): boolean {
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

      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = backoff * 0.1 * Math.random();
      const delay = backoff + jitter;

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
