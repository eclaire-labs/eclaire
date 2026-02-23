/**
 * Utility functions for job processing
 */

/**
 * Creates a rate limit error that BullMQ can recognize
 * @param delayMs - The delay in milliseconds before retry
 * @returns Error object with rate limit information
 */
export function createRateLimitError(delayMs: number): Error {
  // biome-ignore lint/suspicious/noExplicitAny: extending Error with custom properties for BullMQ rate limiting
  const error = new Error("bullmq:rateLimitExceeded") as any;
  error.name = "RateLimitError";
  error.delayMs = delayMs;
  return error;
}
