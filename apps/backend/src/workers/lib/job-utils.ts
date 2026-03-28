/**
 * Utility functions for job processing
 */

/**
 * Creates a rate limit error for the queue worker
 * @param delayMs - The delay in milliseconds before retry
 * @returns Error object with rate limit information
 */
export function createRateLimitError(delayMs: number): Error {
  // biome-ignore lint/suspicious/noExplicitAny: extending Error with custom properties for rate limiting
  const error = new Error("rateLimitExceeded") as any;
  error.name = "RateLimitError";
  error.delayMs = delayMs;
  return error;
}
